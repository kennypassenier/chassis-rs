//! Tests of the generated asset tables against the `static/` tree on disk.
//! Split from `tests` to keep each file small.

use super::*;

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
