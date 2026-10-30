//! Shared setup for the Storage API tests: schema, harness and helpers.

use std::sync::{Arc, Mutex};

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDb, AppDbSpec, DataKind, Filter, Migration, TimeFormat};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::Value;

pub static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, level TEXT NOT NULL, msg TEXT NOT NULL) STRICT;
         CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;",
    )]
}

pub struct Harness {
    pub app: TestApp,
    pub db: AppDb,
}

pub async fn start(name: &'static str) -> Harness {
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let spec = AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    };
    let mut app = TestApp::start_with(spec, Router::new(), move |app| {
        let db = app.app_db(AppDbSpec::new(schema())).unwrap();
        *h2.lock().unwrap() = Some(db);
        app.storage_kind(
            DataKind::new("events", "Events")
                .description("what happened")
                .table("events")
                .time_column("at", TimeFormat::UnixSeconds)
                .filter(Filter::choice("level", "Level", "level", ["info", "error"])),
        );
        app.storage_kind(
            DataKind::new("snoozes", "Snoozes")
                .table("snoozes")
                .time_column("until", TimeFormat::UnixSeconds)
                .finished_by_definition("until < :now"),
        );
    })
    .await;
    app.login().await;
    let db = handle.lock().unwrap().clone().unwrap();
    // 20 events: ten days old and ten fresh.
    let now = chrono_now();
    db.write(move |tx| {
        for i in 0..20i64 {
            let at = if i < 10 {
                now - 10 * 86_400 - i
            } else {
                now - i
            };
            tx.execute(
                "INSERT INTO events (at, level, msg) VALUES (?1, ?2, ?3)",
                chassis::storage::rusqlite::params![
                    at,
                    if i % 2 == 0 { "info" } else { "error" },
                    format!("event {i}")
                ],
            )?;
        }
        Ok(())
    })
    .await
    .unwrap();
    Harness { app, db }
}

pub fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

pub async fn post(app: &TestApp, path: &str, body: Value) -> (u16, Value) {
    app.json(Method::POST, path, Some(body)).await
}

pub fn count(db: &AppDb, table: &str) -> i64 {
    db.read_blocking(|c| {
        Ok(c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?)
    })
    .unwrap()
}
