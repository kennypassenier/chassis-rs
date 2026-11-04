//! The login page's two answers. Its own module because the login flow
//! (open dashboard redirect, https detection, the wrong-token re-render) is
//! separate from the pages the signed-in reader sees.

use super::*;
use crate::shell::auth::next::{self, LoginFormNext, NextQuery};

/// `GET /login`.
pub(super) fn get(
    d: &Dashboard,
    peer: std::net::SocketAddr,
    headers: &HeaderMap,
    next: Option<&str>,
) -> Response {
    if d.open {
        // Nothing to log in with; the banner on every page says why.
        return Redirect::to("/").into_response();
    }
    let https = d.is_https(peer, headers);
    match d.login_page(None, https, next) {
        Ok(html) => html.into_response(),
        Err(e) => e.into_response(),
    }
}

/// `GET /login` with `?next=` (the kit's own route; `dashboard::login_get`
/// stays for the public contract and ignores it).
pub(crate) async fn login_get_next(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<NextQuery>,
) -> Response {
    // A browser that is signed in already (another tab logged in, or the
    // session is still live) goes where the login would have gone.
    if !d.open && crate::shell::auth::still_valid(&d.auth, &headers).await {
        return Redirect::to(&next::destination(query.next.as_deref())).into_response();
    }
    get(&d, peer, &headers, query.next.as_deref())
}

/// `POST /login` with the `next` field (the kit's own route).
pub(crate) async fn login_post_next(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    axum::Form(form): axum::Form<LoginFormNext>,
) -> Response {
    let (form, next) = form.split();
    post(&d, peer, &headers, &form, next.as_deref()).await
}

/// `POST /login`: wrong token re-renders the page with the message and
/// HTTP 200 (K8); a good one sets the cookie and goes to the status page.
pub(super) async fn post(
    d: &Dashboard,
    peer: std::net::SocketAddr,
    headers: &HeaderMap,
    form: &LoginForm,
    next: Option<&str>,
) -> Response {
    if d.open {
        return Redirect::to("/").into_response();
    }
    match login(&d.auth, form, peer, headers).await {
        Ok(LoginOutcome::Ok(cookie)) => (
            CookieJar::new().add(cookie),
            Redirect::to(&next::destination(next)),
        )
            .into_response(),
        Ok(LoginOutcome::Wrong(msg)) => {
            match d.login_page(Some(msg), d.is_https(peer, headers), next) {
                Ok(html) => (StatusCode::OK, html).into_response(),
                Err(e) => e.into_response(),
            }
        }
        Err(e) => e.into_response(),
    }
}
