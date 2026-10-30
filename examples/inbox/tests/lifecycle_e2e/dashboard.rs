//! The dashboard pages: the kit's own with layout and assets, and a project's page
//! inside the layout with the security headers.

use super::support::*;

/// K16: a page says what it does. The kit's kp-themes 11 pages do it in the
/// page header's description or a `.kp-lede`; the project's own pages in a
/// plain `.explain` paragraph (a class token, alone or among others).
fn explains_itself(html: &str) -> bool {
    html.contains("kp-page-header__description")
        || html.contains("kp-lede")
        || html
            .split("class=\"")
            .skip(1)
            .filter_map(|rest| rest.split('"').next())
            .any(|classes| classes.split_whitespace().any(|c| c == "explain"))
}

// K15 + K16 + K17 over the wire: the HTML pages render inside the shared
// layout with an explain block, the theme picker and the vendored assets.
#[test]
fn dashboard_pages_render_with_layout_and_assets() {
    let dir = tempfile::tempdir().unwrap();
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // Login page: public, explain block, theme picker, assets with a hash.
    let res = http.get(format!("{base}/login")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(explains_itself(&html), "explain block (K16)");
    assert!(html.contains("data-kp-theme-picker"), "theme picker (K15)");
    assert!(
        html.contains("data-kp-theme=\"cyberpunk\""),
        "themes from the registry"
    );
    let asset_url = html
        .split('"')
        .find(|s| s.starts_with("/static/kp/dist/kp-themes.css?v="))
        .expect("versioned asset link")
        .to_string();
    let res = http.get(format!("{base}{asset_url}")).send().unwrap();
    assert_eq!(res.status(), 200);
    assert_eq!(
        res.headers()["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert!(
        res.text().unwrap().contains("--background"),
        "the vendored stylesheet"
    );

    // Wrong token re-renders the login page (200) with the message inside the layout.
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", "nope")])
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(
        html.contains("not right") && html.contains("kp-alert"),
        "{html}"
    );

    // Status page after login: version, health, update card, nav.
    http.post(format!("{base}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    let res = http.get(format!("{base}/")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(
        html.contains("inbox 0.") || html.contains("0.1.0"),
        "version on the status page"
    );
    assert!(
        html.contains("Health") && html.contains("Updates"),
        "the kit cards"
    );
    assert!(
        html.contains("Messages") && html.contains("Received"),
        "the project's own status section (K17)"
    );
    assert!(html.contains("aria-current=\"page\""), "active nav entry");
    assert!(html.contains("Log out"));
    // K29: the project's section action is a button under its section, and
    // its route answers the admin session. Drilled red once by removing the
    // `actions` override in main.rs (the button vanished).
    assert!(
        html.contains("data-post=\"/messages/clear\"")
            && html.contains("data-kp-confirm=\"Clear every message?"),
        "the section action (K29): {html}"
    );
    let res = http.post(format!("{base}/messages/clear")).send().unwrap();
    assert_eq!(res.status(), 204);

    // Clients page: issue one via the API, then the row carries the buttons.
    http.post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "page-test", "topic": "alerts" }))
        .send()
        .unwrap();
    let res = http.get(format!("{base}/clients")).send().unwrap();
    assert_eq!(res.status(), 200);
    let html = res.text().unwrap();
    assert!(html.contains("page-test"));
    assert!(
        html.contains(">Messages</th>"),
        "the project's extra client column (K16)"
    );
    // feat-clients-4 (2026-09-10): the row carries one button now and every
    // other control moved into the dialog it opens, so `data-requests` — the
    // old toggle for a panel under the table — is gone on purpose. The panel
    // itself is inside the dialog and loads when it opens.
    for needle in [
        "data-manage=",
        // kit-kp11: the dialog's close, the secret (Reveal and Copy of the
        // token), the full-command copy and the test send, as the approved
        // manage dialog names them.
        "data-kp-dialog-close",
        "data-manage-secret",
        "data-manage-copy-full",
        "data-manage-send",
        "data-kp-confirm=",
    ] {
        assert!(html.contains(needle), "clients page lacks {needle}");
    }
    assert!(
        !html.contains("data-requests="),
        "the panel toggle is gone with feat-clients-4"
    );
    // K12: the page holds no token. Since kit-kp11 it does hold the command
    // template, whose token is the `$CLIENT_TOKEN` placeholder (this example keeps the default vocabulary): every
    // `Bearer ` in the page must be followed by that placeholder.
    for (i, _) in html.match_indices("Bearer ") {
        assert!(
            html[i + "Bearer ".len()..].starts_with("$CLIENT_TOKEN"),
            "a real token or command in the page HTML (K12): {}",
            &html[i..(i + 80).min(html.len())]
        );
    }
}

