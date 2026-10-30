//! The inbox's dashboard additions: four status sections and the clients
//! column. Each one only reads the message list, so they sit apart from the
//! handlers that write it.

use chassis::shell::clients_api::ClientView;
use chassis::shell::dashboard::{
    Check, ClientColumn, FlashAction, JsonRender, Kpi, Section, SectionAction, SectionBody,
    StatusSection,
};

use crate::state::Messages;

/// The status page shows how many messages arrived and the last five (K17).
pub(crate) struct MessagesSection(pub(crate) Messages);

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
pub(crate) struct LatestSection(pub(crate) Messages);

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
pub(crate) struct IntakeSection(pub(crate) Messages);

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
pub(crate) struct StoreSection;

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
pub(crate) struct MessagesColumn(pub(crate) Messages);

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
