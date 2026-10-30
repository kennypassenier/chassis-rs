//! The full life of a client token through the CLI, one phase per function:
//! list, issue, reveal, reissue, revoke, delete. The phases share one running
//! service, so each hands the next what it needs (the token, the id).

use std::net::SocketAddr;

use super::support::{ADMIN, bearer, chassis, run};

/// A running service as the CLI sees it.
pub struct Service {
    pub base: String,
    pub addr: SocketAddr,
}

impl Service {
    /// One CLI call with the admin token: (exit code, stdout, stderr).
    async fn cli(&self, args: &[&str]) -> (i32, String, String) {
        run(chassis(&self.base, args, Some(ADMIN))).await
    }
}

/// Runs every phase in order against the service.
pub async fn walk(s: &Service) {
    empty_list(s).await;
    let token = issue(s).await;
    let id = list_shows_the_client(s, &token).await;
    reveal(s, &token, &id).await;
    let token2 = reissue(s, &token).await;
    issue_json(s).await;
    duplicate_name(s).await;
    revoke(s, &token2).await;
    delete(s, &id).await;
    unknown_client(s).await;
}

/// Nothing yet: the human list says so, the JSON list is an empty array.
async fn empty_list(s: &Service) {
    let (code, out, _) = s.cli(&["list"]).await;
    assert_eq!(code, 0);
    assert!(out.contains("no clients yet"), "{out}");
    let (code, out, _) = s.cli(&["list", "--json"]).await;
    assert_eq!(code, 0);
    assert_eq!(out.trim(), "[]");
}

/// issue: stdout is the token and nothing else; the confirmation is on
/// stderr; the token opens the API door.
async fn issue(s: &Service) -> String {
    let (code, out, err) = s.cli(&["issue", "alertmanager"]).await;
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
        bearer(s.addr, "/v1/ping", &token).await,
        (200, "pong".to_string())
    );
    token
}

/// list: the client is there, by name, active, and the token is not.
/// Returns the client's id.
async fn list_shows_the_client(s: &Service, token: &str) -> String {
    let (code, out, _) = s.cli(&["list"]).await;
    assert_eq!(code, 0);
    assert!(
        out.contains("alertmanager") && out.contains("active"),
        "{out}"
    );
    assert!(!out.contains(token), "{out}");
    let (_, out, _) = s.cli(&["list", "--json"]).await;
    let list: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["name"], "alertmanager");
    let id = list[0]["id"].as_str().unwrap().to_string();
    assert!(!out.contains(token));
    id
}

/// reveal by name and by id: the same token, once.
async fn reveal(s: &Service, token: &str, id: &str) {
    let (code, out, _) = s.cli(&["reveal", "alertmanager"]).await;
    assert_eq!(code, 0);
    assert_eq!(out.trim(), token);
    let (code, out, _) = s.cli(&["reveal", id, "--json"]).await;
    assert_eq!(code, 0);
    let reveal: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(reveal["token"], token);
    assert!(reveal["command"].as_str().unwrap().starts_with("curl"));
}

/// reissue: a new token on stdout; the old one is refused the same second.
async fn reissue(s: &Service, token: &str) -> String {
    let (code, out, err) = s.cli(&["reissue", "alertmanager"]).await;
    assert_eq!(code, 0, "{err}");
    let token2 = out.trim().to_string();
    assert_ne!(token2, token);
    assert_eq!(out.lines().count(), 1);
    assert!(err.contains("re-issued"), "{err}");
    assert_eq!(bearer(s.addr, "/v1/ping", token).await.0, 401);
    assert_eq!(bearer(s.addr, "/v1/ping", &token2).await.0, 200);
    token2
}

/// --json on issue folds the token into the view, for scripts that
/// want the id as well.
async fn issue_json(s: &Service) {
    let (code, out, _) = s.cli(&["issue", "grafana", "--json"]).await;
    assert_eq!(code, 0);
    let issued: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(issued["name"], "grafana");
    assert_eq!(issued["token"].as_str().unwrap().len(), 64);
    assert!(issued["id"].is_string());
}

/// A duplicate name is the service's refusal, passed through with its remedy.
async fn duplicate_name(s: &Service) {
    let (code, out, err) = s.cli(&["issue", "grafana"]).await;
    assert_eq!(code, 1);
    assert_eq!(out, "", "nothing on stdout when refused");
    assert!(
        err.contains("already has a token") && err.contains("What now:"),
        "{err}"
    );
}

/// revoke: 401 for the caller, the row stays as revoked, the name is free.
async fn revoke(s: &Service, token2: &str) {
    let (code, out, err) = s.cli(&["revoke", "alertmanager"]).await;
    assert_eq!(code, 0, "{err}");
    assert_eq!(out, "", "revoke prints nothing on stdout without --json");
    assert!(err.contains("revoked client `alertmanager`"), "{err}");
    assert_eq!(bearer(s.addr, "/v1/ping", token2).await.0, 401);
    let (_, out, _) = s.cli(&["list"]).await;
    assert!(out.contains("revoked"), "{out}");
    let (code, _, err) = s.cli(&["reveal", "alertmanager"]).await;
    assert_eq!(code, 1, "a revoked client has no token to reveal");
    assert!(
        err.contains("revoked") && err.contains("What now:"),
        "{err}"
    );
}

/// delete by id: gone from the list; the other client stays.
async fn delete(s: &Service, id: &str) {
    let (code, _, err) = s.cli(&["delete", id]).await;
    assert_eq!(code, 0, "{err}");
    assert!(err.contains("deleted client `alertmanager`"), "{err}");
    let (_, out, _) = s.cli(&["list", "--json"]).await;
    let list: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["name"], "grafana");
    let (code, out, _) = s.cli(&["delete", "grafana", "--json"]).await;
    assert_eq!(code, 0);
    let gone: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(gone["deleted"], true);
    assert_eq!(gone["name"], "grafana");
}

/// An unknown client: exit 1 and the list command as the remedy.
async fn unknown_client(s: &Service) {
    let (code, out, err) = s.cli(&["revoke", "nobody"]).await;
    assert_eq!(code, 1);
    assert_eq!(out, "");
    assert!(
        err.contains("nobody") && err.contains("chassis clients list"),
        "{err}"
    );
}
