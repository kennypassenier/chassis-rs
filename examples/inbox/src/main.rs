//! inbox — the example service that proves the kit (K26).
//!
//! Clients post JSON messages with their token; the kit supplies login,
//! clients, tokens, the last-requests view, self-update and notifications.
//! Each received message is a project event (`message.received`), so a
//! configured webhook hears about it. The dashboard page that lists the
//! messages is assembled in L7.

#![forbid(unsafe_code)]

use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use chassis::shell::clients_api::ClientView;
use chassis::shell::dashboard::{
    Check, ClientColumn, ClientFormField, FlashAction, JsonRender, Kpi, Section, SectionAction,
    SectionBody, StatusSection,
};
use chassis::shell::metrics::{Counter, Gauge};
use chassis::shell::notify::Notifier;
use chassis::{App, AppSpec, Caller};

/// Messages received so far, newest last. In memory: the example proves
/// the kit, not a database.
type Messages = Arc<Mutex<Vec<serde_json::Value>>>;

#[derive(Clone)]
struct Inbox {
    messages: Messages,
    notifier: Notifier,
    /// The project's own series, registered with the kit's `/metrics` in
    /// `main`. A counter for what happened and a gauge for what is: the two
    /// shapes Prometheus expects, and the reason the kit ships both.
    received: Counter,
    stored: Gauge,
}

/// The status page shows how many messages arrived and the last five (K17).
struct MessagesSection(Messages);

impl StatusSection for MessagesSection {
    fn render(&self) -> Section {
        let all = self.0.lock().expect("messages lock");
        let mut rows: Vec<(String, String)> = vec![("Received".into(), all.len().to_string())];
        for (i, m) in all.iter().rev().take(5).enumerate() {
            rows.push((
                format!("#{}", all.len() - i),
                format!("{} → {}", m["from"].as_str().unwrap_or("?"), m["body"]),
            ));
        }
        Section {
            title: "Messages".into(),
            explain: "Everything clients posted to /v1/messages since the service started; the newest five are listed.".into(),
            rows,
            html: None,
        }
    }

    /// K29: one button under the section; its route is inbox's own,
    /// registered with `dashboard_routes` below.
    fn actions(&self) -> Vec<SectionAction> {
        vec![
            SectionAction::post("Clear messages", "/messages/clear")
                .destructive("Clear every message? They are kept nowhere else.")
                .busy_label("Clearing…"),
        ]
    }
}

/// The newest messages as a table that sorts and searches (kit-kp11): a
/// section's body can be data, and the kit draws it.
struct LatestSection(Messages);

impl StatusSection for LatestSection {
    fn render(&self) -> Section {
        Section {
            title: "Latest messages".into(),
            explain:
                "The newest twenty messages clients posted. A table, so it sorts and searches."
                    .into(),
            rows: Vec::new(),
            html: None,
        }
    }

    fn body(&self) -> Option<SectionBody> {
        let all = self.0.lock().expect("messages lock");
        let rows: Vec<Vec<String>> = all
            .iter()
            .enumerate()
            .rev()
            .take(20)
            .map(|(i, m)| {
                vec![
                    (i + 1).to_string(),
                    m["from"].as_str().unwrap_or("?").to_string(),
                    m["body"].to_string(),
                ]
            })
            .collect();
        Some(SectionBody::table(["#", "From", "Body"], rows))
    }
}

/// Key figures, a check and a button that keeps the page (kit-kp11).
struct IntakeSection(Messages);

impl StatusSection for IntakeSection {
    fn render(&self) -> Section {
        Section {
            title: "Intake".into(),
            explain: "How many messages arrived and whether the store holds them. Key figures and a check row, written as data.".into(),
            rows: Vec::new(),
            html: None,
        }
    }

    fn body(&self) -> Option<SectionBody> {
        let all = self.0.lock().expect("messages lock");
        let senders: std::collections::BTreeSet<&str> =
            all.iter().filter_map(|m| m["from"].as_str()).collect();
        // Two cards of the page's twelve columns: this one is the wide one.
        Some(SectionBody::Many(vec![
            SectionBody::Kpis(vec![
                Kpi::new("Received", all.len()).note("since the service started"),
                Kpi::new("Senders", senders.len()).note("clients that posted at least once"),
            ]),
            SectionBody::Checks(vec![Check::ok(
                "Message store",
                &format!("holding {} in memory", all.len()),
            )]),
        ]))
    }

    /// Counted again, without leaving the page: a spinner, a word and a toast
    /// with the number.
    fn flash_actions(&self) -> Vec<FlashAction> {
        vec![
            FlashAction::post("Count messages", "/messages/count")
                .word("Counted")
                .toast("Counted {n} messages")
                .toast_one("Counted 1 message"),
        ]
    }
}

/// A card that reads its own JSON (kit-kp11): the kit's `/healthz`, shown
/// as rows, with loading, empty and failed handled by the card.
struct StoreSection;

impl StatusSection for StoreSection {
    fn render(&self) -> Section {
        Section {
            title: "Store, read live".into(),
            explain: "A card that reads its own address and shows its state while it waits: /healthz, as the service answers it.".into(),
            rows: Vec::new(),
            html: None,
        }
    }

