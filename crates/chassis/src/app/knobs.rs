//! The kit's own knob table (AR3) and its Markdown rendering (K31, K36).
//! The rows are long, so each family of knobs lives in a child module and
//! `AppSpec::knobs` only concatenates them in milestone order.

use crate::core::config::Knob;

use super::{AppSpec, compiled_features};

mod dashboard;
mod guards;
mod notify_storage;
mod update;

/// Feature names a knob row is tagged with; `None` marks a core knob.
const DASHBOARD: Option<&str> = Some("dashboard");
const PASSKEYS: Option<&str> = Some("passkeys");
const UPDATE: Option<&str> = Some("self-update");
const NOTIFY: Option<&str> = Some("notify");
const STORAGE: Option<&str> = Some("storage");

/// One ordinary knob row.
fn k(
    key: &'static str,
    default: Option<&'static str>,
    feature: Option<&'static str>,
    doc: &'static str,
) -> Knob {
    Knob {
        key,
        default,
        secret: false,
        doc,
        feature,
    }
}

/// One secret knob row: no default, environment only, `dashboard` feature.
fn secret(key: &'static str, doc: &'static str) -> Knob {
    Knob {
        key,
        default: None,
        secret: true,
        doc,
        feature: DASHBOARD,
    }
}

/// The listening, state and logging knobs every service has.
fn base_rows(default_listen: &'static str) -> Vec<Knob> {
    vec![
        k(
            "listen",
            Some(default_listen),
            None,
            "The `host:port` to bind; port 0 picks a free one and the bound address is logged.",
        ),
        k(
            "state_dir",
            None,
            None,
            "The one directory all state lives under (default `/var/lib/<name>`); flag or env only, since the config file lives inside it.",
        ),
        k(
            "config",
            None,
            None,
            "Path of the TOML config file (default `<state_dir>/config.toml`); flag or env only.",
        ),
        k(
            "log",
            Some("info"),
            None,
            "The `tracing` log filter, e.g. `info` or `info,chassis=debug`.",
        ),
        k(
            "log_format",
            Some("text"),
            None,
            "Format of a log line: `text` or `json`.",
        ),
        k(
            "shutdown_timeout_ms",
            Some("10000"),
            None,
            "Milliseconds allowed for draining in-flight requests and for each flush hook at stop; 0 is refused.",
        ),
    ]
}

/// Every knob row the kit owns, in milestone order: listening and
/// logging first, then the guards, the dashboard, self-update and the
/// notifier (AR3). The rows of each family live in a child module.
pub(super) fn rows(default_listen: &'static str) -> Vec<Knob> {
    [
        base_rows(default_listen),
        guards::rows(),
        dashboard::rows(),
        update::rows(),
        notify_storage::rows(),
    ]
    .concat()
}

/// The knob table as Markdown for `features` (K31, K36): one row per knob
/// in `rows()` order, with the three names, the default (`—` when there is
/// none, `(secret)` for the two secrets, whose value never appears
/// anywhere), the feature that reads it and its one-sentence meaning.
pub(super) fn markdown<S: AsRef<str>>(spec: &AppSpec, features: &[S]) -> String {
    let built = |feature: Option<&str>| match feature {
        None => true,
        Some(f) => features.iter().any(|s| s.as_ref() == f),
    };
    let prefix = spec.prefix();
    let mut out = String::from(
        "| Key | Env | Flag | Default | Feature | Meaning |\n|---|---|---|---|---|---|\n",
    );
    for k in spec.knobs().into_iter().filter(|k| built(k.feature)) {
        let default = if k.secret {
            "(secret)".to_string()
        } else {
            match k.default {
                Some("") => "`\"\"`".to_string(),
                Some(d) => format!("`{d}`"),
                None => "—".to_string(),
            }
        };
        let flag = if k.secret {
            "—".to_string()
        } else {
            format!("`{}`", k.flag_name())
        };
        out.push_str(&format!(
            "| `{}` | `{}` | {} | {} | {} | {} |\n",
            k.key,
            k.env_name(&prefix),
            flag,
            default,
            k.feature.unwrap_or("core"),
            k.doc,
        ));
    }
    out
}

impl AppSpec {
    /// The kit's own knobs (AR3), in milestone order: listening and
    /// logging first, then the guards, the dashboard, self-update and the
    /// notifier. Milestones add rows here; `docs/CONFIGURATION.md` points
    /// at `--knobs` instead of repeating the list (K31).
    pub fn knobs(&self) -> Vec<Knob> {
        rows(self.default_listen)
    }

    /// The knob table as Markdown (K31) for the features this binary was
    /// built with (K36): one row per knob in `knobs()` order, with the
    /// three names, the default (`—` when there is none, `(secret)` for the
    /// two secrets, whose value never appears anywhere), the feature that
    /// reads it and its one-sentence meaning. Printed by `--knobs`.
    pub fn knobs_markdown(&self) -> String {
        self.knobs_markdown_for(compiled_features())
    }

    /// [`AppSpec::knobs_markdown`] for a named set of features instead of
    /// this binary's own (K36). `chassis sync` renders `docs/KIT.md` from
    /// outside the service, so it passes the feature list it read from the
    /// project's `Cargo.toml`; the `chassis` command's own features are
    /// those of a scaffold tool and say nothing about the project.
    ///
    /// A knob whose `feature` is `None` is core and always listed. Note
    /// that this filters the DOCUMENT, not [`AppSpec::knobs`] or
    /// [`AppSpec::knob_keys`]: a knob of a feature the binary lacks is
    /// still accepted and ignored in the config file, which is what
    /// `docs/KIT.md` promises.
    pub fn knobs_markdown_for<S: AsRef<str>>(&self, features: &[S]) -> String {
        markdown(self, features)
    }
}
