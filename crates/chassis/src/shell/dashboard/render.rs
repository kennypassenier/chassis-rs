//! The private rendering helpers of [`Dashboard`]: the idle-client count in
//! the navigation, plain template rendering and the login page. Its own
//! module so the public renderers in the parent stay small.

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
}