    fn body(&self) -> Option<SectionBody> {
        Some(SectionBody::json("/healthz", JsonRender::Rows))
    }
}

/// Each client's row on the Clients page gains a "messages" column (K16).
struct MessagesColumn(Messages);

impl ClientColumn for MessagesColumn {
    fn title(&self) -> String {
        "Messages".into()
    }
    fn cell(&self, client: &ClientView) -> String {
        let n = self
            .0
            .lock()
            .expect("messages lock")
            .iter()
            .filter(|m| m["from"].as_str() == Some(client.name.as_str()))
            .count();
        n.to_string()
    }
}

async fn receive(
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
async fn messages_page(
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
async fn count_messages(State(messages): State<Messages>) -> Json<serde_json::Value> {
    let count = messages.lock().expect("messages lock").len();
    Json(serde_json::json!({ "count": count }))
}

/// The section action's route (K29): behind the admin login like every
/// `dashboard_routes` handler; a 204 makes the button reload the page.
async fn clear_messages(
    State((messages, stored)): State<(Messages, Gauge)>,
) -> axum::http::StatusCode {
    messages.lock().expect("messages lock").clear();
    // The gauge follows the truth down as well as up; the counter does not,
    // because the messages were still received.
    stored.set(&[], 0.0);
    axum::http::StatusCode::NO_CONTENT
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let spec = AppSpec {
        name: "inbox",
        version: env!("CARGO_PKG_VERSION"),
        // Releases of the example live with the kit; set update_url to
        // point somewhere else (a drill server, for instance).
        repository: Some("kennypassenier/chassis-rs"),
        ..Default::default()
    };
    // feat-metrics-1: the project's own series carry the kit's prefix, so
    // `inbox_messages_received_total` sits beside the kit's own
    // `inbox_http_requests_total` in one scrape. Read before the spec moves.
    let prefix = spec.metric_prefix();
    // No public routes: `/` is the kit's status page, `/v1/messages` needs a token.
    let mut app = match App::from_env_and_args(spec, Router::new()) {
        Ok(app) => app,
        Err(e) => {
            eprintln!("{e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    let messages: Messages = Arc::new(Mutex::new(Vec::new()));
    let received = Counter::new(
        &prefix,
        "messages_received_total",
        "Messages accepted on /v1/messages since start",
    );
    let stored = Gauge::new(
        &prefix,
        "messages_stored",
        "Messages held in memory right now",
    );
    app.metrics_source(received.clone());
    app.metrics_source(stored.clone());
    let inbox = Inbox {
        messages: messages.clone(),
        notifier: app.notifier(),
        received: received.clone(),
        stored: stored.clone(),
    };
    app.api_routes(
        Router::new()
            .route("/v1/messages", post(receive))
            .with_state(inbox),
    );
    app.test_route(
        "POST",
        "/v1/messages",
        "application/json",
        r#"{"hello":"from the dashboard"}"#,
    );
    app.status_section(MessagesSection(messages.clone()));
    app.status_section(LatestSection(messages.clone()));
    app.status_section(IntakeSection(messages.clone()));
    app.status_section(StoreSection);
    app.client_column(MessagesColumn(messages.clone()));
    // feat-clients-2: what a client of THIS service needs besides a name.
    // The kit stores it with the client, renders it as a column under this
    // label, and returns it from the clients API — the project writes no
    // storage of its own for it.
    app.client_form_field(ClientFormField::text("topic", "Topic", "alerts"));
    // The same hook may refuse: an empty topic would make the column
    // useless, and a refusal reaches the page as the kit's error with its
    // remedy rather than as a silent blank.
    app.on_client_issued(|client, fields| {
        let topic = fields.get("topic").map(String::as_str).unwrap_or("").trim();
        if topic.is_empty() {
            return Err(chassis::Error::invalid(
                format!("{} needs a topic", client.name),
                "fill in the topic field — it is what this client's messages are about",
            ));
        }
        Ok(())
    });
    // K16: an own page behind the admin login, inside the kit's layout.
    app.nav_entry("Messages", "/messages");
    app.dashboard_routes(
        Router::new()
            .route("/messages", get(messages_page))
            .with_state(messages.clone())
            .route("/messages/clear", post(clear_messages))
            .with_state((messages.clone(), stored.clone()))
            .route("/messages/count", post(count_messages))
            .with_state(messages.clone()),
    );
    // K21: before a binary swap, the kit asks for a consistent copy of the state.
    app.state_copy(move |dest| {
        let snapshot = serde_json::to_vec_pretty(&*messages.lock().expect("messages lock"))
            .map_err(|e| {
                chassis::Error::internal(format!("serialise messages: {e}"), "report this")
            })?;
        std::fs::write(dest.join("messages.json"), snapshot).map_err(|e| {
            chassis::Error::config(
                format!("cannot write the pre-update copy: {e}"),
                "check the copies directory's permissions",
            )
        })
    });
    app.run().await
}
