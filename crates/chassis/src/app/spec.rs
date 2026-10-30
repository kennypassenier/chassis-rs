//! The names a service derives from its `AppSpec`: environment and metric
//! prefixes, and the config sections the kit owns.

use super::AppSpec;

impl AppSpec {
    /// `INBOX` for `inbox`; dashes become underscores.
    pub fn prefix(&self) -> String {
        self.name.to_ascii_uppercase().replace('-', "_")
    }

    /// `inbox` for `inbox`; dashes become underscores (Prometheus names).
    pub fn metric_prefix(&self) -> String {
        self.name.to_ascii_lowercase().replace('-', "_")
    }

    /// The config-file keys the kit owns (1.1.0): a project that parses the
    /// same file with `deny_unknown_fields` strips these first.
    pub fn knob_keys(&self) -> Vec<&'static str> {
        self.knobs().into_iter().map(|k| k.key).collect()
    }

    /// The config-file TABLE sections the kit owns (feat-config-1), next to
    /// the knob keys because the two are stripped together.
    ///
    /// A section cannot be derived from `knob_keys()`: a knob is one flat
    /// scalar key, while a section is a table or an array of tables
    /// (`[[notify.webhook]]`) that the kit parses with its own serde types
    /// and never registers as a knob. Whatever is missing here lands in the
    /// project's half of the file and makes its `deny_unknown_fields` parse
    /// fail on a machine, after an upgrade — so a milestone that teaches the
    /// kit a new section adds its name here in the same commit.
    ///
    /// Complete whatever the binary was compiled with, like `knob_keys()`: a
    /// section of an absent feature is still accepted and ignored.
    pub fn kit_sections(&self) -> &'static [&'static str] {
        &["notify"]
    }
}
