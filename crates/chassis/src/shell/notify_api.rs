//! The notifications card's JSON API (3.15.0): `GET /api/kit/notify`,
//! `POST /api/kit/notify/settings` and `POST /api/kit/notify/test`. The card
//! on the Status page is drawn from it; a project's own web app can draw its
//! own. Admin login and the same-origin rule are layered by the caller.

use axum::Json;
use axum::extract::State;
use axum::http::header::CACHE_CONTROL;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::core::error::Error;
use crate::core::notify_target::Target;
use crate::shell::notify::redacted_url;
use crate::shell::notify_channel::{Channel, View, Which};
use crate::shell::notify_delivery::send_test;

/// What the API needs besides the channel.
#[derive(Clone)]
pub(crate) struct NotifyState {
    pub channel: Channel,
    pub service: &'static str,
    pub version: &'static str,
}

fn no_store(body: Value) -> Response {
    ([(CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
    tokio::task::spawn_blocking(f).await.unwrap_or_else(|e| {
        Err(Error::internal(
            format!("a notification task failed: {e}"),
            "report this to the project",
        ))
    })
}

/// One target as the card sees it. An address that arrived by flag,
/// environment or `${VAR}` may carry a webhook id, so only its host is shown.
fn target_json(which: Which, t: &Target, saved: bool, code: &Option<String>) -> Value {
    let masked = t.fixed.as_ref().is_some_and(|f| f.secret) && t.value.is_some();
    let address = t
        .value
        .as_ref()
        .map(|v| if masked { redacted_url(v) } else { v.clone() });
    json!({
        "which": which.as_str(),
        "address": address,
        "masked": masked,
        "layer": t.layer,
        "locked": t.locked(),
        "fixed": t.fixed.as_ref().map(|f| json!({"by": f.by, "name": f.name, "reason": f.reason()})),
        "saved": saved,
        "code_default": code.as_deref().filter(|c| !c.trim().is_empty()),
        "set": t.value.is_some(),
    })
}

fn epoch_rfc3339(secs: i64) -> String {
    chrono::DateTime::from_timestamp(secs, 0)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn view_json(v: View) -> Value {
    let both_locked = v.primary.locked() && v.fallback.locked();
    json!({
        "active": v.primary.value.is_some() || v.fallback.value.is_some(),
        "primary": target_json(Which::Primary, &v.primary, v.saved[0], &v.code[0]),
        "fallback": target_json(Which::Fallback, &v.fallback, v.saved[1], &v.code[1]),
        "can_edit": !both_locked,
        "outbox": {
            "waiting": v.counts.waiting,
            "oldest_at": v.counts.oldest_at.map(epoch_rfc3339),
            "cap": v.cap,
            "dropped_total": v.dropped_total,
        },
        "last_error": v.last_error,
        "last_delivery": v.last_delivery,
    })
}

/// `GET /api/kit/notify`.
pub(crate) async fn overview(State(st): State<NotifyState>) -> Result<Response, Error> {
    let body = blocking(move || st.channel.view().map(view_json)).await?;
    Ok(no_store(body))
}

#[derive(Deserialize)]
pub(crate) struct SettingsBody {
    primary: Option<String>,
    fallback: Option<String>,
    #[serde(default)]
    reset: bool,
}

/// `POST /api/kit/notify/settings`: `{primary?, fallback?}` or `{reset: true}`.
/// An empty text saves "no target". A value the configuration fixes is refused.
pub(crate) async fn set_settings(
    State(st): State<NotifyState>,
    Json(body): Json<SettingsBody>,
) -> Result<Response, Error> {
    let out = blocking(move || {
        let ch = &st.channel;
        let before = [ch.target(Which::Primary).layer, ch.target(Which::Fallback).layer];
        if body.reset {
            ch.reset()?;
        } else {
            ch.save(body.primary.as_deref(), body.fallback.as_deref())?;
        }
        let after = [ch.target(Which::Primary), ch.target(Which::Fallback)];
        tracing::info!(
            audit = true,
            action = if body.reset { "reset" } else { "set" },
            primary_before = ?before[0],
            fallback_before = ?before[1],
            primary_host = %after[0].value.as_deref().map_or_else(|| "none".to_string(), redacted_url),
            fallback_host = %after[1].value.as_deref().map_or_else(|| "none".to_string(), redacted_url),
            "notify: the targets were changed from the Status page"
        );
        ch.view().map(view_json)
    })
    .await?;
    Ok(no_store(out))
}

/// `POST /api/kit/notify/test`: one marked message to each target that is
/// set; answers what each said. Nothing is queued.
pub(crate) async fn test(State(st): State<NotifyState>) -> Result<Response, Error> {
    if !st.channel.active() {
        return Err(Error::invalid(
            "no address is set, so there is nowhere to send a test message",
            "enter a primary address (a kyu topic) and save it first",
        ));
    }
    let report = send_test(&st.channel, st.service, st.version).await;
    Ok(no_store(report))
}

pub(crate) fn routes(st: NotifyState) -> axum::Router {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/api/kit/notify", get(overview))
        .route("/api/kit/notify/settings", post(set_settings))
        .route("/api/kit/notify/test", post(test))
        .with_state(st)
}
