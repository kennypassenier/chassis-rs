//! The kit's own file `<name>-kit.db` through a running service (3.11.0):
//! clients and sessions survive a restart as sealed rows, the old sealed
//! JSON files move in once at the first start, a failed move writes nothing
//! and the service runs on the old files with a problem on the status page.
#![cfg(all(feature = "testing", feature = "storage"))]

use axum::Router;
use axum::routing::post;
use chassis::AppSpec;
use chassis::core::clients::ClientsFile;
use chassis::core::crypto::Key;
use chassis::core::session::SessionsFile;
use chassis::shell::store::EncryptedFile;
use chassis::storage::rusqlite::{Connection, OpenFlags};
use chassis::testing::TestApp;
use reqwest::Method;

const KEY_HEX: &str = "0a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728ff";
const TOKEN: &str = "a-long-enough-admin-login-token-1234";

fn key() -> Key {
    Key::parse_hex("K", KEY_HEX, "").unwrap()
}

fn spec(name: &'static str) -> AppSpec {
    AppSpec {
        name,
        version: "0.0.0",
        ..Default::default()
    }
}

fn env(prefix: &str, dir: &std::path::Path) -> Vec<(String, String)> {
    vec![
        (format!("{prefix}_STATE_DIR"), dir.display().to_string()),
        (format!("{prefix}_SECRET_KEY"), KEY_HEX.to_string()),
        (format!("{prefix}_TOKEN"), TOKEN.to_string()),
    ]
}

async fn start(name: &'static str, dir: &std::path::Path) -> TestApp {
    let prefix = name.to_ascii_uppercase();
    let pairs = env(&prefix, dir);
    let refs: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    TestApp::start_with_env(spec(name), Router::new(), &refs, |app| {
        app.api_routes(Router::new().route("/v1/ping", post(|| async { "pong" })));
    })
    .await
}

