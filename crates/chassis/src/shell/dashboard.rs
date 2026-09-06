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
use crate::shell::clients_api::ClientView;
use crate::shell::health::Health;
use crate::shell::store::Clients;

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

/// What a project implements to put a section on the status page.
pub trait StatusSection: Send + Sync {
    fn render(&self) -> Section;
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

    fn view(&self) -> serde_json::Value {
        match &self.kind {
            FieldKind::Text { placeholder } => serde_json::json!({
                "name": self.name, "label": self.label, "kind": "text", "placeholder": placeholder
            }),
            FieldKind::Select { options } => serde_json::json!({
                "name": self.name, "label": self.label, "kind": "select",
                "options": options().into_iter().map(|(v, l)| serde_json::json!({"value": v, "label": l})).collect::<Vec<_>>()
            }),
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
    THEMES.get_or_init(|| {
        let src = include_str!("../../static/kp/theme-registry.js");
        let mut out = Vec::new();
        for line in src.lines() {
            let l = line.trim();
            if !l.starts_with("{ name:") {
                continue;
            }
            let field = |key: &str| -> Option<String> {
                let start = l.find(&format!("{key}: "))? + key.len() + 2;
                let rest = &l[start..];
                let rest = rest.trim_start_matches('\'');
                let end = rest.find(['\'', ',', ' ', '}'])?;
                Some(rest[..end].to_string())
            };
            let label_start = l.find("label: '").map(|i| i + 8);
            let label = label_start
                .and_then(|s| l[s..].find('\'').map(|e| l[s..s + e].to_string()))
                .unwrap_or_default();
            if let (Some(name), Some(dark)) = (field("name"), field("dark")) {
                out.push(Theme {
                    name,
                    label,
                    dark: dark == "true",
                });
            }
        }
        out
    })
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
    pub problems: Arc<dyn Fn() -> Vec<Problem> + Send + Sync>,
    pub update: Arc<dyn Fn() -> UpdateView + Send + Sync>,
    pub health: Health,
    pub clients: Clients,
    pub auth: AuthState,
    /// The service opted in and runs without secrets: no door, a banner.
    pub open: bool,
    env: Arc<Environment<'static>>,
}

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
        let mut env = Environment::new();
        env.add_template("layout.html", include_str!("../../templates/layout.html"))
            .map_err(template_error)?;
        env.add_template("login.html", include_str!("../../templates/login.html"))
            .map_err(template_error)?;
        env.add_template("status.html", include_str!("../../templates/status.html"))
            .map_err(template_error)?;
        env.add_template("clients.html", include_str!("../../templates/clients.html"))
            .map_err(template_error)?;
        env.add_template("error.html", include_str!("../../templates/error.html"))
            .map_err(template_error)?;
        env.add_template(
            "passkeys.html",
            include_str!("../../templates/passkeys.html"),
        )
        .map_err(template_error)?;
        env.add_global("app_name", app_name);
        env.add_global("open_dashboard", open);
        env.add_global("prefix", prefix.clone());
        env.add_global("assets", asset_version());
        env.add_global("themes", minijinja::Value::from_serialize(themes()));
        env.add_global("nav", minijinja::Value::from_serialize(&kit_nav));
        env.add_global("chassis_version", crate::VERSION);
        env.add_global("kp_themes_version", KP_THEMES_VERSION);
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
            problems,
            update,
            health,
            clients,
            auth,
            open,
            env: Arc::new(env),
        })
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
            active_nav => active_nav,
            ..own
        };
        Ok(Html(tmpl.render(full).map_err(template_error)?))
    }

    /// CF-7: a refusal shown to a browser as a page in the layout — the
    /// kit's error and remedy, with the navigation around it and a way
    /// back — instead of a JSON document on its own tab.
    pub fn render_error(&self, status: StatusCode, message: &str, remedy: &str) -> Option<String> {
        self.render(
            "error.html",
            context! {
                logged_in => false,
                active_nav => "",
                status => status.as_u16(),
                reason => status.canonical_reason().unwrap_or(""),
                message => message,
                remedy => remedy,
            },
        )
        .ok()
        .map(|h| h.0)
    }

    fn render(&self, name: &str, ctx: minijinja::Value) -> Result<Html<String>, Error> {
        let tmpl = self.env.get_template(name).map_err(template_error)?;
        Ok(Html(tmpl.render(ctx).map_err(template_error)?))
    }

    fn login_page(&self, error: Option<&str>, https: bool) -> Result<Html<String>, Error> {
        self.render(
            "login.html",
            context! {
                logged_in => false,
                active_nav => "",
                error => error,
                remember_me_days => self.remember_me_days,
                passkeys => self.passkeys_enabled && https,
            },
        )
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
                active_nav => "/passkeys",
                https => https,
                public_url => self.public_url,
                passkeys => passkeys,
            },
        )
    }
}

fn template_error(e: minijinja::Error) -> Error {
    Error::internal(
        format!("template error: {e}"),
        "this is a bug in the kit or in a project template; the message names the template and line",
    )
}

