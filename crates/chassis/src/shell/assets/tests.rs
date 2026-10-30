//! Unit tests for `assets`; kept in their own file so the module stays small.

use super::*;
use sha2::{Digest, Sha256};

/// K15 gate: every vendored copy matches the recorded release hash —
/// the embedded files against the bytes the binary carries, the rest of
/// the vendored tree (font licences, `families.json`) against the file
/// on disk, so the whole tree is the tag it claims.
#[test]
fn vendored_kp_themes_match_the_manifest() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static/kp");
    let mut checked = 0;
    let mut embedded = 0;
    for line in KP_THEMES_MANIFEST.lines() {
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        let (hash, name) = line.split_once("  ").expect("sha256sum line");
        let key = format!("kp/{name}");
        let actual = match all_assets().find(|(n, _, _)| *n == key) {
            Some((_, _, body)) => {
                embedded += 1;
                hex::encode(Sha256::digest(body))
            }
            None => {
                let bytes = std::fs::read(root.join(name))
                    .unwrap_or_else(|e| panic!("manifest names {name}, missing on disk: {e}"));
                // Every served kind of file is embedded wherever the
                // kit serves assets (3.9.0: no longer only with `webapp`).
                assert!(
                    (!name.ends_with(".css")
                        && !name.ends_with(".js")
                        && !name.ends_with(".woff2")),
                    "{name} is a served kind of file but not embedded"
                );
                hex::encode(Sha256::digest(bytes))
            }
        };
        assert_eq!(
            actual, hash,
            "{name} differs from kp-themes v{KP_THEMES_VERSION}"
        );
        checked += 1;
    }
    let kp_assets = all_assets()
        .filter(|(n, _, _)| n.starts_with("kp/"))
        .count();
    assert_eq!(
        embedded, kp_assets,
        "every embedded kp/ asset is in the manifest and vice versa"
    );
    assert!(
        checked >= embedded,
        "the manifest covers at least the embedded files"
    );
    assert!(
        KP_THEMES_MANIFEST
            .lines()
            .next()
            .is_some_and(|l| l.contains(&format!("v{KP_THEMES_VERSION}"))),
        "the manifest's first line names the vendored version (the CLI reads it there)"
    );
}

/// K15: the vendored JavaScript is a closed import graph. One `import`
/// pointing at a module the binary does not carry is a 404 that takes
/// the whole module graph down — picker, confirmations, skip links.
/// kp-themes' own `gates/check-closure.mjs` guards the six modules it
/// knows this consumer bakes; this guards whatever the kit bakes,
/// effects.js included. Drilled red once by dropping `kp/js/strings.js`
/// from ASSETS: failed, restored.
#[test]
fn vendored_javascript_imports_only_vendored_modules() {
    let js: Vec<(&str, &str)> = all_assets()
        .filter(|(n, _, _)| n.ends_with(".js"))
        .map(|(n, _, b)| (*n, std::str::from_utf8(b).expect("utf-8")))
        .collect();
    assert!(js.iter().any(|(n, _)| *n == "kp/js/effects.js"));
    let mut checked = 0;
    for (name, body) in &js {
        let dir = name.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        for line in body.lines() {
            let line = line.trim();
            // Comments carry JSDoc type imports (`import('../effects.js').X`)
            // that load nothing.
            if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
                continue;
            }
            // kp-themes 7.0.0 loads the effect hooks with
            // `() => import('./effects/caret.js')`, which a static-only
            // reading would miss with all nine files absent.
            let mut targets: Vec<&str> = line
                .split("import(")
                .skip(1)
                .filter_map(|rest| rest.split(')').next())
                .map(str::trim)
                // Only a string literal loads a module; `import(x)`
                // with a variable is not something the kit can check.
                .filter(|t| t.starts_with(['\'', '"']))
                .map(|t| t.trim_matches(['\'', '"']))
                .collect();
            // `export function f(a, from = x)` has " from " too; a module
            // specifier is always a string literal.
            if (line.starts_with("import ") || line.starts_with("export "))
                && let Some(from) = line.split(" from ").nth(1)
                && from.trim_start().starts_with(['\'', '"'])
            {
                targets.push(from.trim().trim_end_matches(';').trim_matches(['\'', '"']));
            }
            for target in targets {
                let (base, rel) = if let Some(rel) = target.strip_prefix("../") {
                    (dir.rsplit_once('/').map(|(d, _)| d).unwrap_or(""), rel)
                } else if let Some(rel) = target.strip_prefix("./") {
                    (dir, rel)
                } else {
                    panic!("{name} imports {target}: only ./ and ../ imports are servable");
                };
                let key = if base.is_empty() {
                    rel.to_string()
                } else {
                    format!("{base}/{rel}")
                };
                assert!(
                    all_assets().any(|(n, _, _)| *n == key),
                    "{name} imports {target}, which the binary does not serve"
                );
                checked += 1;
            }
        }
    }
    assert!(
        checked >= 8,
        "the module graph has imports to check ({checked})"
    );
}