fn kit_db(dir: &std::path::Path, name: &str) -> Connection {
    Connection::open_with_flags(
        dir.join(format!("{name}-kit.db")),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap()
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

fn raw_files(dir: &std::path::Path, name: &str) -> Vec<u8> {
    let mut all = Vec::new();
    for f in [format!("{name}-kit.db"), format!("{name}-kit.db-wal")] {
        all.extend(std::fs::read(dir.join(f)).unwrap_or_default());
    }
    all
}

fn client_names(body: &serde_json::Value) -> Vec<String> {
    body["clients"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|c| c["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn clients_and_sessions_live_in_the_kit_file_sealed_and_survive_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let mut app = start("kitfresh", dir.path()).await;
    app.login().await;
    let issued = app.issue_client("ha", &[]).await;
    app.shutdown().await;

    assert!(
        dir.path().join("kitfresh-kit.db").exists(),
        "service-prefixed kit file"
    );
    assert!(
        !dir.path().join("clients.json.enc").exists(),
        "no JSON file is written any more"
    );
    assert!(!dir.path().join("sessions.json.enc").exists());
    let conn = kit_db(dir.path(), "kitfresh");
    assert_eq!(count(&conn, "kit_clients"), 1);
    assert_eq!(count(&conn, "kit_sessions"), 1, "the login");
    let raw = raw_files(dir.path(), "kitfresh");
    assert!(
        !raw.windows(issued.token.len())
            .any(|w| w == issued.token.as_bytes()),
        "the client's token is sealed in the file"
    );
    drop(conn);

    let mut again = start("kitfresh", dir.path()).await;
    again.login().await;
    let (status, body) = again.get_json("/api/kit/clients").await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(client_names(&body), vec!["ha".to_string()]);
    // The sealed token still authenticates.
    let (status, text) =
        TestApp::send_text(again.bearer(Method::POST, "/v1/ping", &issued.token)).await;
    assert_eq!((status, text.as_str()), (200, "pong"));
    again.shutdown().await;
}

fn write_legacy(dir: &std::path::Path, clients: &ClientsFile) {
    EncryptedFile::new(dir.join("clients.json.enc"), key(), "clients")
        .save(clients)
        .unwrap();
    let mut s = SessionsFile::default();
    s.create("some-old-cookie", 1_000, 10_000_000_000, true);
    EncryptedFile::new(dir.join("sessions.json.enc"), key(), "sessions")
        .save(&s)
        .unwrap();
}

fn legacy_clients() -> ClientsFile {
    let mut f = ClientsFile::default();
    f.issue_with_fields(
        "legacy-one",
        "id-a".into(),
        "legacy-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into(),
        "2026-09-05T07:00:00Z",
        Default::default(),
    )
    .unwrap();
    f.issue_with_fields(
        "legacy-two",
        "id-b".into(),
        "legacy-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
        "2026-09-05T07:01:00Z",
        Default::default(),
    )
    .unwrap();
    f
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_first_start_moves_the_old_files_in_once_and_renames_them() {
    let dir = tempfile::tempdir().unwrap();
    write_legacy(dir.path(), &legacy_clients());
    let mut app = start("kitlegacy", dir.path()).await;
    app.login().await;
    let (_, body) = app.get_json("/api/kit/clients").await;
    assert_eq!(client_names(&body), vec!["legacy-one", "legacy-two"]);
    let (status, _) = TestApp::send_text(app.bearer(
        Method::POST,
        "/v1/ping",
        "legacy-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ))
    .await;
    assert_eq!(status, 200, "a legacy token works from the sealed rows");
    app.shutdown().await;

    assert!(!dir.path().join("clients.json.enc").exists());
    assert!(dir.path().join("clients.json.enc.migrated").exists());
    assert!(dir.path().join("sessions.json.enc.migrated").exists());
    let conn = kit_db(dir.path(), "kitlegacy");
    assert_eq!(count(&conn, "kit_clients"), 2);

    // An old file restored by hand is never read again.
    write_legacy(dir.path(), &ClientsFile::default());
    let mut app = start("kitlegacy", dir.path()).await;
    app.login().await;
    let (_, body) = app.get_json("/api/kit/clients").await;
    assert_eq!(client_names(&body).len(), 2, "the marker held");
    app.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_failed_move_writes_nothing_runs_on_the_old_files_and_retries_next_start() {
    let dir = tempfile::tempdir().unwrap();
    // Two clients sharing an id: the insert fails, the whole move rolls back.
    let mut broken = legacy_clients();
    broken.clients[1].id = "id-a".into();
    write_legacy(dir.path(), &broken);

    let mut app = start("kitbroken", dir.path()).await;
    app.login().await;
    let (_, status) = app.get_json("/api/kit/status").await;
    let problems = status["problems"].to_string();
    assert!(
        problems.contains("could not move into the kit database"),
        "{problems}"
    );
    assert!(problems.contains("old files"), "{problems}");
    // The service works on the old files: both clients are listed.
    let (_, body) = app.get_json("/api/kit/clients").await;
    assert_eq!(client_names(&body).len(), 2, "{body}");
    app.shutdown().await;

    let conn = kit_db(dir.path(), "kitbroken");
    assert_eq!(count(&conn, "kit_clients"), 0, "nothing was written");
    assert_eq!(
        count(&conn, "kit_sessions"),
        0,
        "not even the sessions that were fine"
    );
    drop(conn);
    // The service ran on it (and may have re-sealed it at shutdown), so it
    // is the same CONTENT, not necessarily the same bytes.
    let still: ClientsFile = EncryptedFile::new(dir.path().join("clients.json.enc"), key(), "c")
        .load()
        .unwrap()
        .unwrap();
    assert_eq!(
        still, broken,
        "the old file still holds exactly what it held"
    );
    assert!(!dir.path().join("clients.json.enc.migrated").exists());

    // The cause is fixed; the next start moves everything in.
    write_legacy(dir.path(), &legacy_clients());
    let mut app = start("kitbroken", dir.path()).await;
    app.login().await;
    let (_, status) = app.get_json("/api/kit/status").await;
    assert!(
        !status["problems"].to_string().contains("kit database"),
        "{status}"
    );
    app.shutdown().await;
    assert!(dir.path().join("clients.json.enc.migrated").exists());
    assert_eq!(count(&kit_db(dir.path(), "kitbroken"), "kit_clients"), 2);
}
