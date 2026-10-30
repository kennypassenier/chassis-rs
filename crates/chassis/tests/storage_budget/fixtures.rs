//! Shared setup for the budget tests: log capture, schema and helpers.

use std::sync::{Arc, Mutex, OnceLock};

use axum::Router;
use chassis::AppSpec;
use chassis::storage::{AppDb, AppDbSpec, ImportReport, Migration};
use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::Value;

pub static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Default)]
pub struct Capture(pub Arc<Mutex<Vec<u8>>>);
impl std::io::Write for Capture {
    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(b);
        Ok(b.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Capture {
    type Writer = Capture;
    fn make_writer(&'a self) -> Capture {
        self.clone()
    }
}
pub fn capture() -> &'static Capture {
    static CAP: OnceLock<Capture> = OnceLock::new();
    CAP.get_or_init(|| {
        let cap = Capture::default();
        tracing::subscriber::set_global_default(
            tracing_subscriber::fmt()
                .with_writer(cap.clone())
                .with_ansi(false)
                .finish(),
        )
        .unwrap();
        cap
    })
}

pub fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB NOT NULL) STRICT;",
    )]
}

/// An app database holding `mb` megabytes after the first start.
pub fn spec_with(mb: usize) -> AppDbSpec {
    AppDbSpec::new(schema()).with_import(move |tx, _| {
        for _ in 0..mb {
            tx.execute("INSERT INTO blobs (data) VALUES (zeroblob(1000000))", [])?;
        }
        Ok(ImportReport::new(mb as u64, mb as u64, vec![]))
    })
}

pub fn app_spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

pub async fn start(
    name: &'static str,
    env: &[(&str, &str)],
    mb: usize,
    code: Option<(u64, Option<u64>)>,
) -> (TestApp, AppDb) {
    // Ours goes in before the kit's logging, which keeps an existing one.
    capture();
    let handle: Arc<Mutex<Option<AppDb>>> = Arc::default();
    let h2 = handle.clone();
    let mut app = TestApp::start_with_env(app_spec(name), Router::new(), env, move |app| {
        if let Some((b, w)) = code {
            app.storage_budget(b, w);
        }
        *h2.lock().unwrap() = Some(app.app_db(spec_with(mb)).unwrap());
    })
    .await;
    app.login().await;
    let db = handle.lock().unwrap().clone().unwrap();
    (app, db)
}

pub async fn set(app: &TestApp, body: Value) -> (u16, Value) {
    app.json(Method::POST, "/api/kit/storage/budget", Some(body))
        .await
}

pub fn stored(db: &AppDb, key: &str) -> Option<String> {
    db.read_blocking(|c| {
        use chassis::storage::rusqlite::OptionalExtension;
        Ok(c.query_row(
            "SELECT value FROM chassis_meta WHERE key = ?1",
            [key],
            |r| r.get(0),
        )
        .optional()?)
    })
    .unwrap()
}
