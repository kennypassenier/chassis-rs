//! The server-rendered dashboard (K15, K16, K17): login page, status page,
//! clients page, and the extension points a project plugs into.
//!
//! Templates are minijinja, embedded with `include_str!`, all extending
//! `layout.html`. A project registers nav entries, status sections,
//! extra client columns and its own admin pages through `App`; the kit
//! renders them into the shared layout so every service looks and
//! behaves the same (C3). Every kit section opens with an explain block
//! (`class="explain"`), and a lint test refuses a template without one.
//!
//! The theme list is parsed from the vendored `theme-registry.js` at
//! first use rather than typed here: two consumers were measured with a
//! hand-kept copy of the theme list on 2026-09-04 and both had it wrong.

use std::sync::Arc;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum_extra::extract::cookie::CookieJar;
use minijinja::{Environment, context};
use serde::Serialize;

use crate::core::error::Error;
use crate::shell::assets::{KP_THEMES_VERSION, asset_version};
use crate::shell::auth::{AuthState, LoginForm, LoginOutcome, login};
use crate::shell::client_list;
use crate::shell::clients_api::ClientView;
use crate::shell::health::Health;
use crate::shell::store::Clients;

mod builders;
mod clients;
mod environment;
mod errors;
mod login;
mod render;
mod sections;
mod status;
#[cfg(test)]
mod tests;
mod theme_registry;
mod views;
use errors::{capitalised, error_look, sentence, template_error};
pub use sections::{Check, CheckState, FlashAction, JsonRender, Kpi, KpiTone, SectionBody};
use sections::{Sample, UptimeHistory};
use views::attr_escape;

/// One link in the top navigation.
#[derive(Debug, Clone, Serialize)]
pub struct NavEntry {
    pub label: String,
    pub href: String,
}

/// A block on the status page contributed by the project (K17).
#[derive(Debug, Clone, Serialize, Default)]
pub struct Section {
    pub title: String,
    /// One or two plain sentences: what this section shows and why it matters.
    pub explain: String,
    /// Label/value rows; rendered escaped.
    pub rows: Vec<(String, String)>,
    /// Optional pre-rendered HTML the project vouches for (rendered raw).
    pub html: Option<String>,
}

/// The module scripts and stylesheets a status section needs (kit-kp11).
///
/// Declared instead of writing `<script type=module>` / `<link>` into
/// [`Section::html`]: the kit renders them once in the status page's
/// `<head>`, in the order sections were registered, even when several
/// sections name the same file. Every path must be same-origin and absolute
/// (`/static/…`, `/app/orders.js`), because the kit's CSP is
/// `script-src 'self'`; the project serves the file itself (a route from
/// `dashboard_routes`, or a [`crate::shell::webapp`] mount). A path that is
/// not a plain same-origin path is dropped and logged, never rendered.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[non_exhaustive]
pub struct SectionAssets {
    pub module_scripts: Vec<String>,
    pub stylesheets: Vec<String>,
}

impl SectionAssets {
    pub fn new() -> Self {
        Self::default()
    }

    /// A JavaScript module to load with `<script type="module">`.
    pub fn module_script(mut self, path: &str) -> Self {
        self.module_scripts.push(path.to_string());
        self
    }

    /// A stylesheet to load with `<link rel="stylesheet">`.
    pub fn stylesheet(mut self, path: &str) -> Self {
        self.stylesheets.push(path.to_string());
        self
    }

    pub fn is_empty(&self) -> bool {
        self.module_scripts.is_empty() && self.stylesheets.is_empty()
    }
}

/// Is `path` a plain same-origin absolute path the CSP allows (`/…`, not
/// `//host`, no scheme, no characters that could leave an attribute)?
pub fn is_same_origin_asset_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.starts_with("//")
        && !path.contains("..")
        && path
            .chars()
            .all(|c| c.is_ascii_graphic() && !matches!(c, '"' | '\'' | '<' | '>' | '\\' | '`'))
}

