//! K30 end to end: `chassis clients` against a real service started
//! in-process with the dashboard feature. The binary is the one cargo just
//! built (`CARGO_BIN_EXE_chassis`); the token it needs travels only through
//! the child's environment, and every test asserts that argv never carries
//! it — the whole point of `--token-env`.
//!
//! The shared service and command live in `clients_cli/support.rs`; the long
//! token life cycle is `clients_cli/round_trip.rs`.

#[path = "clients_cli/round_trip.rs"]
mod round_trip;
#[path = "clients_cli/support.rs"]
mod support;

use std::collections::BTreeMap;
use std::process::Command;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::get;
use chassis::Error;

use support::*;

/// What the issue hook records: the client's name and the form fields.
type Issued = Arc<Mutex<Vec<(String, BTreeMap<String, String>)>>>;

// Drilled red once: `revoke` was made to print nothing to stderr and the
// "revoked" assert failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_issue_reveal_reissue_revoke_delete_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path()).start().await.unwrap();
    let service = round_trip::Service {
        base: base(&running),
        addr: running.addr,
    };
    round_trip::walk(&service).await;
    running.stop().await;
}

// Drilled red once: the wrong token was made the right one and the exit
// code assert failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_a_wrong_admin_token_is_refused_with_a_remedy_and_never_echoed() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path()).start().await.unwrap();
    let base = base(&running);
    let wrong = "not-the-admin-token-of-this-service-at-all";

    let (code, out, err) = run(chassis(&base, &["list"], Some(wrong))).await;
    assert_eq!(code, 1, "{err}");
    assert_eq!(out, "");
    assert!(err.contains(VAR), "the remedy names the variable: {err}");
    assert!(err.contains("admin token"), "{err}");
    assert!(
        !err.contains(wrong),
        "the refused value is never echoed: {err}"
    );
    assert!(err.contains("What now:"), "{err}");

    // A CLIENT token is not an admin token either.
    let (code, out, _) = run(chassis(&base, &["issue", "probe"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    let client_token = out.trim().to_string();
    let (code, _, err) = run(chassis(&base, &["list"], Some(&client_token))).await;
    assert_eq!(code, 1);
    assert!(err.contains(VAR) && !err.contains(&client_token), "{err}");

    running.stop().await;
}

// Drilled red once: the exit-code assert for the missing variable was
// flipped to 0 and failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_without_a_token_variable_or_a_url_nothing_is_sent() {
    // The listener counts connections: a refusal before the request means
    // zero of them.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let hits = Arc::new(Mutex::new(0u32));
    let counter = hits.clone();
    tokio::spawn(async move {
        while let Ok((_s, _)) = listener.accept().await {
            *counter.lock().unwrap() += 1;
        }
    });
    let base = format!("http://{addr}");

    // No variable at all: exit 1, the remedy names it and the flag.
    let (code, out, err) = run(chassis(&base, &["list"], None)).await;
    assert_eq!(code, 1, "{err}");
    assert_eq!(out, "");
    assert!(
        err.contains(VAR) && err.contains("never accepted on the command line"),
        "{err}"
    );

    // The default variable, when --token-env is not given.
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_chassis"));
    cmd.args(["clients", "list", "--url", &base])
        .env_remove("CHASSIS_TOKEN");
    let (code, _, err) = run(cmd).await;
    assert_eq!(code, 1);
    assert!(
        err.contains("CHASSIS_TOKEN") && err.contains("--token-env"),
        "{err}"
    );

    // No --url: a usage error, exit 2.
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_chassis"));
    cmd.args(["clients", "list", "--token-env", VAR])
        .env(VAR, ADMIN);
    let (code, _, err) = run(cmd).await;
    assert_eq!(code, 2, "{err}");
    assert!(err.contains("--url"), "{err}");

    // A malformed --field: usage as well, before any request.
    let (code, _, err) = run(chassis(
        &base,
        &["issue", "x", "--field", "novalue"],
        Some(ADMIN),
    ))
    .await;
    assert_eq!(code, 2, "{err}");
    assert!(err.contains("--field key=value"), "{err}");

    assert_eq!(*hits.lock().unwrap(), 0, "no request left the process");
}

// Drilled red once: the remedy check for `--print-config` was inverted
// and failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_a_service_that_is_not_there_is_named_with_its_url_and_print_config() {
    // Bind and drop: the port is free again and nothing listens on it.
    let addr = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap()
    };
    let base = format!("http://{addr}");
    let (code, out, err) = run(chassis(&base, &["list"], Some(ADMIN))).await;
    assert_eq!(code, 1, "{err}");
    assert_eq!(out, "");
    assert!(err.contains(&base), "{err}");
    assert!(err.contains("--print-config"), "{err}");
    assert!(!err.contains(ADMIN), "{err}");

    // A service without the clients API (a plain HTTP server on the port).
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let plain = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let app = Router::new().route("/", get(|| async { "not a chassis service" }));
        axum::serve(listener, app).await.unwrap();
    });
    let (code, _, err) = run(chassis(&plain, &["list"], Some(ADMIN))).await;
    assert_eq!(code, 1, "{err}");
    assert!(
        err.contains("/api/clients") && err.contains("dashboard feature"),
        "{err}"
    );
}

// Drilled red once: the hook's recorded field was compared with `cal-2`
// and failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_extra_fields_reach_the_services_issue_hook_and_its_refusal_comes_back() {
    let dir = tempfile::tempdir().unwrap();
    let seen: Issued = Default::default();
    let mut app = app(dir.path());
    let record = seen.clone();
    app.on_client_issued(move |client, fields| {
        if fields.get("calendar").map(String::as_str) == Some("cal-2") {
            return Err(Error::invalid(
                "the Work calendar is read-only",
                "pick another calendar",
            ));
        }
        record
            .lock()
            .unwrap()
            .push((client.name.clone(), fields.clone()));
        Ok(())
    });
    let running = app.start().await.unwrap();
    let base = base(&running);

    let (code, out, err) = run(chassis(
        &base,
        &[
            "issue",
            "job-tracker",
            "--field",
            "calendar=cal-1",
            "--field",
            "note=x=y",
        ],
        Some(ADMIN),
    ))
    .await;
    assert_eq!(code, 0, "{err}");
    assert_eq!(out.trim().len(), 64);
    {
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, "job-tracker");
        assert_eq!(seen[0].1.get("calendar").unwrap(), "cal-1");
        assert_eq!(seen[0].1.get("note").unwrap(), "x=y");
    }

    // The service's refusal, with the service's remedy, and nothing issued.
    let (code, out, err) = run(chassis(
        &base,
        &["issue", "other", "--field", "calendar=cal-2"],
        Some(ADMIN),
    ))
    .await;
    assert_eq!(code, 1);
    assert_eq!(out, "");
    assert!(
        err.contains("read-only") && err.contains("pick another calendar"),
        "{err}"
    );
    let (_, out, _) = run(chassis(&base, &["list", "--json"], Some(ADMIN))).await;
    let list: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
    assert_eq!(list.len(), 1, "{out}");

    running.stop().await;
}
