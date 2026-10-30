//! The passkey routes of the dashboard (`passkeys` feature): the public
//! login ceremony, the admin registration API and the passkeys page.

use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{delete, get, post};

use super::Ctx;
use super::kit_routes::page_on;
use super::stores::KitStores;
use crate::core::error::Error;
use crate::shell::auth::{AuthState, require_admin};
use crate::shell::dashboard::Dashboard;
use crate::shell::guards::{IpLimit, ip_rate_limit};
use crate::shell::store::EncryptedFile;

/// The passkey routers; empty when the dashboard runs open or the page is
/// switched off.
pub(super) fn routes(
    ctx: &Ctx,
    disabled: &[String],
    kit_renders: bool,
    auth: &AuthState,
    dash: &Dashboard,
    stores: &KitStores,
    login_limit: &IpLimit,
) -> Result<Router, Error> {
    let spec = ctx.spec;
    let loaded = ctx.loaded;
    let limits = ctx.limits;
    let prefix = &ctx.prefix;
    let guards = &ctx.guards;
    let seal_key = &ctx.seal_key;
    let (use_db, kit) = (stores.use_db, &stores.kit);
    if ctx.open || !page_on(disabled, "passkeys") {
        return Ok(Router::new());
    }
    use crate::shell::passkeys::{self, PasskeyState};
    use axum::routing::patch;
    let webauthn = passkeys::build_webauthn(spec.name, prefix, limits.public_url.as_deref())?;
    let ceremony_limits = passkeys::CeremonyLimits {
        cap: limits.passkey_ceremony_cap,
        ttl: limits.passkey_ceremony_ttl,
        per_ip: limits.passkey_ceremonies_per_ip,
    };
    let pk = if use_db {
        PasskeyState::open_db(
            webauthn,
            auth.clone(),
            kit.clone(),
            ceremony_limits,
            guards.clone(),
        )?
    } else {
        PasskeyState::open(
            webauthn,
            auth.clone(),
            EncryptedFile::new(
                loaded.state_dir.join("passkeys.json.enc"),
                seal_key.clone(),
                "passkeys store",
            ),
            ceremony_limits,
            guards.clone(),
        )?
    };
    // S6: the same per-IP limiter as /login — an unauthenticated peer
    // gets login_burst ceremonies at once and login_per_min after that.
    let public = Router::new()
        .route("/passkeys/login/start", post(passkeys::login_start))
        .route("/passkeys/login/finish", post(passkeys::login_finish))
        .layer(from_fn_with_state(pk.clone(), passkeys::require_https))
        .with_state(pk.clone())
        .layer(from_fn_with_state(login_limit.clone(), ip_rate_limit));
    let admin_api = Router::new()
        .route("/passkeys/register/start", post(passkeys::register_start))
        .route("/passkeys/register/finish", post(passkeys::register_finish))
        .route("/api/passkeys", get(passkeys::list_current))
        .route(
            "/api/passkeys/{id}",
            delete(passkeys::delete).patch(passkeys::rename),
        )
        .route("/api/kit/passkeys/{id}", patch(passkeys::rename))
        .layer(from_fn_with_state(pk.clone(), passkeys::require_https))
        .with_state(pk.clone())
        .layer(from_fn_with_state(auth.clone(), require_admin));
    let page_state = (dash.clone(), pk);
    let kit_page_route = Router::new().route(
        "/passkeys",
        get(
            |axum::extract::State((d, pk)): axum::extract::State<(Dashboard, PasskeyState)>,
             axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>,
             headers: axum::http::HeaderMap| async move {
                let https = d.is_https(peer, &headers);
                d.passkeys_page(https, pk.list_for_request(&headers).await)
            },
        ),
    );
    // feat-pages-1: the same data for a web app that draws the page.
    let json_route = Router::new().route(
        "/api/kit/passkeys",
        get(
            |axum::extract::State((d, pk)): axum::extract::State<(Dashboard, PasskeyState)>,
             axum::extract::ConnectInfo(peer): axum::extract::ConnectInfo<std::net::SocketAddr>,
             headers: axum::http::HeaderMap| async move {
                (
                    [(axum::http::header::CACHE_CONTROL, "no-cache")],
                    axum::Json(serde_json::json!({
                        "https": d.is_https(peer, &headers),
                        "public_url": d.public_url,
                        "passkeys": pk.list_for_request(&headers).await,
                    })),
                )
            },
        ),
    );
    let page = if kit_renders {
        kit_page_route.merge(json_route)
    } else {
        json_route
    }
    .with_state(page_state)
    .layer(from_fn_with_state(auth.clone(), require_admin));
    Ok(public.merge(admin_api).merge(page))
}
