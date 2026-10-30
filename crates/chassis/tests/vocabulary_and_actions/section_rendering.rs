//! Section assets, body sections, flash actions and html-only sections.

use axum::Router;
use chassis::shell::dashboard::{Section, StatusSection};

use crate::fixtures::{Quiet, app, http, login};

struct WithAssets(&'static str);

impl StatusSection for WithAssets {
    fn render(&self) -> Section {
        Section {
            title: self.0.into(),
            explain: "Declares a module script and a stylesheet.".into(),
            rows: vec![],
            html: None,
        }
    }
    fn assets(&self) -> chassis::SectionAssets {
        chassis::SectionAssets::new()
            .module_script("/app/orders.js")
            .stylesheet("/app/orders.css")
    }
}

// kit-kp11: two sections naming the same files get one tag each, in the
// page head, under the existing CSP (same-origin paths only).
#[tokio::test]
async fn kit_kp11_section_assets_render_once_in_the_head() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.status_section(WithAssets("First"));
    app.status_section(WithAssets("Second"));
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/", &[("Cookie", &cookie)], "").await;
    // The template escapes `/` in attribute values (`&#x2f;`); same URL.
    let page = page.replace("&#x2f;", "/");
    assert_eq!(
        page.matches("<script type=\"module\" src=\"/app/orders.js\"></script>")
            .count(),
        1,
        "{page}"
    );
    assert_eq!(
        page.matches("<link rel=\"stylesheet\" href=\"/app/orders.css\">")
            .count(),
        1,
        "{page}"
    );
    let head_end = page.find("</head>").unwrap();
    assert!(page.find("/app/orders.js").unwrap() < head_end, "{page}");
    running.stop().await;
}

struct Delivery;

impl StatusSection for Delivery {
    fn render(&self) -> Section {
        Section {
            title: "Delivery".into(),
            explain: "What is waiting to be sent.".into(),
            rows: vec![],
            html: None,
        }
    }
    fn body(&self) -> Option<chassis::SectionBody> {
        Some(chassis::SectionBody::Many(vec![
            chassis::SectionBody::Kpis(vec![chassis::Kpi::new("Waiting", 12)]),
            chassis::SectionBody::Checks(vec![chassis::Check::failed("Webhook", "answered 502")]),
        ]))
    }
    fn flash_actions(&self) -> Vec<chassis::FlashAction> {
        vec![
            chassis::FlashAction::post("Retry failed deliveries", "/deliveries/retry")
                .word("Retried")
                .toast("Retried {n} entries"),
        ]
    }
}

// kit-kp11: a section body drawn by the kit, and a flash action that keeps
// the page: it is a flash button (no data-post, so no reload) carrying its
// toast, and the status data names the card's span and the 48-hour strip.
#[tokio::test]
async fn kit_kp11_body_sections_and_flash_actions_render_without_a_reload_hook() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.status_section(Delivery);
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/", &[("Cookie", &cookie)], "").await;
    assert!(
        page.contains("class=\"kp-kpis\"") && page.contains("Waiting"),
        "{page}"
    );
    assert!(
        page.contains("data-state=\"failed\" data-kp-status-id=\"Webhook\""),
        "{page}"
    );
    assert!(
        page.contains("data-chassis-flash=\"/deliveries/retry\"")
            && page.contains("data-chassis-toast=\"Retried {n} entries\"")
            && !page.contains("data-post=\"/deliveries/retry\""),
        "{page}"
    );
    let (_, _, json) = http(
        addr,
        "GET",
        "/api/kit/status",
        &[("Cookie", &cookie), ("Accept", "application/json")],
        "",
    )
    .await;
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(v["sections"][0]["span"], 12);
    assert_eq!(v["sections"][0]["parts"].as_array().unwrap().len(), 2);
    assert_eq!(v["uptime"].as_array().unwrap().len(), 48);
    running.stop().await;
}

struct HtmlOnly;

impl StatusSection for HtmlOnly {
    fn render(&self) -> Section {
        Section {
            title: "Html only".into(),
            explain: "The body is the project's own markup.".into(),
            rows: vec![],
            html: Some("<p id=\"own-body\">owned</p>".into()),
        }
    }
}

// kit-r4 (almanac): a section whose body is html only renders no empty
// `dl[data-chassis-rows]`; a section with rows still does.
#[tokio::test]
async fn kit_r4_an_html_only_section_has_no_empty_rows_list() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = app(dir.path(), Router::new());
    app.status_section(HtmlOnly);
    app.status_section(Quiet);
    let running = app.start().await.unwrap();
    let addr = running.addr;
    let cookie = login(addr).await;
    let (_, _, page) = http(addr, "GET", "/", &[("Cookie", cookie.as_str())], "").await;
    let card = |slug: &str| {
        let start = page
            .find(&format!("data-chassis-section=\"{slug}-"))
            .unwrap();
        let end = page[start..].find("</section>").unwrap();
        page[start..start + end].to_string()
    };
    let html_only = card("html-only");
    assert!(html_only.contains("id=\"own-body\""), "{html_only}");
    assert!(!html_only.contains("data-chassis-rows"), "{html_only}");
    assert!(card("quiet").contains("data-chassis-rows"));
    let js = crate::support::kit_bundle("static/chassis.js");
    assert!(
        js.contains("!pairs.length ? ''"),
        "the live redraw draws no empty list either"
    );
    running.stop().await;
}
