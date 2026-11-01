//! Building a [`Dashboard`]: the public constructor `new`, the vocabulary
//! and client-action setters, and the crate-internal `with_*` builders the
//! app wiring calls after `new` (command template, test body, update
//! checker, repository, pages, vocabulary article), plus the uptime
//! sampler.

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

    /// feat-webapp-4: the tags that link the web app's manifest, for the
    /// layout's `<head>` (so an installed app can sign in); empty without.
    pub(crate) fn with_pwa_head(mut self, tags: Option<String>) -> Self {
        let env = Arc::make_mut(&mut self.env);
        env.add_global("pwa_head", tags.unwrap_or_default());
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
                            "hint": p.hint, "secondary": p.secondary,
                        })
                    })
                    .collect::<Vec<_>>(),
            ),
        );
        // ux-chassis-9: the "?" drawer reads its page's help by path, hidden
        // pages included (a page can be routable without being listed).
        let help: std::collections::BTreeMap<_, _> = set
            .pages
            .iter()
            .filter_map(|p| {
                let html = p.help.as_ref()?;
                Some((
                    p.path.clone(),
                    serde_json::json!({ "title": p.title, "html": html }),
                ))
            })
            .collect();
        env.add_global("help_by_path", minijinja::Value::from_serialize(help));
        env.add_global("brand_href", set.brand.href.clone());
        env.add_global("brand_title", set.brand.title.clone());
        self
    }

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
}
