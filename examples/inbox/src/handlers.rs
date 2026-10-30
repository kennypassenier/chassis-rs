//! The inbox's HTTP handlers: the token-protected intake, and the three
//! routes behind the admin login (the page, the flash count, the clear
//! button). Split from `main` so the wiring there reads as a list.

use axum::extract::State;
use axum::{Extension, Json};
use chassis::Caller;
use chassis::shell::metrics::Gauge;

use crate::state::{Inbox, Messages};

pub(crate) async fn receive(
    State(inbox): State<Inbox>,
    caller: Caller,
    Json(body): Json<serde_json::Value>,
) -> (axum::http::StatusCode, Json<serde_json::Value>) {
    let from = match &caller {
        Caller::Client { name, .. } => name.clone(),
        Caller::Admin => "admin".to_string(),
    };
    let id = {
        let mut all = inbox.messages.lock().expect("messages lock");
        all.push(serde_json::json!({ "from": from, "body": body }));
        all.len()
    };
    // A counter counts events and never goes down; a gauge says what the
    // situation is right now. `from` is a client name the admin chose, not
    // caller-supplied text, so it cannot grow the label set without bound.
    inbox.received.inc(&[("from", from.as_str())]);
    inbox.stored.set(&[], id as f64);
    inbox.notifier.emit(
        "message.received",
        env!("CARGO_PKG_VERSION"),
        format!("#{id} from {from}"),
    );
    (
        axum::http::StatusCode::ACCEPTED,
        Json(serde_json::json!({ "id": id, "from": from })),
    )
}

/// The example's own dashboard page (K16): the kit supplies the layout,
/// login and nav; inbox supplies the template and the data.
pub(crate) async fn messages_page(
    Extension(dash): Extension<chassis::Dashboard>,
    State(messages): State<Messages>,
) -> Result<axum::response::Html<String>, chassis::Error> {
    let all = messages.lock().expect("messages lock");
    let rows: Vec<serde_json::Value> = all
        .iter()
        .enumerate()
        .rev()
        .map(|(i, m)| {
            serde_json::json!({
                "n": i + 1,
                "from": m["from"].as_str().unwrap_or("?"),
                "body": m["body"].to_string(),
            })
        })
        .collect();
    dash.render_project(
        "/messages",
        include_str!("../templates/messages.html"),
        serde_json::json!({ "messages": rows, "count": all.len() }),
    )
}

/// The flash action's route (kit-kp11): the answer carries the count the
/// toast shows.
pub(crate) async fn count_messages(State(messages): State<Messages>) -> Json<serde_json::Value> {
    let count = messages.lock().expect("messages lock").len();
    Json(serde_json::json!({ "count": count }))
}

/// The section action's route (K29): behind the admin login like every
/// `dashboard_routes` handler; a 204 makes the button reload the page.
pub(crate) async fn clear_messages(
    State((messages, stored)): State<(Messages, Gauge)>,
) -> axum::http::StatusCode {
    messages.lock().expect("messages lock").clear();
    // The gauge follows the truth down as well as up; the counter does not,
    // because the messages were still received.
    stored.set(&[], 0.0);
    axum::http::StatusCode::NO_CONTENT
}
