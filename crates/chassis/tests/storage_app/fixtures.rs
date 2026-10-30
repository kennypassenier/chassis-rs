//! Shared setup for the app database tests: schema, spec and a big import.

use axum::Router;
use chassis::storage::{AppDbSpec, ImportReport, Migration};
use chassis::testing::TestApp;
use chassis::{App, AppSpec};

pub static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn schema() -> Vec<Migration> {
    vec![Migration::sql(
        "CREATE TABLE blobs (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, data BLOB NOT NULL) STRICT;
         CREATE TABLE snoozes (id INTEGER PRIMARY KEY, until INTEGER NOT NULL) STRICT;",
    )]
}

pub fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

/// Start and return the kit's refusal.
pub async fn refused(
    spec: AppSpec,
    env: &[(&str, &str)],
    configure: impl FnOnce(&mut App),
) -> String {
    match TestApp::try_start_with_env(spec, Router::new(), env, configure).await {
        Ok(mut app) => {
            app.shutdown().await;
            panic!("the service started but should have been refused");
        }
        Err(e) => e.to_string(),
    }
}

/// An app database whose import writes `mb` megabytes at the first start.
pub fn big_import(mb: usize) -> AppDbSpec {
    AppDbSpec::new(schema()).with_import(move |tx, _| {
        for _ in 0..mb {
            tx.execute(
                "INSERT INTO blobs (at, data) VALUES (0, zeroblob(1048576))",
                [],
            )?;
        }
        Ok(ImportReport::new(mb as u64, mb as u64, vec![]))
    })
}
