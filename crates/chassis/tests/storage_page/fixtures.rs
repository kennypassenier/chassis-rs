//! Shared setup for the Storage page tests: the asset reader and app starts.

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDbSpec, DataKind, Filter, Migration, TimeFormat};
use chassis::testing::TestApp;

pub fn kit_file(rel: &str) -> String {
    crate::support::kit_bundle(rel)
}

pub async fn start(name: &'static str) -> TestApp {
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

pub async fn start_anonymous() -> TestApp {
    let spec = AppSpec {
        name: "pageanon",
        version: "0.0.0",
        ..Default::default()
    };
    TestApp::start(spec, Router::new()).await
}