/// Merge what every section declared: valid paths only, each file once,
/// first-registered order.
pub(crate) fn merge_section_assets(all: &[SectionAssets]) -> SectionAssets {
    fn push_unique(out: &mut Vec<String>, kind: &str, path: &str) {
        if !is_same_origin_asset_path(path) {
            tracing::warn!(
                path,
                kind,
                "status section asset dropped: not a same-origin absolute path"
            );
        } else if !out.iter().any(|p| p == path) {
            out.push(path.to_string());
        }
    }
    let mut merged = SectionAssets::default();
    for a in all {
        for p in &a.module_scripts {
            push_unique(&mut merged.module_scripts, "module script", p);
        }
        for p in &a.stylesheets {
            push_unique(&mut merged.stylesheets, "stylesheet", p);
        }
    }
    merged
}

/// What a project implements to put a section on the status page.
pub trait StatusSection: Send + Sync {
    fn render(&self) -> Section;

    /// Module scripts and stylesheets this section needs (kit-kp11); see
    /// [`SectionAssets`]. A default so every existing section compiles.
    fn assets(&self) -> SectionAssets {
        SectionAssets::default()
    }

    /// Buttons under the section's rows (K29): each one POSTs to a route
    /// the project registered with `dashboard_routes`. A default so every
    /// existing section keeps compiling; Almanac's "Reload profiles from
    /// disk" form becomes one `SectionAction`.
    fn actions(&self) -> Vec<SectionAction> {
        Vec::new()
    }

    /// The section's body as data (kit-kp11): a table, key figures, check
    /// rows or a card that reads its own JSON. When this returns `Some`, it
    /// replaces [`Section::rows`]; [`Section::html`] is still rendered
    /// after it, as the escape hatch. A default so every existing section
    /// compiles and looks as before.
    fn body(&self) -> Option<SectionBody> {
        None
    }

    /// Buttons under the section that do their work without leaving the
    /// page (kit-kp11): a spinner, a short word and a toast that can carry
    /// a count. See [`FlashAction`]; [`StatusSection::actions`] keeps its
    /// reload.
    fn flash_actions(&self) -> Vec<FlashAction> {
        Vec::new()
    }
}

/// What this service calls a client (K28): Almanac says `source` /
/// `sources`. Presentation only — routes, JSON keys, cookies, metrics and
/// log fields keep saying `client`. The capitalised forms exist for
/// sentence starts and headings.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Vocabulary {
    pub singular: String,
    pub plural: String,
    pub singular_cap: String,
    pub plural_cap: String,
}

impl Vocabulary {
    pub fn new(singular: &str, plural: &str) -> Self {
        Self {
            singular: singular.to_string(),
            plural: plural.to_string(),
            singular_cap: capitalise(singular),
            plural_cap: capitalise(plural),
        }
    }
}

impl Vocabulary {
    /// The shell variable the copy-paste command names its token with
    /// (`SOURCE_TOKEN` for "source"): the singular word, upper-cased, every
    /// run of characters outside A-Z and 0-9 collapsed to one `_`, and
    /// prefixed `KIT_` when it would not start with a letter.
    pub fn token_var(&self) -> String {
        let mut name = String::new();
        for c in self.singular.chars() {
            if c.is_ascii_alphanumeric() {
                name.push(c.to_ascii_uppercase());
            } else if !name.ends_with('_') && !name.is_empty() {
                name.push('_');
            }
        }
        let name = name.trim_matches('_');
        let name = if name.is_empty() { "CLIENT" } else { name };
        let prefix = if name.starts_with(|c: char| c.is_ascii_uppercase()) {
            ""
        } else {
            "KIT_"
        };
        format!("{prefix}{name}_TOKEN")
    }
}

impl Default for Vocabulary {
    fn default() -> Self {
        Self::new("client", "clients")
    }
}

