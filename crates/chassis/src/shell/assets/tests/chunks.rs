//! The chunks of kp-themes' split module folder are named after their
//! content hash, so they are cached for a year with or without a `?v=`; the
//! entries (which keep their names) and everything else keep revalidating.

use super::*;

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// Some real `chunk-*.js` name from the embedded table.
fn a_chunk() -> &'static str {
    ASSETS
        .iter()
        .map(|(n, _, _)| *n)
        .find(|n| is_hashed_chunk(n))
        .expect("the split folder has chunks")
}

#[tokio::test]
async fn a_chunk_is_immutable_even_without_the_version_query() {
    let res = serve(Path(a_chunk().into()), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()["cache-control"], IMMUTABLE);
    assert!(
        !res.headers().contains_key("etag"),
        "no revalidation needed"
    );
}

#[tokio::test]
async fn entries_maps_and_the_loose_modules_still_revalidate() {
    for name in [
        "kp/dist/js/auto.js",
        "kp/dist/js/core.js",
        "kp/dist/js/lazy-register.js",
        "kp/dist/js/index.js",
        "kp/dist/kp-themes-base.min.css",
        "kp/dist/css/formal-register.min.css",
    ] {
        let res = serve(Path(name.into()), RawQuery(None)).await;
        assert_eq!(res.headers()["cache-control"], "no-cache", "{name}");
        assert!(res.headers().contains_key("etag"), "{name}");
    }
    let map = format!("{}.map", a_chunk());
    let res = serve(Path(map.clone()), RawQuery(None)).await;
    assert_eq!(res.headers()["cache-control"], "no-cache", "{map}");
}

#[test]
fn only_chunk_files_directly_in_the_split_folder_count() {
    assert!(is_hashed_chunk("kp/dist/js/chunk-ABC123.js"));
    assert!(!is_hashed_chunk("kp/dist/js/chunk-ABC123.js.map"));
    assert!(!is_hashed_chunk("kp/dist/js/auto.js"));
    assert!(!is_hashed_chunk("kp/dist/js/sub/chunk-ABC.js"));
    assert!(!is_hashed_chunk("kp/js/chunk-ABC.js"));
}

#[test]
fn every_chunk_a_split_entry_imports_is_a_hashed_chunk() {
    let (mut seen, mut stray) = (0, vec![]);
    for (name, _, _) in ASSETS
        .iter()
        .filter(|(n, _, _)| n.starts_with("kp/dist/js/"))
    {
        if name.ends_with(".js") && !is_hashed_chunk(name) {
            stray.push(*name);
        } else if is_hashed_chunk(name) {
            seen += 1;
        }
    }
    assert!(seen > 200, "{seen} chunks");
    assert_eq!(
        stray.len(),
        4,
        "only the four entries are unhashed: {stray:?}"
    );
}
