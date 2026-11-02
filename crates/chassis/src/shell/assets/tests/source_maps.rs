//! Source maps are opt-in (`source-maps` feature, kpsplit-8): about 12.6 MB
//! of `.map` files that only devtools ever fetch. Without the feature the
//! tables carry none; the JavaScript and CSS stay byte-identical to the
//! vendored files (the manifest gate keeps proving that), so their
//! `sourceMappingURL` comment remains and a devtools request for the map is
//! a quiet 404 from `serve`.
//!
//! kp-themes 12.2.0 ships no `dist/js/*.map` in its release tarballs (the
//! pre-builds did), so the only map vendored is the old bundle's; the tests
//! use it. Maps for the split folder return when a release carries them.

use super::*;

fn map_rows() -> usize {
    all_assets().filter(|(n, _, _)| n.ends_with(".map")).count()
}

#[cfg(not(feature = "source-maps"))]
#[tokio::test]
async fn without_the_feature_no_map_is_embedded_and_a_map_request_is_a_404() {
    assert_eq!(map_rows(), 0, "the asset table holds no .map file");
    let res = serve(Path("kp/dist/kp-themes.min.js.map".into()), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[cfg(feature = "source-maps")]
#[tokio::test]
async fn with_the_feature_every_map_on_disk_is_embedded_and_served() {
    assert!(map_rows() > 0, "the asset table holds the maps");
    let res = serve(Path("kp/dist/kp-themes.min.js.map".into()), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()["content-type"], "application/json");
}
