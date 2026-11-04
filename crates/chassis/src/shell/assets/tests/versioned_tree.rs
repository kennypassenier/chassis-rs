//! fix-warm-1: `/static/v-<asset_version>/…` is the same file as `/static/…`,
//! cached for good, so a kit page's relative module imports are not asked
//! again on a warm load (116 of 125 files revalidated per warm Status load on
//! 4.7.0, 1 after, Firefox). An old version's URL still answers, but must
//! revalidate: it gets today's file.

use super::*;

const IMMUTABLE: &str = "public, max-age=31536000, immutable";

fn under(root: &str, name: &str) -> String {
    format!("{}{name}", &root["/static/".len()..])
}

#[tokio::test]
async fn the_current_version_serves_the_file_for_good() {
    let res = serve(Path(under(versioned_root(), "chassis.js")), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()["cache-control"], IMMUTABLE);
}

#[tokio::test]
async fn an_old_version_answers_but_revalidates() {
    let res = serve(Path("v-0000000000000000/chassis.js".into()), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()["cache-control"], "no-cache");
    let res = serve(Path("v-0000000000000000/nope.js".into()), RawQuery(None)).await;
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[test]
fn the_map_sends_the_versioned_tree_to_the_one_bundle() {
    let tag = kp_map::tag();
    let root = versioned_root();
    let url = kp_map::bundle_url();
    for key in [
        format!("\"{root}kp/dist/kp-themes.min.js\":\"{url}\""),
        format!("\"{root}kp/dist/js/index.js\":\"{url}\""),
        format!("\"{root}kp/dist/js/\":\"{root}kp/dist/bundle/\""),
        format!("\"/static/kp/dist/js/\":\"{root}kp/dist/bundle/\""),
        format!("\"/static/kp/dist/bundle/\":\"{root}kp/dist/bundle/\""),
        format!("\"/static/kp/dist/kp-themes.min.js\":\"{url}\""),
    ] {
        assert!(tag.contains(&key), "{key} missing in {tag}");
    }
}
