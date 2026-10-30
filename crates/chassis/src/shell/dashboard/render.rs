//! Rendering a [`Dashboard`]: the public renderers a project calls (its own
//! page, an error page, the passkeys page) and the private helpers behind
//! them (idle-client count, plain template rendering, the login page).

use super::*;

impl Dashboard {
    /// kit-kp11: how many clients are idle, the number on the Clients tab.
    /// The same figure as `counts.idle` on the Clients page (one rule, in
    /// `client_list`), written into the page by the server so the bar never
    /// waits on a read.
    pub(super) fn idle_clients(&self) -> usize {
        let now = chrono::Utc::now();
        let views: Vec<ClientView> = self
            .clients
            .snapshot()
            .clients
            .iter()
            .map(ClientView::from)
            .collect();
        client_list::counts(views.iter().map(|v| (client_list::standing(v, now).0, v))).idle
    }

    pub(super) fn render(&self, name: &str, ctx: minijinja::Value) -> Result<Html<String>, Error> {
        let tmpl = self.env.get_template(name).map_err(template_error)?;
        Ok(Html(tmpl.render(ctx).map_err(template_error)?))
    }

    pub(super) fn login_page(
        &self,
        error: Option<&str>,
        https: bool,
    ) -> Result<Html<String>, Error> {
        self.render(
            "login.html",
            context! {
                logged_in => false,
                active_nav => "",
                error => error,
                remember_me_days => self.remember_me_days,
                passkeys => self.passkeys_enabled && https,
                // The login page says what the service is before anyone is in.
                version => self.version,
                started_at => self.started_at,
            },
        )
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
