//! The Storage kit page (3.11.0), locked to what Kenny approved in the demo
//! `research/chassis-storage` of kp-themes (21/10/2026 07:42, all four
//! sections, formal): the budget (8 columns) against the empty space (4) and
//! the kinds as a TABLE across 12, a clean-up dialog in two steps (a
//! read-only preview, then the kind's NAME typed), a compact dialog, every
//! card with its own loading, empty and failed state, and stable control ids
//! for the homelab Live view. The page is listed by the registry, so the bar,
//! the palette, the tab bar and the phone's More drawer all show it.
#![cfg(all(feature = "testing", feature = "storage"))]

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDbSpec, DataKind, Filter, Migration, TimeFormat};
use chassis::testing::TestApp;
use serde_json::json;

mod support;

fn kit_file(rel: &str) -> String {
    support::kit_bundle(rel)
}

async fn start(name: &'static str) -> TestApp {
    let spec = AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), |app| {
        app.app_db(AppDbSpec::new(vec![Migration::sql(
            "CREATE TABLE entries (id INTEGER PRIMARY KEY, made_at INTEGER NOT NULL, level TEXT NOT NULL, note TEXT NOT NULL) STRICT;
             INSERT INTO entries (made_at, level, note) VALUES (1000, 'info', 'old one'), (2000, 'error', 'old two');",
        )]))
        .unwrap();
        app.storage_kind(
            DataKind::new("entries", "Entries")
                .description("What the page is tested with.")
                .table("entries")
                .unit("notes")
                .time_column("made_at", TimeFormat::UnixSeconds)
                .filter(Filter::choice("level", "Level", "level", ["info", "error"])),
        );
    })
    .await;
    app.login().await;
    app
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_page_is_the_approved_frame_behind_the_login() {
    let mut app = start("pagelock").await;
    let (status, html) = app.page("/storage").await;
    assert_eq!(status, 200, "{html}");
    // The frame and the three cards, with the approved spans: the budget
    // (8) against the empty space (4), the kinds across all twelve.
    for part in [
        "data-chassis-storage",
        r#"class="kp-ops kit-ops storage""#,
        r#"data-kp-span="8" data-kp-state="loading" data-storage-card="budget""#,
        r#"data-kp-span="4" data-kp-state="loading" data-storage-card="compact""#,
        r#"data-kp-span="12" data-kp-state="ready" data-storage-card="kinds""#,
        "Space used",
        "Give back empty space",
        "What is stored",
        "data-kp-refresh",
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

async fn start_anonymous() -> TestApp {
    let spec = AppSpec {
        name: "pageanon",
        version: "0.0.0",
        ..Default::default()
    };
    TestApp::start(spec, Router::new()).await
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

#[test]
fn the_script_and_the_style_keep_the_approved_parts() {
    let js = kit_file("static/chassis.js");
    let block = js
        .split("storage (kit-storage, 3.11.0)")
        .nth(1)
        .expect("the storage block");
    // Stable control ids for the homelab Live view.
    for id in [
        "storage-open-clean-",
        "storage-band-clean",
        "storage-open-compact",
        "storage-clean-dialog",
        "storage-clean-older",
        "storage-clean-filter-",
        "storage-clean-reset",
        "storage-clean-preview",
        "storage-clean-continue",
        "storage-clean-confirm",
        "storage-clean-back",
        "storage-clean-delete",
        "storage-clean-close",
        "storage-clean-done",
        "storage-compact-dialog",
        "storage-compact-run",
        "storage-compact-cancel",
        "storage-compact-done",
    ] {
        assert!(block.contains(id), "the stable control id {id} is gone");
    }
    // The approved words and parts.
    for part in [
        "Delete for good",
        "Continue to confirm",
        "Compact now",
        "Nothing matches",
        "The preview could not be made",
        "Compacting did not finish",
        "The storage could not be read",
        "Where the space goes",
        "Cleans itself",
        "data-kp-type-confirm=",
        "data-kp-segmented=",
        "data-kp-datepicker",
        "kp-steplist--journey",
        "setStackbar",
        "setCardState",
        "runFlashButton",
    ] {
        assert!(block.contains(part), "the approved part {part} is gone");
    }
    // What is typed is the kind's name as the page shows it, and the server
    // checks the same words (no id is sent as the confirmation).
    assert!(block.contains("p.confirm_with"));
    assert!(!block.contains("confirm: c.kind") && !block.contains("confirm: k.id"));
    // Every state of a card is the package's own, never a hand-made note.
    for hand_made in ["Loading…", "No data", "kp-spinner"] {
        assert!(
            !block.contains(hand_made),
            "a hand-made state ({hand_made}) stands in for the package's"
        );
    }
    // Sizes are human and decimal, dates dd/mm/yyyy HH:mm, counts exact.
    assert!(block.contains("1e6") && block.contains("formatBrussels"));
    assert!(!block.contains("99+") && !block.contains("toLocaleString"));
    // The chord the first letter cannot give (Status has "s").
    assert!(js.contains("chassisChord"));

    let css = kit_file("static/chassis.css");
    let part = css
        .split("storage (kit-storage, 3.11.0")
        .nth(1)
        .expect("the storage style");
    for rule in [
        ".storage-budget",
        ".storage-files",
        ".storage-kind",
        ".storage-share",
        ".storage-clean__grid",
        ".storage-compact__grid",
        "grid-template-areas",
        "@container storaged",
        "@container storagec",
    ] {
        assert!(part.contains(rule), "the layout rule {rule} is gone");
    }
    // Only tokens: no colour literal in the page's rules.
    let rules = part
        .split("Until the next kp-themes release")
        .next()
        .unwrap();
    assert!(
        !rules.contains('#') && !rules.contains("rgb(") && !rules.contains("hsl("),
        "the Storage page's style uses tokens only"
    );
    // The kp-themes workarounds stand in ONE block that says when to delete them.
    assert_eq!(
        css.matches("Until the next kp-themes release").count(),
        1,
        "the workarounds are one marked block"
    );
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

#[test]
fn budget_editor_keeps_its_ids_its_kit_parts_and_the_one_post() {
    let js = kit_file("static/chassis.js");
    let block = js
        .split("storage (kit-storage, 3.11.0)")
        .nth(1)
        .expect("the storage block");
    // Stable control ids for the homelab Live view.
    for id in [
        "storage-budget-mb",
        "storage-warn-mb",
        "storage-budget-save",
        "storage-budget-reset",
    ] {
        assert!(block.contains(id), "the stable control id {id} is gone");
    }
    // Only kit parts: the quantity field, the form grid, the flash button and a toast.
    for part in [
        "data-kp-quantity",
        "kp-formgrid__row",
        "data-kp-formgrid-stack",
        "data-kp-flash-button",
        "overlays.toast",
        "/api/kit/storage/budget",
        "Only a warning: nothing is deleted when the budget is reached",
        "Reset to default",
        "data-kp-quantity-disabled",
    ] {
        assert!(block.contains(part), "the budget editor lost {part}");
    }
    // Fixed by configuration: disabled with the reason, never hidden.
    assert!(
        block.contains("fixedBy") && block.contains("budget_fixed") && block.contains("warn_fixed")
    );
    // The editor shares the card's grid, across both of its columns.
    let css = kit_file("static/chassis.css");
    assert!(css.contains(".storage-budget__edit { grid-column: 1 / -1; }"));
}

/// Measured 2026-10-21 at 390 px: a long preference key was cut without an
/// ellipsis in the sample cards. As cards, a cell wraps instead.
#[test]
fn sample_cards_wrap_long_values() {
    let css = kit_file("static/chassis.css");
    assert!(css.contains(
        ".storage-prev__table[data-kp-cards] td { max-inline-size: none; white-space: normal; overflow-wrap: anywhere; }"
    ));
}

/// Kenny, 2026-10-24 (confirmed in the 3.14.0 form): the Storage page
/// refreshes every five minutes by default, and "Every 5 min" is offered.
#[test]
fn storage_defaults_to_five_minutes() {
    let page = kit_file("templates/storage.html");
    assert!(page.contains(r#"data-kp-refresh="300""#));
    assert!(page.contains(r#"data-kp-refresh-choices="0,15,30,60,300""#));
}

/// Kenny, 2026-10-30 (almanac, kyu): "updated 0 s ago" never counted on.
/// The refresh control's line ticks only when the freshness ticker runs, so
/// the Storage page and the Clients page ask for it wherever a refresh
/// control is.
#[test]
fn the_refresh_line_ticks_on_storage_and_clients() {
    let js = kit_file("static/chassis.js");
    assert!(
        js.contains("['freshness', '[data-kp-refresh], [data-kp-ago]', (m, r) => m.attachAgo(r)],")
    );
    assert!(js.contains("['[data-kp-refresh], [data-kp-ago]', 'freshness', 'attachAgo'],"));
}
