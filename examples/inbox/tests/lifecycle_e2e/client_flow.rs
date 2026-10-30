//! The full client-token flow over HTTP: issue, call the API, see it in the
//! dashboard, revoke.

use super::support::*;

// K8 + K12 + K13 + K14 over the wire: log in, issue a client, use its
// token, see the capture, reveal, revoke, and be refused afterwards.
#[test]
fn client_token_flow_end_to_end() {
    let dir = tempfile::tempdir().unwrap();
    let (_child, addr) = start(dir.path());
    let base = format!("http://{addr}");
    let http = reqwest::blocking::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // A browser without a session is sent to /login; a wrong token is a 200 with a message.
    let res = http.get(format!("{base}/api/clients")).send().unwrap();
    assert_eq!(res.status(), 303, "redirect to /login, not a 401 popup");
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", "wrong")])
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    assert!(res.text().unwrap().contains("not right"));

    // Log in; the cookie is HttpOnly and named after the service.
    let res = http
        .post(format!("{base}/login"))
        .form(&[("token", TOKEN)])
        .send()
        .unwrap();
    assert_eq!(res.status(), 303);
    let set_cookie = res
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(set_cookie.starts_with("inbox_session="), "{set_cookie}");
    assert!(
        set_cookie.contains("HttpOnly") && set_cookie.contains("SameSite=Lax"),
        "{set_cookie}"
    );
    assert!(
        !set_cookie.contains("Secure"),
        "plain HTTP without a trusted proxy is not Secure"
    );

    // Issue a client; the list never shows the token.
    let res = http
        .post(format!("{base}/api/clients"))
        .json(&serde_json::json!({ "name": "home-assistant", "topic": "alerts" }))
        .send()
        .unwrap();
    assert_eq!(res.status(), 201);
    let client: serde_json::Value = res.json().unwrap();
    let id = client["id"].as_str().unwrap().to_string();
    let list = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .text()
        .unwrap();
    assert!(
        list.contains("home-assistant") && !list.contains("\"token\""),
        "{list}"
    );

    // Reveal the token (K12) and use it (K13 counts it, the capture redacts it).
    let reveal: serde_json::Value = http
        .get(format!("{base}/api/clients/{id}/token"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let token = reveal["token"].as_str().unwrap().to_string();
    assert_eq!(token.len(), 64);
    assert!(reveal["command"].as_str().unwrap().contains("/v1/messages"));

    let anon = reqwest::blocking::Client::new();
    let res = anon
        .post(format!("{base}/v1/messages"))
        .json(&serde_json::json!({"x": 1}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 401, "no token → JSON 401");
    let res = anon
        .post(format!("{base}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"temperature": 21.5}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 202);
    let accepted: serde_json::Value = res.json().unwrap();
    assert_eq!(accepted["from"], "home-assistant");

    let caps: serde_json::Value = http
        .get(format!("{base}/api/clients/{id}/requests"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    let caps = caps.as_array().unwrap();
    assert_eq!(caps.len(), 1);
    assert_eq!(caps[0]["path"], "/v1/messages");
    assert_eq!(caps[0]["status"], 202);
    assert!(caps[0]["body"].as_str().unwrap().contains("21.5"));
    let headers = caps[0]["headers"].as_array().unwrap();
    assert!(
        headers
            .iter()
            .any(|h| h[0] == "authorization" && h[1] == "***"),
        "{headers:?}"
    );
    assert!(
        !serde_json::to_string(caps).unwrap().contains(&token),
        "the token never appears in a capture"
    );

    // The test button (K14) sends with this client's token and shows up as a capture.
    let res = http
        .post(format!("{base}/api/clients/{id}/test"))
        .send()
        .unwrap();
    assert_eq!(res.status(), 200, "{}", res.text().unwrap());
    let caps: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients/{id}/requests"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(caps.len(), 2);

    // last_used_at moved (rule 22: shown to take two values).
    let list: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert!(list[0]["last_used_at"].is_string());
    assert_eq!(list[0]["uses"], 2);

    // Revoke: the token is refused within the same second; the row stays.
    let res = http
        .post(format!("{base}/api/clients/{id}/revoke"))
        .send()
        .unwrap();
    assert_eq!(res.status(), 200);
    let res = anon
        .post(format!("{base}/v1/messages"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .unwrap();
    assert_eq!(res.status(), 401);
    let list: Vec<serde_json::Value> = http
        .get(format!("{base}/api/clients"))
        .send()
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["active"], false);

    // Logout kills the session.
    let res = http.post(format!("{base}/logout")).send().unwrap();
    assert_eq!(res.status(), 303);
    let res = http.get(format!("{base}/api/clients")).send().unwrap();
    assert_eq!(res.status(), 303);

    // Plaintext scan (rule 10): the token is nowhere on disk. Since 3.11.0
    // the state dir also holds sqlite files, so the scan reads raw bytes.
    let found =
        |raw: &[u8], needle: &str| raw.windows(needle.len()).any(|w| w == needle.as_bytes());
    for entry in std::fs::read_dir(dir.path()).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            continue;
        }
        let raw = std::fs::read(&path).unwrap();
        assert!(
            !found(&raw, &token) && !found(&raw, TOKEN),
            "a secret reached disk in plaintext: {}",
            path.display()
        );
    }
}
