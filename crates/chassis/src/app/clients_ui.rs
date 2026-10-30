//! How the Clients page looks and reacts for this service: its store, columns,
//! form fields, vocabulary, actions and issue/delete hooks.

use std::sync::Arc;

use super::App;
use crate::core::error::Error;
use crate::shell::store::ClientStore;

impl App {
    /// Replace the kit's encrypted-file client store (kyu keeps its
    /// SQLite table this way, AR5).
    pub fn client_store(&mut self, store: Arc<dyn ClientStore>) -> &mut Self {
        self.client_store = Some(store);
        self
    }

    /// An extra column on the clients table (K16).
    pub fn client_column(
        &mut self,
        c: impl crate::shell::dashboard::ClientColumn + 'static,
    ) -> &mut Self {
        self.dash.columns.push(Arc::new(c));
        self
    }

    /// An extra field on the issue form of the clients page (K16, 1.7.0):
    /// what a client of this service needs besides a name. The values
    /// reach `on_client_issued`.
    pub fn client_form_field(
        &mut self,
        field: crate::shell::dashboard::ClientFormField,
    ) -> &mut Self {
        self.dash.form_fields.push(field);
        self
    }

    /// Runs before a client token is issued (K16, 1.7.0) with the
    /// client-to-be and the extra form fields; an `Err` refuses the
    /// issue and reaches the page as the kit's error with remedy.
    pub fn on_client_issued(
        &mut self,
        f: impl Fn(
            &crate::shell::clients_api::ClientView,
            &std::collections::BTreeMap<String, String>,
        ) -> Result<(), Error>
        + Send
        + Sync
        + 'static,
    ) -> &mut Self {
        self.dash.on_client_issued = Some(Arc::new(f));
        self
    }

    /// Runs before a client is deleted (K16, 1.7.0): the project removes
    /// what it created alongside, or returns an `Error` and nothing is
    /// deleted — the page shows the error with its remedy.
    pub fn on_client_deleted(
        &mut self,
        f: impl Fn(&crate::shell::clients_api::ClientView) -> Result<(), Error> + Send + Sync + 'static,
    ) -> &mut Self {
        self.dash.on_client_deleted = Some(Arc::new(f));
        self
    }

    /// The problems card's source (K17): configuration seen but not usable.
    pub fn problems(
        &mut self,
        f: impl Fn() -> Vec<crate::shell::dashboard::Problem> + Send + Sync + 'static,
    ) -> &mut Self {
        self.dash.problems = Some(Arc::new(f));
        self
    }

    /// What the clients page is called in this service ("Sources" for
    /// Almanac); code and URL stay `clients` (E1). Without it the heading
    /// and nav label are the vocabulary's capitalised plural.
    pub fn clients_label(&mut self, label: &str) -> &mut Self {
        self.dash.clients_label = Some(label.to_string());
        self
    }

    /// What this service calls a client (K28), lower case: Almanac says
    /// `vocabulary("source", "sources")`. Every kit sentence and every
    /// clients-API message then uses that word; URLs, JSON keys, cookies,
    /// metrics and log fields keep saying `client`.
    pub fn vocabulary(&mut self, singular: &str, plural: &str) -> &mut Self {
        self.dash.vocabulary = Some(crate::shell::dashboard::Vocabulary::new(singular, plural));
        self
    }

    /// The article before the singular word, when the vowel-sound rule gets
    /// it wrong (kit-r4). By default the kit writes "an app", "a source",
    /// "an inbox" from the word's sound; a word the rule cannot know (an
    /// acronym such as `sms`, said "an es-em-ess") is set here:
    /// `vocabulary_article("an")`.
    pub fn vocabulary_article(&mut self, article: &str) -> &mut Self {
        self.dash.vocabulary_article = Some(article.trim().to_string());
        self
    }

    /// A button on every active client row (K29): `{id}` in the route is
    /// the client's id; the route is the project's own, registered with
    /// `dashboard_routes`. Several may be registered; they render in this
    /// order.
    pub fn client_action(&mut self, action: crate::shell::dashboard::ClientAction) -> &mut Self {
        self.dash.client_actions.push(action);
        self
    }
}
