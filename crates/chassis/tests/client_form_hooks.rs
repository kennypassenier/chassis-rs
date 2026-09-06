//! K16 (1.7.0): a project's extra fields on the issue form and its say
//! before a token is issued / after a client is deleted. Almanac's case: a
//! source is a name AND a calendar; one click makes the profile and the
//! token, and deleting the client deletes the profile.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use chassis::shell::dashboard::ClientFormField;
use chassis::{App, AppSpec, Error};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

type Issued = Arc<Mutex<Vec<(String, BTreeMap<String, String>)>>>;

const TOKEN: &str = "a-login-token-that-is-long-enough";
const KEY: &str = "abababababababababababababababababababababababababababababababab";

fn env(dir: &std::path::Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("HOOKDEMO_STATE_DIR".into(), dir.display().to_string());
    env.insert("HOOKDEMO_LISTEN".into(), "127.0.0.1:0".into());
    env.insert("HOOKDEMO_LOG".into(), "warn".into());
    env.insert("HOOKDEMO_TOKEN".into(), TOKEN.into());
    env.insert("HOOKDEMO_SECRET_KEY".into(), KEY.into());
    env.insert(
        "HOOKDEMO_PUBLIC_URL".into(),
        "https://hookdemo.example.lan".into(),
    );
    env
}

/// One raw HTTP/1.1 request; returns (status, headers lowercased, body).
async fn http(
    addr: std::net::SocketAddr,
    method: &str,
    path: &str,
    extra: &[(&str, &str)],
    body: &str,
) -> (u16, String, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\n");
    for (k, v) in extra {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text.split_whitespace().nth(1).unwrap().parse().unwrap();
    let mut parts = text.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or_default().to_ascii_lowercase();
    let body = parts.next().unwrap_or_default().to_string();
    (status, headers, body)
}

fn cookie(headers: &str) -> String {
    let line = headers
        .lines()
        .find(|l| l.starts_with("set-cookie:"))
        .expect("a session cookie");
    line["set-cookie:".len()..]
        .trim()
        .split(';')
        .next()
        .unwrap()
        .to_string()
}

#[tokio::test]
async fn extra_fields_reach_the_issue_hook_and_a_refusal_issues_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let issued: Issued = Default::default();
    let deleted: Arc<Mutex<Vec<String>>> = Default::default();
    let mut app = App::from_args_with_env(
        AppSpec {
            name: "hookdemo",
            version: "0.0.0",
            ..Default::default()
        },
        vec!["hookdemo".into()],
        env(dir.path()),
        axum::Router::new(),
    )
    .unwrap();
    app.client_form_field(ClientFormField::select("calendar", "Calendar", || {
        vec![
            ("cal-1".into(), "Household".into()),
            ("cal-2".into(), "Work".into()),
        ]
    }));
    let seen = issued.clone();
    app.on_client_issued(move |client, fields| {
        if fields.get("calendar").map(String::as_str) == Some("cal-2") {
            return Err(Error::invalid(
                "the Work calendar is read-only",
                "pick another calendar",
            ));
        }
        seen.lock()
            .unwrap()
            .push((client.name.clone(), fields.clone()));
        Ok(())
    });
    let gone = deleted.clone();
    app.on_client_deleted(move |client| gone.lock().unwrap().push(client.name.clone()));
    let running = app.start().await.unwrap();
    let addr = running.addr;

    let (status, headers, _) = http(
        addr,
        "POST",
        "/login",
        &[("Content-Type", "application/x-www-form-urlencoded")],
        &format!("token={TOKEN}"),
    )
    .await;
    assert_eq!(status, 303);
    let cookie = cookie(&headers);
    let json = [
        ("Content-Type", "application/json"),
        ("Cookie", cookie.as_str()),
    ];

    // The page offers the field with today's options.
    let (_, _, page) = http(addr, "GET", "/clients", &[("Cookie", &cookie)], "").await;
    assert!(
        page.contains("<select class=\"kp-field__input\" id=\"field-calendar\" name=\"calendar\""),
        "{page}"
    );
    assert!(
        page.contains("<option value=\"cal-1\">Household</option>"),
        "{page}"
    );

    // A refused issue: the kit's error, and no client exists afterwards.
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &json,
        r#"{"name":"job-tracker","calendar":"cal-2"}"#,
    )
    .await;
    assert_eq!(status, 400, "{body}");
    assert!(
        body.contains("read-only") && body.contains("pick another calendar"),
        "{body}"
    );
    let (_, _, list) = http(addr, "GET", "/api/clients", &[("Cookie", &cookie)], "").await;
    assert_eq!(list.trim(), "[]", "nothing was issued: {list}");
    assert!(issued.lock().unwrap().is_empty());

    // An accepted one: the hook saw the client-to-be and the field.
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &json,
        r#"{"name":"job-tracker","calendar":"cal-1"}"#,
    )
    .await;
    assert_eq!(status, 201, "{body}");
    let view: serde_json::Value = serde_json::from_str(&body).unwrap();
    let id = view["id"].as_str().unwrap().to_string();
    {
        let seen = issued.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, "job-tracker");
        assert_eq!(seen[0].1.get("calendar").unwrap(), "cal-1");
    }

    // A duplicate name is refused before the hook runs.
    let (status, _, body) = http(
        addr,
        "POST",
        "/api/clients",
        &json,
        r#"{"name":"job-tracker","calendar":"cal-1"}"#,
    )
    .await;
    assert_eq!(status, 400, "{body}");
    assert_eq!(
        issued.lock().unwrap().len(),
        1,
        "the hook did not run again"
    );

    // Deleting tells the project.
    let (status, _, _) = http(
        addr,
        "DELETE",
        &format!("/api/clients/{id}"),
        &[("Cookie", &cookie)],
        "",
    )
    .await;
    assert_eq!(status, 204);
    assert_eq!(
        deleted.lock().unwrap().as_slice(),
        ["job-tracker".to_string()]
    );

    running.stop().await;
}
