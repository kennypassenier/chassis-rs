//! The GET share target refuses cross-site navigations; a POST one is
//! covered by the kit's CSRF rule.

use axum::Router;
use axum::body::Body;
use axum::http::Request;
use axum::routing::{get, post};
use tower::ServiceExt;

use super::share_guard::apply;

fn app() -> Router {
    apply(
        Router::new()
            .route("/capture", get(|| async { "saved" }))
            .route("/other", get(|| async { "other" })),
        "/capture".into(),
    )
}

async fn status(path: &str, headers: &[(&str, &str)]) -> u16 {
    let mut req = Request::get(path).header("host", "habits.example");
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    app()
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap()
        .status()
        .as_u16()
}

#[tokio::test]
async fn a_cross_site_get_share_is_refused() {
    for site in ["cross-site", "same-site"] {
        assert_eq!(
            status("/capture?text=x", &[("sec-fetch-site", site)]).await,
            403,
            "{site}"
        );
    }
    let referer = [("referer", "https://evil.example/page")];
    assert_eq!(status("/capture", &referer).await, 403, "foreign Referer");
    let mixed = [
        ("referer", "https://evil.example/"),
        ("sec-fetch-site", "none"),
    ];
    assert_eq!(
        status("/capture", &mixed).await,
        200,
        "Sec-Fetch-Site decides when present"
    );
}

#[tokio::test]
async fn same_origin_share_sheet_and_headerless_gets_pass() {
    assert_eq!(
        status("/capture", &[("sec-fetch-site", "same-origin")]).await,
        200
    );
    assert_eq!(status("/capture", &[("sec-fetch-site", "none")]).await, 200);
    assert_eq!(
        status("/capture", &[("referer", "https://habits.example/inbox")]).await,
        200
    );
    assert_eq!(
        status("/capture", &[]).await,
        200,
        "installed-app share sheet"
    );
}

#[tokio::test]
async fn only_the_share_path_is_guarded() {
    assert_eq!(
        status("/other", &[("sec-fetch-site", "cross-site")]).await,
        200
    );
}

#[tokio::test]
async fn a_post_share_target_goes_through_the_csrf_rule() {
    let app = Router::new()
        .route("/capture", post(|| async { "saved" }))
        .layer(axum::middleware::from_fn(crate::shell::guards::csrf_guard));
    let post = |site: &'static str| {
        Request::post("/capture")
            .header("host", "habits.example")
            .header("sec-fetch-site", site)
            .body(Body::empty())
            .unwrap()
    };
    assert_eq!(
        app.clone()
            .oneshot(post("cross-site"))
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        app.oneshot(post("same-origin")).await.unwrap().status(),
        200
    );
}
