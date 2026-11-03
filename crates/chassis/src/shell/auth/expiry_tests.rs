//! Locks the session lifetime contract: the server-side expiry of a
//! session and the cookie's `Max-Age` must say the same thing, or a cookie
//! outlives its session (confusing logout) or the other way round.

use axum::http::HeaderMap;

use super::door_tests::auth_state;
use super::*;

fn peer() -> std::net::SocketAddr {
    "127.0.0.1:9".parse().unwrap()
}

async fn login_with(state: &AuthState, remember: bool) -> Cookie<'static> {
    let form = LoginForm {
        token: "a-long-enough-login-token".into(),
        remember: remember.then(|| "on".to_string()),
    };
    match login(state, &form, peer(), &HeaderMap::new()).await {
        Ok(LoginOutcome::Ok(cookie)) => cookie,
        _ => panic!("login must succeed with the right token"),
    }
}

#[tokio::test]
async fn a_remember_me_cookie_and_its_session_expire_together() {
    let mut state = auth_state();
    state.session_ttl_secs = 60;
    state.remember_me_secs = 600;
    let cookie = login_with(&state, true).await;
    let max_age = cookie.max_age().expect("remember-me sets Max-Age");
    assert_eq!(max_age.whole_seconds(), 600);
    let sessions = state.sessions.state.read().await;
    let s = &sessions.sessions[0];
    assert!(s.remember);
    assert_eq!(
        s.expires_at - s.created_at,
        max_age.whole_seconds() as u64,
        "server expiry equals the cookie Max-Age"
    );
}

#[tokio::test]
async fn a_plain_cookie_lives_for_the_browser_session_and_the_server_slides_it() {
    let mut state = auth_state();
    state.session_ttl_secs = 60;
    state.remember_me_secs = 600;
    let cookie = login_with(&state, false).await;
    assert!(
        cookie.max_age().is_none(),
        "a plain login is a browser-session cookie; the server owns its end"
    );
    let sessions = state.sessions.state.read().await;
    let s = &sessions.sessions[0];
    assert!(!s.remember);
    assert_eq!(s.expires_at - s.created_at, 60, "session_ttl_secs applies");
}