/// The indefinite article that reads right before `word`: `an` before a
/// vowel sound, `a` otherwise (kit-r4, kyu gap 53: "What a app is").
///
/// It goes by sound, not by letter, for the cases a service is likely to
/// name a client with: `user`, `unit`, `one` take `a`; `hour`, `honest`
/// take `an`. A word the rule still gets wrong is fixed per service with
/// `App::vocabulary_article`.
pub fn article_for(word: &str) -> &'static str {
    let w = word.trim().to_lowercase();
    let starts = |prefixes: &[&str]| prefixes.iter().any(|p| w.starts_with(p));
    // A vowel letter with a consonant sound: "uni…", "use…", "eu…", "one".
    if starts(&[
        "uni", "use", "usu", "uti", "ubi", "eu", "one", "once", "ura", "uri",
    ]) {
        return "a";
    }
    // A consonant letter with a vowel sound: a silent h.
    if starts(&["hour", "honest", "honor", "honour", "heir"]) {
        return "an";
    }
    match w.chars().next() {
        Some('a' | 'e' | 'i' | 'o' | 'u') => "an",
        _ => "a",
    }
}

fn capitalise(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// A button the project puts on the dashboard (K29): on a client row
/// (`ClientAction`, `{id}` in the route becomes the client's id) or under
/// a status section (`SectionAction`). The kit renders it through the
/// same `[data-post]` mechanism as its own Re-issue/Revoke/Delete buttons
/// (rule 31: busy while in flight; destructive ones arm on the first
/// click and act on the second). A 2xx reloads the page; a refusal's
/// `error` and `remedy` are shown on the button.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Action {
    pub label: String,
    /// The project's own route, registered with `dashboard_routes`. May
    /// contain `{id}` on a client row.
    pub route: String,
    /// `POST` (default) or `DELETE`.
    pub method: String,
    pub destructive: bool,
    /// The arm-before-act phrase; a destructive action without one gets
    /// `DEFAULT_CONFIRM` at render time, because kp-themes refuses a
    /// destructive control that offers neither confirm nor undo.
    pub confirm: Option<String>,
    /// What the button says while the request is in flight (rule 31).
    pub busy_label: Option<String>,
}

pub type ClientAction = Action;
pub type SectionAction = Action;

/// The confirm phrase a destructive action gets when it names none.
pub const DEFAULT_CONFIRM: &str = "Are you sure? This cannot be undone.";

impl Action {
    /// A plain POST button.
    pub fn post(label: &str, route: &str) -> Self {
        Self {
            label: label.to_string(),
            route: route.to_string(),
            method: "POST".to_string(),
            destructive: false,
            confirm: None,
            busy_label: None,
        }
    }

    /// Mark the action destructive with the phrase the armed button shows.
    pub fn destructive(mut self, confirm: &str) -> Self {
        self.destructive = true;
        self.confirm = Some(confirm.to_string());
        self
    }

    /// `DELETE` instead of `POST`.
    pub fn method(mut self, method: &str) -> Self {
        self.method = method.to_string();
        self
    }

    pub fn busy_label(mut self, label: &str) -> Self {
        self.busy_label = Some(label.to_string());
        self
    }
}

/// An extra column on the clients table (K16). `cell` returns HTML the
/// project vouches for; the kit escapes nothing here, so escape yourself.
pub trait ClientColumn: Send + Sync {
    fn title(&self) -> String;
    fn cell(&self, client: &ClientView) -> String;
}

/// An extra field on the clients page's issue form (K16, 1.7.0): the
/// project asks for what a client of *this* service needs besides a name
/// — Almanac: the calendar a source writes to. The values reach the
/// project's `on_client_issued` hook, which may refuse; the kit stores
/// only the name.
#[derive(Clone)]
pub struct ClientFormField {
    /// The form/JSON key (`[a-z_]+`).
    pub name: String,
    pub label: String,
    pub kind: FieldKind,
}

#[derive(Clone)]
pub enum FieldKind {
    Text {
        placeholder: String,
    },
    /// Options are asked for at render time, so a list that changes at
    /// runtime (calendars) is always current.
    Select {
        options: Arc<dyn Fn() -> Vec<(String, String)> + Send + Sync>,
    },
}

