//! K30 end to end: `chassis clients` against a real service started
//! in-process with the dashboard feature. The binary is the one cargo just
//! built (`CARGO_BIN_EXE_chassis`); the token it needs travels only through
//! the child's environment, and every test asserts that argv never carries
//! it — the whole point of `--token-env`.

use std::collections::BTreeMap;
use std::process::{Command, Output};
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::routing::get;
use chassis::{App, AppSpec, Error, Running};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// What the issue hook records: the client's name and the form fields.
type Issued = Arc<Mutex<Vec<(String, BTreeMap<String, String>)>>>;

const ADMIN: &str = "an-admin-token-that-is-long-enough-k30";
const KEY: &str = "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
const VAR: &str = "TEST_ADMIN_TOKEN";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("CLIDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("CLIDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("CLIDEMO_LOG".into(), "warn".into());
    env.insert("CLIDEMO_TOKEN".into(), ADMIN.into());
    env.insert("CLIDEMO_SECRET_KEY".into(), KEY.into());
    // Only read when the passkeys feature is compiled in (--all-features).
    env.insert(
        "CLIDEMO_PUBLIC_URL".into(),
        "https://clidemo.example.lan".into(),
    );
    env
}

fn app(dir: &std::path::Path) -> App {
    let mut app = App::from_args_with_env(
        AppSpec {
            name: "clidemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["clidemo".into()],
        env(dir),
        Router::new(),
    )
    .unwrap();
    // The door a client token opens: what the E2E checks each token against.
    app.api_routes(Router::new().route("/v1/ping", get(|| async { "pong" })));
    app
}

fn base(running: &Running) -> String {
    format!("http://{}", running.addr)
}

/// The command under test. The admin token goes into the child's
/// environment under `VAR`, or nowhere when `token` is `None`; the
/// process's own `CHASSIS_TOKEN` is removed so the default never leaks in.
fn chassis(base: &str, args: &[&str], token: Option<&str>) -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_chassis"));
    cmd.arg("clients")
        .args(args)
        .args(["--url", base, "--token-env", VAR])
        .env_remove("CHASSIS_TOKEN");
    if let Some(t) = token {
        cmd.env(VAR, t);
    }
    // K30's first rule: the token is never on argv.
    for a in cmd.get_args() {
        let a = a.to_string_lossy();
        assert!(!a.contains(ADMIN), "argv carries the admin token: {a}");
        assert!(
            a != VAR || true,
            "the variable NAME may appear; its value may not"
        );
    }
    cmd
}

/// Run the command off the runtime thread and hand back the three things
/// every assertion needs.
async fn run(mut cmd: Command) -> (i32, String, String) {
    let Output {
        status,
        stdout,
        stderr,
    } = tokio::task::spawn_blocking(move || cmd.output().unwrap())
        .await
        .unwrap();
    (
        status.code().unwrap_or(-1),
        String::from_utf8_lossy(&stdout).to_string(),
        String::from_utf8_lossy(&stderr).to_string(),
    )
}

/// One raw HTTP/1.1 request with a bearer; returns (status, body).
async fn bearer(addr: std::net::SocketAddr, path: &str, token: &str) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text.split_whitespace().nth(1).unwrap().parse().unwrap();
    let body = text
        .split_once("\r\n\r\n")
        .map(|(_, b)| b)
        .unwrap_or_default()
        .to_string();
    (status, body)
}

