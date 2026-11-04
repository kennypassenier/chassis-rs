//! The import map that gives a page one kp-themes runtime: what it maps, that
//! every target exists, and that the policy hash is the hash of the tag.

use super::*;
use base64::Engine as _;
use sha2::{Digest, Sha256};

fn map() -> serde_json::Value {
    let tag = kp_map::tag();
    let json = tag
        .strip_prefix("<script type=\"importmap\">")
        .and_then(|t| t.strip_suffix("</script>"))
        .expect("an importmap script");
    serde_json::from_str(json).expect("the map is JSON")
}

fn served(url: &str) -> bool {
    let name = url.trim_start_matches("/static/");
    let name = name.split('?').next().unwrap();
    all_assets().any(|(n, _, _)| *n == name)
}

#[test]
fn the_split_prefix_maps_to_the_facades_and_index_and_the_bundle_to_the_bundle() {
    let m = map();
    let imports = m["imports"].as_object().unwrap();
    let facades = format!("{}kp/dist/bundle/", versioned_root());
    assert_eq!(imports[SPLIT_PREFIX], facades.as_str());
    assert_eq!(imports["/static/kp/dist/js/index.js"], kp_map::bundle_url());
    assert_eq!(
        imports["/static/kp/dist/kp-themes.min.js"],
        kp_map::bundle_url()
    );
    assert_eq!(
        imports.len(),
        7,
        "no per-entry keys: the prefix does the work (3 keys, again under the versioned root, plus the facades)"
    );
}

#[test]
fn every_split_entry_the_prefix_covers_has_a_served_facade() {
    let (mut seen, mut missing) = (0, vec![]);
    for (name, _, _) in all_assets() {
        let Some(entry) = name.strip_prefix("kp/dist/js/") else {
            continue;
        };
        if !entry.ends_with(".js") || entry.starts_with("chunk-") || entry == "index.js" {
            continue;
        }
        seen += 1;
        if !served(&format!("{BUNDLE_FACADE_PREFIX}{entry}")) {
            missing.push(entry.to_string());
        }
    }
    assert!(seen > 100, "{seen} entries");
    assert!(missing.is_empty(), "entries without a facade: {missing:?}");
}

#[test]
fn a_facade_re_exports_from_the_bundle_url_the_map_rewrites() {
    let (_, _, body) = all_assets()
        .find(|(n, _, _)| *n == "kp/dist/bundle/auto.js")
        .expect("the boot facade is served");
    let text = std::str::from_utf8(body).unwrap();
    assert!(text.contains("from '../kp-themes.min.js'"), "{text}");
    assert!(served(kp_map::bundle_url()));
}

#[test]
fn the_policy_gains_the_hash_of_exactly_the_tag_text() {
    let tag = kp_map::tag();
    let json = tag
        .strip_prefix("<script type=\"importmap\">")
        .and_then(|t| t.strip_suffix("</script>"))
        .unwrap();
    let hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(json.as_bytes()));
    let csp = kp_map::csp_with_hash("default-src 'self'; script-src 'self'; style-src 'self'")
        .expect("script-src 'self' takes the hash");
    assert!(
        csp.contains(&format!("script-src 'self' 'sha256-{hash}';")),
        "{csp}"
    );
    assert!(!csp.contains("unsafe-inline"), "{csp}");
    assert_eq!(
        kp_map::csp_with_hash(&csp).as_deref(),
        Some(csp.as_str()),
        "idempotent"
    );
    assert!(kp_map::csp_with_hash("default-src 'none'").is_none());
}

#[tokio::test]
async fn the_bundle_url_serves_the_real_file_and_its_hashed_form_is_immutable() {
    let (_, _, body) = all_assets()
        .find(|(n, _, _)| *n == "kp/dist/kp-themes.min.js")
        .expect("bundle served");
    assert!(
        body.len() > 1_000_000,
        "the real bundle, not a facade: {} bytes",
        body.len()
    );
    let res = serve(
        Path("kp/dist/kp-themes.min.js".into()),
        RawQuery(Some(kp_map::bundle_url().split_once('?').unwrap().1.into())),
    )
    .await;
    assert_eq!(
        res.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
}