/// `GET /login`.
pub async fn login_get(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
) -> Response {
    if d.open {
        // Nothing to log in with; the banner on every page says why.
        return Redirect::to("/").into_response();
    }
    let https = d.is_https(peer, &headers);
    match d.login_page(None, https) {
        Ok(html) => html.into_response(),
        Err(e) => e.into_response(),
    }
}

/// `POST /login`: wrong token re-renders the page with the message and
/// HTTP 200 (K8); a good one sets the cookie and goes to the status page.
pub async fn login_post(
    State(d): State<Dashboard>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    axum::Form(form): axum::Form<LoginForm>,
) -> Response {
    if d.open {
        return Redirect::to("/").into_response();
    }
    match login(&d.auth, &form, peer, &headers).await {
        Ok(LoginOutcome::Ok(cookie)) => {
            (CookieJar::new().add(cookie), Redirect::to("/")).into_response()
        }
        Ok(LoginOutcome::Wrong(msg)) => match d.login_page(Some(msg), d.is_https(peer, &headers)) {
            Ok(html) => (StatusCode::OK, html).into_response(),
            Err(e) => e.into_response(),
        },
        Err(e) => e.into_response(),
    }
}

/// `GET /` — the status page (K17).
pub async fn status_page(State(d): State<Dashboard>) -> Result<Html<String>, Error> {
    let health = d.health.report().await;
    let sections: Vec<Section> = d.sections.iter().map(|s| s.render()).collect();
    let problems = (d.problems)();
    let update = (d.update)();
    d.render(
        "status.html",
        context! {
            logged_in => true,
            active_nav => "/",
            version => d.version,
            listen => d.listen,
            started_at => d.started_at,
            health => minijinja::Value::from_serialize(&health),
            sections => sections,
            problems => problems,
            update => update,
        },
    )
}

#[derive(Serialize)]
struct ClientRow {
    #[serde(flatten)]
    view: ClientView,
    extra: Vec<String>,
}

/// `GET /clients` — the clients page (K12, K13, K14).
pub async fn clients_page(State(d): State<Dashboard>) -> Result<Html<String>, Error> {
    let snap = d.clients.snapshot();
    let rows: Vec<ClientRow> = snap
        .clients
        .iter()
        .map(|c| {
            let view = ClientView::from(c);
            let extra = d.columns.iter().map(|col| col.cell(&view)).collect();
            ClientRow { view, extra }
        })
        .collect();
    let columns: Vec<serde_json::Value> = d
        .columns
        .iter()
        .map(|c| serde_json::json!({ "title": c.title() }))
        .collect();
    d.render(
        "clients.html",
        context! {
            logged_in => true,
            active_nav => "/clients",
            clients_label => d.clients_label,
            clients => rows,
            extra_columns => columns,
            form_fields => d.form_fields.iter().map(|f| f.view()).collect::<Vec<_>>(),
            reveal_seconds => d.reveal_seconds,
            capture_body_bytes => d.capture_body_bytes,
            capture_ttl_minutes => d.capture_ttl_minutes,
            has_test_route => d.has_test_route,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_list_comes_from_the_vendored_registry() {
        let t = themes();
        assert_eq!(
            t.len(),
            24,
            "kp-themes 3.1.0 ships exactly 24 themes; the vendored registry is pinned"
        );
        assert_eq!(t[0].name, "formal");
        assert_eq!(t[0].label, "Formal");
        assert!(!t[0].dark);
        let hc = t
            .iter()
            .find(|x| x.name == "high-contrast")
            .expect("high-contrast");
        assert_eq!(hc.label, "High contrast");
        assert!(t.iter().any(|x| x.name == "cyberpunk" && x.dark));
    }

    // K16: every kit page opens with an explain block.
    #[test]
    fn every_page_template_has_an_explain_block() {
        for (name, src) in [
            ("login.html", include_str!("../../templates/login.html")),
            ("status.html", include_str!("../../templates/status.html")),
            ("clients.html", include_str!("../../templates/clients.html")),
            ("error.html", include_str!("../../templates/error.html")),
            (
                "passkeys.html",
                include_str!("../../templates/passkeys.html"),
            ),
        ] {
            assert!(
                src.contains("class=\"explain\""),
                "{name} lacks an explain block"
            );
        }
    }

    // The no-flash snippet (now `static/theme-boot.js`, S8: no inline
    // script) must match the vendored module's behaviour: same storage
    // key, same attribute — and the layout must load it as a plain script.
    #[test]
    fn no_flash_snippet_matches_the_vendored_contract() {
        let layout = include_str!("../../templates/layout.html");
        let boot = include_str!("../../static/theme-boot.js");
        let registry = include_str!("../../static/kp/theme-registry.js");
        assert!(boot.contains("localStorage.getItem(\"theme\")"));
        assert!(registry.contains("STORAGE_KEY = 'theme'"));
        assert!(boot.contains("setAttribute(\"data-theme\""));
        assert!(
            layout.contains("/static/theme-boot.js?v="),
            "the layout loads the snippet as a file"
        );
        assert!(
            !layout.contains("<script>\n"),
            "no inline script in the layout (CSP script-src 'self')"
        );
        assert!(!layout.contains("bunny.net"), "fonts are vendored (S8)");
    }
}