impl ClientFormField {
    pub fn text(name: &str, label: &str, placeholder: &str) -> Self {
        Self {
            name: name.into(),
            label: label.into(),
            kind: FieldKind::Text {
                placeholder: placeholder.into(),
            },
        }
    }

    pub fn select(
        name: &str,
        label: &str,
        options: impl Fn() -> Vec<(String, String)> + Send + Sync + 'static,
    ) -> Self {
        Self {
            name: name.into(),
            label: label.into(),
            kind: FieldKind::Select {
                options: Arc::new(options),
            },
        }
    }
}

/// A problem the project wants shown on the status page (K17): some
/// configuration it could see but not use.
#[derive(Debug, Clone, Serialize)]
pub struct Problem {
    pub what: String,
    pub why: String,
    pub remedy: String,
}

/// The update card's content; the self-update module fills it in (L5).
#[derive(Debug, Clone, Serialize)]
pub struct UpdateView {
    pub mode: String,
    pub latest: String,
    pub last_check: String,
    pub note: Option<String>,
}

impl Default for UpdateView {
    fn default() -> Self {
        Self {
            mode: "not compiled in".to_string(),
            latest: "unknown".to_string(),
            last_check: "never".to_string(),
            note: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Theme {
    pub name: String,
    pub label: String,
    pub dark: bool,
}

/// Parse `THEMES` out of the vendored registry module.
pub fn themes() -> &'static [Theme] {
    static THEMES: std::sync::OnceLock<Vec<Theme>> = std::sync::OnceLock::new();
    THEMES
        .get_or_init(|| theme_registry::parse(include_str!("../../static/kp/js/theme-registry.js")))
}

/// Everything the page handlers share.
#[derive(Clone)]
pub struct Dashboard {
    pub app_name: &'static str,
    pub version: &'static str,
    pub prefix: String,
    pub listen: String,
    pub started_at: String,
    pub clients_label: String,
    pub reveal_seconds: u64,
    pub capture_body_bytes: usize,
    pub capture_ttl_minutes: u64,
    pub remember_me_days: u64,
    pub has_test_route: bool,
    /// The `passkeys` feature is compiled in and configured (K9).
    pub passkeys_enabled: bool,
    pub public_url: String,
    pub nav: Vec<NavEntry>,
    pub sections: Arc<Vec<Arc<dyn StatusSection>>>,
    pub columns: Arc<Vec<Arc<dyn ClientColumn>>>,
    pub form_fields: Arc<Vec<ClientFormField>>,
    /// K29: the project's buttons on every active client row, in
    /// registration order.
    pub client_actions: Arc<Vec<ClientAction>>,
    /// K28: what this service calls a client.
    pub vocab: Vocabulary,
    pub problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync>,
    pub update: Arc<dyn Fn() -> UpdateView + Send + Sync>,
    pub health: Health,
    pub clients: Clients,
    pub auth: AuthState,
    /// The service opted in and runs without secrets: no door, a banner.
    pub open: bool,
    /// kit-kp11: the curl line with `$CLIENT_TOKEN` (or the vocabulary's own name) where the token goes,
    /// for `/api/kit/clients`. Private so the public surface stays as it was.
    command_template: Arc<str>,
    /// kit-kp11 (clients-manage): the test route's body, which the Test it
    /// field starts with, and whether it is JSON (the field's Format and
    /// Minify tools only make sense then).
    test_body: Arc<str>,
    test_json: bool,
    env: Arc<Environment<'static>>,
    /// The last 48 hours of health, one sample per check (kit-kp11); in
    /// memory only.
    uptime: UptimeHistory,
    /// Where the Clients page lives, when the kit serves one.
    clients_href: Option<String>,
    /// One read-only look at the release host, when a checker exists.
    check_update: Option<UpdateCheck>,
    /// `https://github.com/<repository>`, for the release notes link of a
    /// version chip.
    repository_url: Option<String>,
    /// 3.15.0: the Status page carries the Notifications card.
    notify_card: bool,
}

/// The "Check for updates" button's work.
pub(crate) type UpdateCheck = Arc<
    dyn Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), Error>> + Send>>
        + Send
        + Sync,
>;

impl Dashboard {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        app_name: &'static str,
        version: &'static str,
        prefix: String,
        listen: String,
        clients_label: Option<String>,
        reveal_seconds: u64,
        capture_body_bytes: usize,
        capture_ttl_minutes: u64,
        remember_me_days: u64,
        has_test_route: bool,
        passkeys_enabled: bool,
        public_url: String,
        mut nav: Vec<NavEntry>,
        sections: Vec<Arc<dyn StatusSection>>,
        columns: Vec<Arc<dyn ClientColumn>>,
        form_fields: Vec<ClientFormField>,
        problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync>,
        update: Arc<dyn Fn() -> UpdateView + Send + Sync>,
        health: Health,
        clients: Clients,
        auth: AuthState,
        open: bool,
    ) -> Result<Self, Error> {
        let clients_label = clients_label.unwrap_or_else(|| "Clients".to_string());
        let mut kit_nav = vec![
            NavEntry {
                label: "Status".into(),
                href: "/".into(),
            },
            NavEntry {
                label: clients_label.clone(),
                href: "/clients".into(),
            },
        ];
        if passkeys_enabled {
            kit_nav.push(NavEntry {
                label: "Passkeys".into(),
                href: "/passkeys".into(),
            });
        }
        kit_nav.append(&mut nav);
        let vocab = Vocabulary::default();
        let env = environment::build(app_name, open, &prefix, &kit_nav, &clients_label, &vocab)?;
        Ok(Self {
            app_name,
            version,
            prefix,
            listen,
            started_at: crate::shell::time::now_rfc3339(),
            clients_label,
            reveal_seconds,
            capture_body_bytes,
            capture_ttl_minutes,
            remember_me_days,
            has_test_route,
            passkeys_enabled,
            public_url,
            nav: kit_nav,
            sections: Arc::new(sections),
            columns: Arc::new(columns),
            form_fields: Arc::new(form_fields),
            client_actions: Arc::new(Vec::new()),
            vocab,
            problems,
            update,
            health,
            clients,
            auth,
            open,
            command_template: Arc::from(""),
            test_body: Arc::from(""),
            test_json: false,
            env: Arc::new(env),
            uptime: UptimeHistory::default(),
            clients_href: Some("/clients".to_string()),
            check_update: None,
            repository_url: None,
            notify_card: false,
        })
    }

