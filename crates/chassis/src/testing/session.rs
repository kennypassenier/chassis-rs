//! Acting as the admin or as a client: the login token and session cookie,
//! logging in, issuing a client and the final shutdown.

use super::{IssuedClient, TestApp};

impl TestApp {
    /// The admin login token (`<PREFIX>_TOKEN`), for a test that logs in by
    /// hand or sends it as a bearer. Panics on an app from
    /// [`TestApp::start_open`], which has none.
    pub fn token(&self) -> &str {
        self.token.as_deref().unwrap_or_else(|| {
            panic!(
                "this app runs with an OPEN dashboard and has no login token. What now: start it with TestApp::start (which generates secrets) when the test needs to log in"
            )
        })
    }

    /// The admin session cookie (`name=value`) once [`TestApp::login`] ran,
    /// for a request the helpers do not build.
    pub fn session_cookie(&self) -> Option<&str> {
        self.session.as_deref()
    }

    /// Log in as the admin with the login token and keep the session
    /// cookie, so [`TestApp::page`], [`TestApp::get_json`],
    /// [`TestApp::post_json`], [`TestApp::delete`] and
    /// [`TestApp::issue_client`] act as the logged-in admin from here on.
    /// Panics when the login does not answer 303 with a cookie.
    pub async fn login(&mut self) {
        let token = self.token().to_string();
        let response = self
            .client
            .post(self.url("/login"))
            .timeout(self.timeout)
            .form(&[("token", token.as_str())])
            .send()
            .await
            .unwrap_or_else(|e| panic!("POST /login did not answer: {e}"));
        let status = response.status().as_u16();
        let cookie = response
            .headers()
            .get(reqwest::header::SET_COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').next())
            .map(str::to_string);
        match (status, cookie) {
            (303, Some(cookie)) => self.session = Some(cookie),
            (status, cookie) => {
                let body = response.text().await.unwrap_or_default();
                panic!(
                    "login as the admin failed: status {status}, cookie {cookie:?}, body: {body}. What now: the login route is the kit's; if the app registered a rate limit or a guard that refuses it, start the test with it relaxed"
                );
            }
        }
    }

    /// Issue a client through `POST /api/clients` as the admin — `fields`
    /// are the project's extra issue-form fields (K16), by name — and
    /// reveal its token the way the Clients page's Reveal button does.
    /// Panics unless the issue answers 201 and the reveal 200; call
    /// [`TestApp::login`] first.
    pub async fn issue_client(&self, name: &str, fields: &[(&str, &str)]) -> IssuedClient {
        if self.session.is_none() {
            panic!(
                "issue_client needs the admin session. What now: call `app.login().await` before issuing a client"
            );
        }
        let mut body = serde_json::Map::new();
        body.insert(
            "name".to_string(),
            serde_json::Value::String(name.to_string()),
        );
        for (key, value) in fields {
            body.insert(
                (*key).to_string(),
                serde_json::Value::String((*value).to_string()),
            );
        }
        let (status, view) = self
            .post_json("/api/clients", serde_json::Value::Object(body))
            .await;
        assert_eq!(
            status, 201,
            "issuing client `{name}` was refused: {view}. What now: the message is the kit's or the project's on_client_issued hook's; give the client a free name and the fields the hook expects"
        );
        let id = view["id"]
            .as_str()
            .unwrap_or_else(|| panic!("the issued client has no id: {view}"))
            .to_string();
        let (status, revealed) = self.get_json(&format!("/api/clients/{id}/token")).await;
        assert_eq!(
            status, 200,
            "revealing the token of client `{name}` ({id}) failed: {revealed}"
        );
        let token = revealed["token"]
            .as_str()
            .unwrap_or_else(|| panic!("the reveal carries no token: {revealed}"))
            .to_string();
        IssuedClient {
            id,
            name: name.to_string(),
            token,
        }
    }

    /// Stop the server the way SIGTERM would: drain in-flight requests and
    /// run the flush hooks (the stores persist). A second call does
    /// nothing. The state directory stays until the `TestApp` is dropped,
    /// so a test can look at what the stop wrote.
    pub async fn shutdown(&mut self) {
        if let Some(running) = self.running.take() {
            running.stop().await;
        }
    }
}
