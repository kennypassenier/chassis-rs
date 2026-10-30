//! The `with_*` builders the app wiring calls on a [`Dashboard`] after
//! `new` (command template, test body, update checker, repository, pages,
//! vocabulary article) and the uptime sampler. Crate-internal, so they sit
//! apart from the public constructor and renderers in the parent.

use super::*;

impl Dashboard {
    /// 3.15.0: show the Notifications card on the Status page.
    #[cfg(feature = "notify")]
    pub(crate) fn with_notify_card(mut self, on: bool) -> Self {
        self.notify_card = on;
        self
    }

    /// kit-kp11: where the service's releases are described, from
    /// `AppSpec::repository`.
    pub(crate) fn with_repository(mut self, repository: Option<&str>) -> Self {
        self.repository_url = repository
            .filter(|r| r.split('/').count() == 2)
            .map(|r| format!("https://github.com/{r}"));
        self
    }

    /// kit-kp11: the checker behind "Check for updates".
    pub(crate) fn with_update_check(mut self, check: Option<UpdateCheck>) -> Self {
        self.check_update = check;
        self
    }

    /// kit-kp11: keep the availability strip: one sample now, then one every
    /// five minutes for as long as the service runs.
    pub(crate) fn spawn_uptime_sampler(&self) {
        let d = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(300));
            loop {
                tick.tick().await;
                d.sample_health().await;
            }
        });
    }

    /// Read the health once and note it in the history.
    pub(super) async fn sample_health(&self) -> crate::shell::health::Report {
        let report = self.health.report().await;
        self.note_report(&report);
        report
    }

    fn note_report(&self, report: &crate::shell::health::Report) {
        let (parts, failing) = match report.subsystems.as_object() {
            Some(map) => (map.len(), map.values().filter(|v| v["ok"] == false).count()),
            None => (0, 0),
        };
        self.uptime
            .record(Sample::from_report(report.status == "ok", parts, failing));
    }

    /// kit-kp11: the command a program is wired up with, token as
    /// the token variable (see `clients_api::command_template`).
    pub(crate) fn with_command_template(mut self, template: String) -> Self {
        self.command_template = Arc::from(template);
        self
    }

    /// kit-kp11 (clients-manage): what the Test it field starts with.
    pub(crate) fn with_test_body(mut self, body: String, content_type: &str) -> Self {
        self.test_json = content_type.to_ascii_lowercase().contains("json");
        self.test_body = Arc::from(body);
        self
    }

    /// kit-r4: the article before the singular, as the templates
    /// (`vocab_article`, `vocab_article_cap`) and the clients API's
    /// messages write it. Call after `with_vocabulary`; the service's own
    /// override wins over the vowel-sound rule.
    pub(crate) fn with_vocabulary_article(mut self, article: &str) -> Self {
        let env = Arc::make_mut(&mut self.env);
        env.add_global("vocab_article", article.to_string());
        env.add_global("vocab_article_cap", capitalise(article));
        self
    }

    /// feat-pages-1: the navigation from the page registry: the visible
    /// pages in order, and where the brand link goes.
    pub(crate) fn with_pages(mut self, set: &crate::shell::pages::PageSet) -> Self {
        self.nav = set
            .pages
            .iter()
            .filter(|p| p.nav)
            .map(|p| NavEntry {
                label: p.title.clone(),
                href: p.path.clone(),
            })
            .collect();
        self.clients_href = set
            .pages
            .iter()
            .find(|p| p.id == "clients")
            .map(|p| p.path.clone());
        let env = Arc::make_mut(&mut self.env);
        env.add_global("nav", minijinja::Value::from_serialize(&self.nav));
        env.add_global(
            "pages",
            minijinja::Value::from_serialize(
                set.pages
                    .iter()
                    .filter(|p| p.nav)
                    .map(|p| {
                        serde_json::json!({
                            "id": p.id, "title": p.title, "path": p.path, "group": p.group,
                            "hint": p.hint,
                        })
                    })
                    .collect::<Vec<_>>(),
            ),
        );
        env.add_global("brand_href", set.brand.href.clone());
        env.add_global("brand_title", set.brand.title.clone());
        self
    }
}
