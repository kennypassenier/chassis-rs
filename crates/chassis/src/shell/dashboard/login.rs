//! The login page's two answers. Its own module because the login flow
//! (open dashboard redirect, https detection, the wrong-token re-render) is
//! separate from the pages the signed-in reader sees.

use super::*;

/// `GET /login`.
pub(super) fn get(d: &Dashboard, peer: std::net::SocketAddr, headers: &HeaderMap) -> Response {
    if d.open {
        // Nothing to log in with; the banner on every page says why.
        return Redirect::to("/").into_response();
    }
    let https = d.is_https(peer, headers);
    match d.login_page(None, https) {
        Ok(html) => html.into_response(),
        Err(e) => e.into_response(),
    }
}

/// `POST /login`: wrong token re-renders the page with the message and
/// HTTP 200 (K8); a good one sets the cookie and goes to the status page.
pub(super) async fn post(
    d: &Dashboard,
    peer: std::net::SocketAddr,
    headers: &HeaderMap,
    form: &LoginForm,
) -> Response {
    if d.open {
        return Redirect::to("/").into_response();
    }
    match login(&d.auth, form, peer, headers).await {
        Ok(LoginOutcome::Ok(cookie)) => {
            (CookieJar::new().add(cookie), Redirect::to("/")).into_response()
        }
        Ok(LoginOutcome::Wrong(msg)) => match d.login_page(Some(msg), d.is_https(peer, headers)) {
            Ok(html) => (StatusCode::OK, html).into_response(),
            Err(e) => e.into_response(),
        },
        Err(e) => e.into_response(),
    }
}