    /// K28: what this service calls a client, for every template
    /// (`vocab.singular`, `vocab.plural`, `vocab.singular_cap`,
    /// `vocab.plural_cap`) and for the clients API's messages. Set once at
    /// mount, before any handler holds a clone.
    pub fn with_vocabulary(mut self, vocab: Vocabulary) -> Self {
        let env = Arc::make_mut(&mut self.env);
        env.add_global("vocab", minijinja::Value::from_serialize(&vocab));
        env.add_global("token_var", vocab.token_var());
        let article = article_for(&vocab.singular).to_string();
        self.vocab = vocab;
        self.with_vocabulary_article(&article)
    }

    /// K29: the project's buttons on every active client row.
    pub fn with_client_actions(mut self, actions: Vec<ClientAction>) -> Self {
        self.client_actions = Arc::new(actions);
        self
    }

    /// Render a project's own page inside the kit's layout (K16): the
    /// template `{% extends "layout.html" %}` and fills `content`; the
    /// project passes any serialisable context (a `serde_json::json!`
    /// object is fine). `active_nav` is the href of its nav entry, so the
    /// menu highlights it. Handlers get the `Dashboard` as an axum
    /// `Extension` on every route registered with `dashboard_routes`.
    pub fn render_project<C: serde::Serialize>(
        &self,
        active_nav: &str,
        source: &str,
        ctx: C,
    ) -> Result<Html<String>, Error> {
        let mut env = (*self.env).clone();
        env.add_template("__project.html", source)
            .map_err(template_error)?;
        let tmpl = env.get_template("__project.html").map_err(template_error)?;
        let own = minijinja::Value::from_serialize(&ctx);
        let full = context! {
            logged_in => true,
            idle_clients => self.idle_clients(),
            active_nav => active_nav,
            ..own
        };
        Ok(Html(tmpl.render(full).map_err(template_error)?))
    }

