//! Trusted sources (3.13.0; Kenny, 2026-10-22: "mijn pc heeft altijd
//! toegang, zonder token. Niemand neemt dit adres ooit over").
//!
//! A request from one of `<P>_TRUSTED_ADMINS` is the admin without a
//! session, a token or a passkey. The address is the client address the
//! guards already use (3.14.1, Kenny 2026-10-30, route "thuis lokaal
//! houden"): the TCP peer, or, when the peer is a trusted proxy, the last
//! `X-Forwarded-For` hop, which the proxy itself appended. Anything a client
//! writes earlier in that header is never read, and a forwarded header from
//! a peer that is not a trusted proxy is ignored. An address may not be both
//! a trusted proxy and a trusted admin. A bearer still decides when one is
//! sent, so a script on that machine keeps its own identity.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::extract::{ConnectInfo, Request, State};
use axum::http::Extensions;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::core::error::Error;

/// Set on a request whose peer is a trusted admin; never taken from the
/// client (the layer removes any copy before deciding).
#[derive(Debug, Clone, Copy)]
pub(crate) struct TrustedSource;

/// The layer's state: the addresses, and whether the first admission was
/// logged already.
#[derive(Debug, Clone)]
pub(crate) struct TrustedAdmins {
    addrs: Arc<Vec<IpAddr>>,
    proxies: Arc<Vec<IpAddr>>,
    logged: Arc<AtomicBool>,
}

impl TrustedAdmins {
    pub(crate) fn new(addrs: Vec<IpAddr>, proxies: Vec<IpAddr>) -> Self {
        TrustedAdmins {
            addrs: Arc::new(addrs),
            proxies: Arc::new(proxies),
            logged: Arc::new(AtomicBool::new(false)),
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.addrs.is_empty()
    }

    fn admits(&self, peer: IpAddr) -> bool {
        let peer = peer.to_canonical();
        self.addrs.iter().any(|a| a.to_canonical() == peer)
    }
}

/// `trusted_admins`: exact IP addresses separated by commas. Refused: a
/// value that is not an address, an unspecified address (`0.0.0.0`, `::`),
/// and an address that is also a trusted proxy (everyone behind that proxy
/// would be the admin).
pub(crate) fn parse_trusted_admins(raw: &str, proxies: &[IpAddr]) -> Result<Vec<IpAddr>, Error> {
    let mut out = Vec::new();
    for s in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let ip: IpAddr = s.parse().map_err(|_| {
            Error::config(
                format!("trusted_admins entry `{s}` is not an IP address"),
                "list exact addresses separated by commas, e.g. 10.10.10.10; ranges are not accepted",
            )
        })?;
        if ip.is_unspecified() {
            return Err(Error::config(
                format!("trusted_admins entry `{s}` means every address"),
                "list the one machine that may skip the login, e.g. 10.10.10.10",
            ));
        }
        if proxies
            .iter()
            .any(|p| p.to_canonical() == ip.to_canonical())
        {
            return Err(Error::config(
                format!("{s} is both a trusted proxy and a trusted admin"),
                "a proxy forwards everyone; remove it from trusted_admins and list the machine behind it only if it reaches the service directly",
            ));
        }
        out.push(ip);
    }
    Ok(out)
}

/// Outermost layer: mark a request from a trusted admin.
pub(crate) async fn mark(
    State(trusted): State<TrustedAdmins>,
    mut req: Request,
    next: Next,
) -> Response {
    req.extensions_mut().remove::<TrustedSource>();
    let peer = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(p)| crate::shell::guards::client_ip(*p, req.headers(), &trusted.proxies));
    if let Some(peer) = peer
        && trusted.admits(peer)
    {
        if !trusted.logged.swap(true, Ordering::Relaxed) {
            tracing::info!(%peer, "a trusted source is signed in as the admin without a login");
        }
        // This machine is the admin already: the login page has nothing to
        // ask it.
        if req.method() == axum::http::Method::GET && req.uri().path() == "/login" {
            return axum::response::Redirect::to("/").into_response();
        }
        req.extensions_mut().insert(TrustedSource);
    }
    next.run(req).await
}

/// Whether the layer marked this request.
pub(crate) fn is_trusted(ext: &Extensions) -> bool {
    ext.get::<TrustedSource>().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_addresses_parse_and_unsafe_ones_are_refused() {
        let ok = parse_trusted_admins(" 10.10.10.10 , ::1", &[]).unwrap();
        assert_eq!(ok.len(), 2);
        assert!(parse_trusted_admins("", &[]).unwrap().is_empty());
        assert!(parse_trusted_admins("10.10.10.0/24", &[]).is_err());
        assert!(parse_trusted_admins("0.0.0.0", &[]).is_err());
        assert!(parse_trusted_admins("::", &[]).is_err());
        let proxy: IpAddr = "10.10.10.4".parse().unwrap();
        assert!(parse_trusted_admins("10.10.10.4", &[proxy]).is_err());
    }

    #[test]
    fn an_ipv4_mapped_peer_matches_its_ipv4_address() {
        let t = TrustedAdmins::new(vec!["10.10.10.10".parse().unwrap()], Vec::new());
        assert!(t.admits("::ffff:10.10.10.10".parse().unwrap()));
        assert!(t.admits("10.10.10.10".parse().unwrap()));
        assert!(!t.admits("10.10.10.11".parse().unwrap()));
    }

    /// Kenny, 2026-10-22: "Zie dat het werkt voor 10.10.10.10". His PC's
    /// own connection is marked; a neighbour, or a header naming his PC, is not.
    #[tokio::test]
    async fn kennys_pc_at_10_10_10_10_is_marked_and_nothing_else_is() {
        use axum::Router;
        use axum::body::Body;
        use axum::routing::get;
        use tower::ServiceExt;

        let app = Router::new()
            .route(
                "/",
                get(|req: Request| async move {
                    if is_trusted(req.extensions()) {
                        "admin"
                    } else {
                        "login"
                    }
                }),
            )
            .layer(axum::middleware::from_fn_with_state(
                TrustedAdmins::new(
                    parse_trusted_admins("10.10.10.10", &[]).unwrap(),
                    vec!["10.10.10.4".parse().unwrap()],
                ),
                mark,
            ));
        let ask = |peer: &str, xff: Option<&str>| {
            let mut req = axum::http::Request::get("/").body(Body::empty()).unwrap();
            if let Some(x) = xff {
                req.headers_mut()
                    .insert("x-forwarded-for", x.parse().unwrap());
            }
            req.extensions_mut()
                .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
            let app = app.clone();
            async move {
                let r = app.oneshot(req).await.unwrap();
                let b = axum::body::to_bytes(r.into_body(), 1024).await.unwrap();
                String::from_utf8(b.to_vec()).unwrap()
            }
        };
        assert_eq!(ask("10.10.10.10:51515", None).await, "admin");
        assert_eq!(ask("[::ffff:10.10.10.10]:51515", None).await, "admin");
        assert_eq!(ask("10.10.10.11:51515", None).await, "login");
        // 3.14.1: through the trusted proxy (Traefik, 10.10.10.4) the last
        // hop it appended counts; what the client wrote before it does not.
        assert_eq!(ask("10.10.10.4:443", Some("10.10.10.10")).await, "admin");
        assert_eq!(
            ask("10.10.10.4:443", Some("10.10.10.10, 10.10.10.55")).await,
            "login"
        );
        assert_eq!(ask("10.10.10.4:443", None).await, "login");
        // A forwarded header from a peer that is not a trusted proxy is ignored.
        assert_eq!(ask("10.10.10.55:51515", Some("10.10.10.10")).await, "login");
    }
}
