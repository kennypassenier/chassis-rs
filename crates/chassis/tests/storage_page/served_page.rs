//! The served Storage page: frame, registry entries and the API feed.

use serde_json::json;

use crate::fixtures::{kit_file, start, start_anonymous};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_page_is_the_approved_frame_behind_the_login() {
    let mut app = start("pagelock").await;
    let (status, html) = app.page("/storage").await;
    assert_eq!(status, 200, "{html}");
    // The frame and the three cards, with the approved spans: the budget
    // (8) against the empty space (4), the kinds across all twelve.
    for part in [
        "data-chassis-storage",
        r#"class="kp-ops chassis-ops kit-ops storage""#,
        r#"data-kp-span="8" data-kp-state="loading" data-storage-card="budget""#,
        r#"data-kp-span="4" data-kp-state="loading" data-storage-card="compact""#,
        r#"data-kp-span="12" data-kp-state="ready" data-storage-card="kinds""#,
        "Space used",
        "Give back empty space",
        "What is stored",
        "data-chassis-refresh-default=\"300\"",
    ] {
        assert!(html.contains(part), "the page lacks {part}");
    }
    // The kinds are a TABLE (Kenny's default), sortable, with the approved
    // seven columns in this order, and its own empty state.
    let table = html[html.find("<thead>").expect("the kinds table")..].to_string();
    let mut at = 0;
    for col in [
        ">Kind<",
        ">Amount<",
        ">Size<",
        ">Share of the budget<",
        ">Oldest<",
        ">Newest<",
        r#"<span class="kp-sr-only">Action</span>"#,
    ] {
        let i = table[at..]
            .find(col)
            .unwrap_or_else(|| panic!("column {col} missing or out of order"));
        at += i;
    }
    assert!(html.contains("data-kp-sort=\"number\""));
    assert!(html.contains("This application stores no data of its own yet"));
    // The page's figures are read, never written into the source.
    assert!(
        !html.contains("data-kit-storage="),
        "figures come from /api/kit/storage"
    );
    // Behind the same login as every kit page.
    app.shutdown().await;
    let anon = start_anonymous().await;
    let res = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
        .get(anon.url("/storage"))
        .send()
        .await
        .unwrap();
    assert!(
        res.status().is_redirection() || res.status() == 401,
        "an anonymous visit is sent to the login, got {}",
        res.status()
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_registry_lists_storage_in_the_bar_the_palette_and_the_phones_more_drawer() {
    let app = start("pagenav").await;
    let (_, pages) = app.page("/api/kit/pages").await;
    let pages: serde_json::Value = serde_json::from_str(&pages).unwrap();
    let storage = pages["pages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "storage")
        .expect("storage is a registered page");
    assert_eq!(storage["path"], "/storage");
    assert_eq!(storage["hint"], "What the service stores");
    assert_eq!(storage["source"], "kit");
    // Every page says what it is for, so the palette and the drawer can.
    assert!(
        pages["pages"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["hint"].is_string()),
        "{pages}"
    );
    let (_, html) = app.page("/status").await;
    // The bar, the palette (with its chord and hint) and the More drawer
    // (the tab bar holds the first three pages, Storage is the fourth).
    assert!(html.contains(r#"<a class="kp-nav__link" href="&#x2f;storage">Storage</a>"#));
    assert!(
        html.contains(r#"data-chassis-go="storage" data-chassis-chord="o" href="&#x2f;storage""#)
    );
    assert!(
        html.contains(r#"<span class="kp-palette__description">What the service stores</span>"#)
    );
    let drawer = html
        .split(r#"id="chassis-more""#)
        .nth(1)
        .expect("the drawer");
    assert!(
        drawer.contains(r#"href="&#x2f;storage""#)
            && drawer.contains(r#"<span class="kp-menu__hint">What the service stores</span>"#),
        "the More drawer lists Storage with its hint, read from the registry"
    );
    // The drawer's hints are the registry's, not a list in the layout.
    let layout = kit_file("templates/layout.html");
    assert!(layout.contains("page.hint") && !layout.contains("hints["));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_api_feeds_the_page_what_the_demo_showed() {
    let app = start("pagefeed").await;
    let (status, o) = app.get_json("/api/kit/storage").await;
    assert_eq!(status, 200, "{o}");
    assert_eq!(o["kinds"][0]["unit"], "notes");
    assert_eq!(
        o["last_compacted_at"],
        serde_json::Value::Null,
        "never compacted yet"
    );
    let (status, p) = app
        .post_json("/api/kit/storage/entries/preview", json!({}))
        .await;
    assert_eq!(status, 200, "{p}");
    // The page shows the kind's NAME, so that is what is typed and checked.
    assert_eq!(p["confirm_with"], "Entries");
    // The columns come in the table's order, without the row number, and the
    // time column is an instant the page writes as dd/mm/yyyy HH:mm.
    assert_eq!(p["columns"], json!(["made_at", "level", "note"]));
    assert_eq!(p["time_column"], "made_at");
    assert_eq!(p["samples"][0]["made_at"], "1970-01-01T00:16:40Z");
    let (status, e) = app
        .post_json(
            "/api/kit/storage/entries/delete",
            json!({"token": p["token"], "confirm": "entries"}),
        )
        .await;
    assert_eq!(status, 400, "the id is not the name: {e}");
    let (status, d) = app
        .post_json(
            "/api/kit/storage/entries/delete",
            json!({"token": p["token"], "confirm": "Entries"}),
        )
        .await;
    assert_eq!(status, 200, "{d}");
    assert_eq!(d["deleted"]["deleted"], 2);
    let (status, c) = app.post_json("/api/kit/storage/compact", json!({})).await;
    assert_eq!(status, 200, "{c}");
    let (_, o) = app.get_json("/api/kit/storage").await;
    assert!(
        o["last_compacted_at"]
            .as_str()
            .is_some_and(|t| t.ends_with('Z')),
        "the compact is remembered in the file: {o}"
    );
}