    /// CF-7: a refusal shown to a browser as a page in the layout — the
    /// kit's error and remedy, with the navigation around it and a way
    /// back — instead of a JSON document on its own tab.
    ///
    /// kit-kp11: the page also says why in plain words, draws the kind of
    /// error, carries the request id to quote in a report, and draws the
    /// navigation when the browser is signed in. The id and the session
    /// come from [`crate::shell::http::error_context`], set for this call.
    pub fn render_error(&self, status: StatusCode, message: &str, remedy: &str) -> Option<String> {
        let ctx = crate::shell::http::error_context();
        let signed_in =
            ctx.trusted || crate::shell::auth::still_valid_now(&self.auth, &ctx.headers);
        let (art, why) = error_look(status);
        self.render(
            "error.html",
            context! {
                logged_in => signed_in,
                idle_clients => if signed_in { self.idle_clients() } else { 0 },
                active_nav => "",
                status => status.as_u16(),
                reason => status.canonical_reason().unwrap_or(""),
                message => capitalised(message),
                remedy => sentence(remedy),
                why => why,
                art => art,
                request_id => ctx.request_id,
                when => crate::shell::time::now_rfc3339(),
            },
        )
        .ok()
        .map(|h| h.0)
    }

    /// Whether this request came through the TLS proxy (AR6).
    pub fn is_https(&self, peer: std::net::SocketAddr, headers: &HeaderMap) -> bool {
        crate::shell::guards::is_https(peer, headers, &self.auth.guards.trusted_proxies)
    }

    /// The passkeys page (K9); `passkeys` is what the store holds.
    pub fn passkeys_page(
        &self,
        https: bool,
        passkeys: Vec<impl Serialize>,
    ) -> Result<Html<String>, Error> {
        self.render(
            "passkeys.html",
            context! {
                logged_in => true,
                idle_clients => self.idle_clients(),
                active_nav => "/passkeys",
                https => https,
                public_url => self.public_url,
                passkeys => passkeys,
            },
        )
    }
}

/// `GET /login`.
pub async fn login_get(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
) -> Response {
    login::get(&d, peer, &headers)
}

/// `POST /login`: wrong token re-renders the page with the message and
/// HTTP 200 (K8); a good one sets the cookie and goes to the status page.
pub async fn login_post(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    axum::Form(form): axum::Form<LoginForm>,
) -> Response {
    login::post(&d, peer, &headers, &form).await
}

/// `GET /` — the status page (K17).
pub async fn status_page(State(d): State<Dashboard>) -> Result<Html<String>, Error> {
    status::page(&d).await
}

/// feat-pages-1: `GET /api/kit/status`, what the status page shows, for a
/// web app that draws the page itself.
pub async fn status_json(State(d): State<Dashboard>) -> Response {
    status::json(&d).await
}

/// kit-kp11: `POST /api/kit/status/update-check`, one read-only look at the
/// release host for the status page's "Check for updates" button. Answers
/// what the card would now say.
pub async fn update_check(State(d): State<Dashboard>) -> Response {
    status::update_check(&d).await
}

/// `GET /clients` — the clients page (K12, K13, K14).
pub async fn clients_page(State(d): State<Dashboard>) -> Result<Html<String>, Error> {
    clients::page(&d)
}

/// `GET /storage`: the Storage page (3.11.0). The server draws the frame
/// and its loading states; the script fills it from `/api/kit/storage`.
pub async fn storage_page(State(d): State<Dashboard>) -> Result<Html<String>, Error> {
    d.render(
        "storage.html",
        context! {
            logged_in => true,
            idle_clients => d.idle_clients(),
            active_nav => "/storage",
        },
    )
}

/// feat-pages-1: `GET /api/kit/clients`, what the clients page shows.
pub async fn clients_json(State(d): State<Dashboard>) -> Response {
    clients::json(&d)
}