#[test]
fn version_hash_is_stable_and_changes_with_content() {
    assert_eq!(asset_version().len(), 16);
    assert_eq!(asset_version(), asset_version());
    let a = fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter());
    let b = fnv_version([("chassis.css", b"body{ }" as &[u8])].into_iter());
    let c = fnv_version([("other.css", b"body{}" as &[u8])].into_iter());
    assert_ne!(a, b, "one byte in a body changes every URL");
    assert_ne!(a, c, "a renamed asset changes every URL");
    assert_eq!(
        a,
        fnv_version([("chassis.css", b"body{}" as &[u8])].into_iter())
    );
}

#[tokio::test]
async fn serve_sets_immutable_cache_and_404s_unknown() {
    let versioned = RawQuery(Some("v=0123456789abcdef".into()));
    let res = serve(Path("chassis.css".into()), versioned).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    // fix-13: a URL without the hash (a font reached from fonts.css, a
    // project app importing /static/kp/js/…) is revalidated on every
    // load, so a kp-themes bump reaches an open tab at its next reload
    // instead of a day later.
    let res = serve(
        Path("kp/fonts/instrumentsans/instrumentsans-variable.woff2".into()),
        RawQuery(None),
    )
    .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()["cache-control"], "no-cache");
    assert_eq!(res.headers()["content-type"], "font/woff2");
    let etag = res.headers()["etag"].to_str().unwrap().to_string();
    let mut again = HeaderMap::new();
    again.insert(header::IF_NONE_MATCH, etag.parse().unwrap());
    let res = serve_conditional(
        Path("kp/fonts/instrumentsans/instrumentsans-variable.woff2".into()),
        RawQuery(None),
        again,
    )
    .await;
    assert_eq!(
        res.status(),
        StatusCode::NOT_MODIFIED,
        "unchanged: no body again"
    );
    assert_eq!(
        serve(Path("../etc/passwd".into()), RawQuery(None))
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
}

/// Every file under `static/` that `build.rs` embeds, as (relative path,
/// extension-mapped mime). Mirrors the build script's policy from the
/// outside: which kinds are served is what the extension map says, and the
/// vendored tree's licence texts, catalogue and manifest are not served.
fn embeddable_files() -> Vec<(String, &'static str)> {
    fn walk(root: &std::path::Path, dir: &std::path::Path, out: &mut Vec<String>) {
        for e in std::fs::read_dir(dir).expect("read_dir") {
            let p = e.expect("entry").path();
            if p.is_dir() {
                walk(root, &p, out);
            } else {
                let rel = p.strip_prefix(root).expect("under root");
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static");
    let mut files = Vec::new();
    walk(&root, &root, &mut files);
    files
        .into_iter()
        .filter_map(|f| {
            let mime = match f.rsplit('.').next()? {
                "css" => "text/css; charset=utf-8",
                "js" => "text/javascript; charset=utf-8",
                "woff2" => "font/woff2",
                _ => return None,
            };
            Some((f, mime))
        })
        .collect()
}

/// Generated tables: every servable file under `static/` is embedded with
/// its extension's mime, exactly once, and no table row names a file that
/// is not on disk (a stale row would be a build error, but the test pins
/// the contract from the outside too).
#[test]
fn generated_tables_cover_static_exactly() {
    let expected = embeddable_files();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("static");
    for (path, mime) in &expected {
        let rows: Vec<_> = all_assets().filter(|(n, _, _)| n == path).collect();
        assert_eq!(rows.len(), 1, "{path} is embedded exactly once");
        assert_eq!(
            rows[0].1, *mime,
            "{path} has the mime its extension maps to"
        );
    }
    for (name, _, body) in all_assets() {
        let on_disk = std::fs::read(root.join(name))
            .unwrap_or_else(|e| panic!("table names {name}, missing on disk: {e}"));
        assert_eq!(&on_disk[..], *body, "{name} embeds the file's bytes");
    }
    assert_eq!(all_assets().count(), expected.len(), "no extra rows");
}