// K16: a project's own page (inbox's /messages) renders inside the kit's
// layout, behind the admin login, with its nav entry active; S8: every
// response carries the security headers and the page loads no third party.
#[test]
fn project_page_renders_inside_the_layout_with_security_headers() {
    let dir = tempfile::tempdir().unwrap();
    let (mut child, addr, _) = start_capturing(dir.path(), &[], &[]);
    let anon = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let res = anon.get(format!("http://{addr}/messages")).send().unwrap();
    assert_eq!(
        res.status().as_u16(),
        303,
        "a project page needs the admin login"
    );
    let admin = login_jar(&addr);
    let (_id, token) = issue_client(&admin, &addr, "pager");
    reqwest::blocking::Client::new()
        .post(format!("http://{addr}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"hello": "page"}))
        .send()
        .unwrap();
    let res = admin.get(format!("http://{addr}/messages")).send().unwrap();
    assert_eq!(res.status().as_u16(), 200);
    let csp = res.headers()["content-security-policy"]
        .to_str()
        .unwrap()
        .to_string();
    assert!(csp.contains("script-src 'self'"), "{csp}");
    assert_eq!(res.headers()["x-content-type-options"], "nosniff");
    assert_eq!(res.headers()["x-frame-options"], "DENY");
    let html = res.text().unwrap();
    assert!(html.contains("kp-nav"), "inside the kit's layout");
    assert!(
        html.contains("aria-current=\"page\""),
        "the Messages nav entry is active"
    );
    assert!(
        html.contains("<h1>Messages</h1>") && html.contains("pager") && html.contains("hello"),
        "{html}"
    );
    assert!(explains_itself(&html), "every page explains itself (K16)");
    assert!(!html.contains("bunny.net"), "no third party: {html}");
    // Every kit page: scripts only by src (the CSP blocks inline ones).
    let mut pages = vec![(
        "/login",
        anon.get(format!("http://{addr}/login"))
            .send()
            .unwrap()
            .text()
            .unwrap(),
    )];
    for p in ["/", "/clients", "/messages"] {
        pages.push((
            p,
            admin
                .get(format!("http://{addr}{p}"))
                .send()
                .unwrap()
                .text()
                .unwrap(),
        ));
    }
    for (p, page) in &pages {
        for (i, _) in page.match_indices("<script") {
            let end = page[i..].find('>').map(|e| i + e + 1).unwrap_or(page.len());
            let tag = &page[i..end];
            assert!(
                tag.contains(" src="),
                "{p} carries an inline script the CSP would block: {tag}"
            );
        }
        assert!(explains_itself(page), "{p} explains itself");
    }
    for asset in [
        "/static/kp/css/fonts.css",
        "/static/kp/dist/kp-themes.css",
        "/static/kp/js/effects.js",
        "/static/theme-boot.js",
        "/static/kp/fonts/instrumentsans/instrumentsans-variable.woff2",
    ] {
        let res = anon.get(format!("http://{addr}{asset}")).send().unwrap();
        assert_eq!(res.status().as_u16(), 200, "{asset}");
    }
    stop(&mut child);
}