// Drilled red once: `revoke` was made to print nothing to stderr and the
// "revoked" assert failed.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn k30_issue_reveal_reissue_revoke_delete_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let running = app(dir.path()).start().await.unwrap();
    let addr = running.addr;
    let base = base(&running);

    // Nothing yet: the human list says so, the JSON list is an empty array.
    let (code, out, _) = run(chassis(&base, &["list"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    assert!(out.contains("no clients yet"), "{out}");
    let (code, out, _) = run(chassis(&base, &["list", "--json"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "[]");

    // issue: stdout is the token and nothing else; the confirmation is on
    // stderr; the token opens the API door.
    let (code, out, err) = run(chassis(&base, &["issue", "alertmanager"], Some(ADMIN))).await;
    assert_eq!(code, 0, "{err}");
    let token = out.trim().to_string();
    assert_eq!(
        out.lines().count(),
        1,
        "exactly one line on stdout: {out:?}"
    );
    assert_eq!(token.len(), 64, "a 32-byte hex token: {token}");
    assert!(token.chars().all(|c| c.is_ascii_hexdigit()), "{token}");
    assert!(
        err.contains("issued a token for client `alertmanager`"),
        "{err}"
    );
    assert!(!err.contains(&token), "the token is not repeated on stderr");
    assert_eq!(
        bearer(addr, "/v1/ping", &token).await,
        (200, "pong".to_string())
    );

    // list: the client is there, by name, active, and the token is not.
    let (code, out, _) = run(chassis(&base, &["list"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    assert!(
        out.contains("alertmanager") && out.contains("active"),
        "{out}"
    );
    assert!(!out.contains(&token), "{out}");
    let (_, out, _) = run(chassis(&base, &["list", "--json"], Some(ADMIN))).await;
    let list: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["name"], "alertmanager");
    let id = list[0]["id"].as_str().unwrap().to_string();
    assert!(!out.contains(&token));

    // reveal by name and by id: the same token, once.
    let (code, out, _) = run(chassis(&base, &["reveal", "alertmanager"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    assert_eq!(out.trim(), token);
    let (code, out, _) = run(chassis(&base, &["reveal", &id, "--json"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    let reveal: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(reveal["token"], token);
    assert!(reveal["command"].as_str().unwrap().starts_with("curl"));

    // reissue: a new token on stdout; the old one is refused the same second.
    let (code, out, err) = run(chassis(&base, &["reissue", "alertmanager"], Some(ADMIN))).await;
    assert_eq!(code, 0, "{err}");
    let token2 = out.trim().to_string();
    assert_ne!(token2, token);
    assert_eq!(out.lines().count(), 1);
    assert!(err.contains("re-issued"), "{err}");
    assert_eq!(bearer(addr, "/v1/ping", &token).await.0, 401);
    assert_eq!(bearer(addr, "/v1/ping", &token2).await.0, 200);

    // --json on issue folds the token into the view, for scripts that
    // want the id as well.
    let (code, out, _) = run(chassis(&base, &["issue", "grafana", "--json"], Some(ADMIN))).await;
    assert_eq!(code, 0);
    let issued: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(issued["name"], "grafana");
    assert_eq!(issued["token"].as_str().unwrap().len(), 64);
    assert!(issued["id"].is_string());

    // A duplicate name is the service's refusal, passed through with its remedy.
    let (code, out, err) = run(chassis(&base, &["issue", "grafana"], Some(ADMIN))).await;
    assert_eq!(code, 1);
    assert_eq!(out, "", "nothing on stdout when refused");
    assert!(
        err.contains("already has a token") && err.contains("What now:"),
        "{err}"
    );

    // revoke: 401 for the caller, the row stays as revoked, the name is free.
    let (code, out, err) = run(chassis(&base, &["revoke", "alertmanager"], Some(ADMIN))).await;
    assert_eq!(code, 0, "{err}");
    assert_eq!(out, "", "revoke prints nothing on stdout without --json");
    assert!(err.contains("revoked client `alertmanager`"), "{err}");
    assert_eq!(bearer(addr, "/v1/ping", &token2).await.0, 401);
    let (_, out, _) = run(chassis(&base, &["list"], Some(ADMIN))).await;
    assert!(out.contains("revoked"), "{out}");
    let (code, _, err) = run(chassis(&base, &["reveal", "alertmanager"], Some(ADMIN))).await;
    assert_eq!(code, 1, "a revoked client has no token to reveal");
    assert!(
        err.contains("revoked") && err.contains("What now:"),
        "{err}"
    );

    // delete by id: gone from the list; the other client stays.
    let (code, _, err) = run(chassis(&base, &["delete", &id], Some(ADMIN))).await;
    assert_eq!(code, 0, "{err}");
    assert!(err.contains("deleted client `alertmanager`"), "{err}");
    let (_, out, _) = run(chassis(&base, &["list", "--json"], Some(ADMIN))).await;
    let list: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["name"], "grafana");
    let (code, out, _) = run(chassis(
        &base,
        &["delete", "grafana", "--json"],
        Some(ADMIN),
    ))
    .await;
    assert_eq!(code, 0);
    let gone: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(gone["deleted"], true);
    assert_eq!(gone["name"], "grafana");

    // An unknown client: exit 1 and the list command as the remedy.
    let (code, out, err) = run(chassis(&base, &["revoke", "nobody"], Some(ADMIN))).await;
    assert_eq!(code, 1);
    assert_eq!(out, "");
    assert!(
        err.contains("nobody") && err.contains("chassis clients list"),
        "{err}"
    );

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
