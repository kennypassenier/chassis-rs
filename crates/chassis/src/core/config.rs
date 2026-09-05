//! Configuration precedence, as a pure calculation (AR3, K2).
//!
//! Four layers, strongest first: a command-line flag, an environment
//! variable, a key in the config file, the built-in default. This module
//! knows nothing about files or processes: the shell hands it the raw
//! values it found in each layer, and it answers with one value per knob
//! and the layer it came from. That provenance is what `--print-config`
//! shows ("listen = 0.0.0.0:9000, from env INBOX_LISTEN"), and it is why
//! the four projects' hand-rolled config code could not simply be reused:
//! none of them remembered where a value came from.
//!
//! `${VAR}` references inside a value are resolved here too, against the
//! environment snapshot the shell provides, so a secret can live in the
//! environment while the file says only where it goes (HTTPSwitchboard's
//! pattern). An unset variable is an error, never an empty string.

use std::collections::BTreeMap;

use crate::core::error::{Error, Kind};

/// Where a resolved value came from, strongest to weakest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Flag,
    Env,
    File,
    Default,
}

impl Source {
    /// The word `--print-config` shows.
    pub fn label(self) -> &'static str {
        match self {
            Source::Flag => "flag",
            Source::Env => "env",
            Source::File => "file",
            Source::Default => "default",
        }
    }
}

/// One knob's description: the three names it answers to and its default.
/// The names are derived from the key so a knob can never have a file key
/// that does not match its env var (`listen` → `INBOX_LISTEN` → `--listen`).
#[derive(Debug, Clone)]
pub struct Knob {
    /// The file key and the stem of the other two names, e.g. `listen`
    /// or `shutdown_timeout_ms`.
    pub key: &'static str,
    /// The built-in default, already rendered as text. `None` means the
    /// knob has no default and is simply absent when nobody sets it.
    pub default: Option<&'static str>,
    /// Secret knobs are shown as `***` by `--print-config` and are never
    /// accepted from the config file (AR3: secrets come from env only).
    pub secret: bool,
}

impl Knob {
    /// The environment variable name for this knob under `prefix`.
    pub fn env_name(&self, prefix: &str) -> String {
        format!("{}_{}", prefix, self.key.to_ascii_uppercase())
    }

    /// The flag name for this knob (`--shutdown-timeout-ms`).
    pub fn flag_name(&self) -> String {
        format!("--{}", self.key.replace('_', "-"))
    }
}

/// The raw values the shell found, one map per layer. Keys are knob keys.
#[derive(Debug, Default, Clone)]
pub struct Layers {
    pub flags: BTreeMap<String, String>,
    pub env: BTreeMap<String, String>,
    pub file: BTreeMap<String, String>,
}

/// One resolved knob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub key: String,
    pub value: String,
    pub source: Source,
    pub secret: bool,
    /// The raw value contained `${VAR}`; shown masked by `--print-config`.
    pub expanded: bool,
}

/// Resolve every knob against the layers, strongest layer wins.
///
/// `env_snapshot` is used only for `${VAR}` expansion inside values; it
/// is the same environment the `env` layer was read from, passed
/// separately because expansion applies to values from ANY layer (a file
/// value `token = "${INBOX_TOKEN}"` is the whole point).
pub fn resolve(
    prefix: &str,
    knobs: &[Knob],
    layers: &Layers,
    env_snapshot: &BTreeMap<String, String>,
) -> Result<Vec<Resolved>, Error> {
    let mut out = Vec::with_capacity(knobs.len());
    for knob in knobs {
        let picked = if let Some(v) = layers.flags.get(knob.key) {
            Some((v.clone(), Source::Flag))
        } else if let Some(v) = layers.env.get(knob.key) {
            Some((v.clone(), Source::Env))
        } else if let Some(v) = layers.file.get(knob.key) {
            if knob.secret {
                return Err(Error::new(
                    Kind::Config,
                    format!("secret knob `{}` was set in the config file", knob.key),
                    format!(
                        "remove it from the file and set {} in the environment (or an EnvironmentFile) instead; secrets never live in the config file",
                        knob.env_name(prefix)
                    ),
                ));
            }
            Some((v.clone(), Source::File))
        } else {
            knob.default.map(|d| (d.to_string(), Source::Default))
        };

        if let Some((raw, source)) = picked {
            let value = expand(&raw, env_snapshot).map_err(|missing| {
                Error::new(
                    Kind::Config,
                    format!(
                        "knob `{}` (from {}) references ${{{}}}, which is not set",
                        knob.key,
                        source.label(),
                        missing
                    ),
                    format!(
                        "export {missing}=<value> before starting, or write the value directly"
                    ),
                )
            })?;
            out.push(Resolved {
                key: knob.key.to_string(),
                value,
                source,
                secret: knob.secret,
                // Critic #20: a value pulled in through `${VAR}` may be a
                // secret the file never held; --print-config masks it too.
                expanded: raw.contains("${"),
            });
        }
    }
    Ok(out)
}

/// Replace every `${NAME}` in `raw` with the environment's value.
/// Returns the first missing name on failure. `$$` is not an escape:
/// nothing in Kenny's configs needs a literal `${`, and an escape rule is
/// one more thing to explain.
pub fn expand(raw: &str, env: &BTreeMap<String, String>) -> Result<String, String> {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            // An unterminated `${` is kept literally: it is not a
            // reference, and refusing it would hide a value that was
            // typed on purpose.
            out.push_str(&rest[start..]);
            return Ok(out);
        };
        let name = &after[..end];
        match env.get(name) {
            Some(v) => out.push_str(v),
            None => return Err(name.to_string()),
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    Ok(out)
}

/// Render the resolved table the way `--print-config` prints it: one line
/// per knob, secrets masked, the source last so the eye can scan it.
pub fn render_table(resolved: &[Resolved]) -> String {
    let width = resolved.iter().map(|r| r.key.len()).max().unwrap_or(0);
    let mut s = String::new();
    for r in resolved {
        let shown = if r.secret {
            "***"
        } else if r.expanded {
            "*** (expanded from ${…})"
        } else {
            r.value.as_str()
        };
        s.push_str(&format!(
            "{:<width$} = {}  ({})\n",
            r.key,
            shown,
            r.source.label(),
            width = width
        ));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn knobs() -> Vec<Knob> {
        vec![
            Knob {
                key: "listen",
                default: Some("0.0.0.0:8080"),
                secret: false,
            },
            Knob {
                key: "token",
                default: None,
                secret: true,
            },
            Knob {
                key: "shutdown_timeout_ms",
                default: Some("10000"),
                secret: false,
            },
            Knob {
                key: "log",
                default: Some("info"),
                secret: false,
            },
        ]
    }

    /// K2 test bar, the whole table in ONE resolve: four knobs, each set in
    /// a different subset of layers, every winner and every source checked
    /// at once (the single-knob walk below shows each step on its own).
    #[test]
    fn precedence_table_all_layers_at_once() {
        let env = BTreeMap::new();
        let layers = Layers {
            flags: map(&[("listen", "flag:1")]),
            env: map(&[("listen", "env:1"), ("shutdown_timeout_ms", "env:2")]),
            file: map(&[
                ("listen", "file:1"),
                ("shutdown_timeout_ms", "file:2"),
                ("log", "file:3"),
            ]),
        };
        let r = resolve("X", &knobs(), &layers, &env).unwrap();
        let by_key = |k: &str| {
            r.iter()
                .find(|v| v.key == k)
                .map(|v| (v.value.clone(), v.source))
                .unwrap_or_else(|| panic!("{k} missing"))
        };
        assert_eq!(
            by_key("listen"),
            ("flag:1".to_string(), Source::Flag),
            "flag beats env and file"
        );
        assert_eq!(
            by_key("shutdown_timeout_ms"),
            ("env:2".to_string(), Source::Env),
            "env beats file"
        );
        assert_eq!(
            by_key("log"),
            ("file:3".to_string(), Source::File),
            "file beats the default"
        );
        assert!(
            r.iter().all(|v| v.key != "token"),
            "a knob set nowhere and without a default is absent"
        );
    }

    fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    // K2 test bar: the precedence table, every layer against every
    // weaker one.
    #[test]
    fn precedence_flag_env_file_default() {
        let env = BTreeMap::new();
        let all = Layers {
            flags: map(&[("listen", "flag:1")]),
            env: map(&[("listen", "env:1")]),
            file: map(&[("listen", "file:1")]),
        };
        let r = resolve("X", &knobs(), &all, &env).unwrap();
        assert_eq!((r[0].value.as_str(), r[0].source), ("flag:1", Source::Flag));

        let no_flag = Layers {
            flags: BTreeMap::new(),
            ..all.clone()
        };
        let r = resolve("X", &knobs(), &no_flag, &env).unwrap();
        assert_eq!((r[0].value.as_str(), r[0].source), ("env:1", Source::Env));

        let file_only = Layers {
            flags: BTreeMap::new(),
            env: BTreeMap::new(),
            file: map(&[("listen", "file:1")]),
        };
        let r = resolve("X", &knobs(), &file_only, &env).unwrap();
        assert_eq!((r[0].value.as_str(), r[0].source), ("file:1", Source::File));

        let r = resolve("X", &knobs(), &Layers::default(), &env).unwrap();
        assert_eq!(
            (r[0].value.as_str(), r[0].source),
            ("0.0.0.0:8080", Source::Default)
        );
        // A knob without a default and without a value is simply absent.
        assert!(r.iter().all(|k| k.key != "token"));
    }

    #[test]
    fn secret_in_file_is_refused_with_remedy() {
        let layers = Layers {
            file: map(&[("token", "abc")]),
            ..Default::default()
        };
        let err = resolve("INBOX", &knobs(), &layers, &BTreeMap::new()).unwrap_err();
        assert!(err.remedy.contains("INBOX_TOKEN"), "{}", err.remedy);
    }

    #[test]
    fn expansion_uses_env_and_fails_closed() {
        let env = map(&[("HOST", "10.10.10.18"), ("PORT", "9000")]);
        assert_eq!(expand("${HOST}:${PORT}", &env).unwrap(), "10.10.10.18:9000");
        assert_eq!(expand("plain", &env).unwrap(), "plain");
        assert_eq!(expand("${OPEN", &env).unwrap(), "${OPEN");
        assert_eq!(expand("${MISSING}", &env).unwrap_err(), "MISSING");
    }

    #[test]
    fn expansion_applies_to_file_values_and_is_reported_with_source() {
        let layers = Layers {
            file: map(&[("listen", "${HOST}:8080")]),
            ..Default::default()
        };
        let err = resolve("X", &knobs(), &layers, &BTreeMap::new()).unwrap_err();
        assert!(err.message.contains("from file"), "{}", err.message);
        assert!(err.message.contains("${HOST}"), "{}", err.message);
    }

    /// Critic #20: a non-secret knob whose value came in through `${VAR}`
    /// is masked too — the variable may hold a secret the file never did.
    #[test]
    fn render_masks_values_expanded_from_the_environment() {
        let env = map(&[("HIDDEN", "s3cret-from-env")]);
        let layers = Layers {
            flags: BTreeMap::new(),
            env: BTreeMap::new(),
            file: map(&[("listen", "${HIDDEN}"), ("log", "debug")]),
        };
        let r = resolve("X", &knobs(), &layers, &env).unwrap();
        let table = render_table(&r);
        assert!(!table.contains("s3cret-from-env"), "{table}");
        assert!(table.contains("expanded from"), "{table}");
        assert!(
            table.contains("debug"),
            "plain file values still show: {table}"
        );
    }

    #[test]
    fn render_masks_secrets_and_names_sources() {
        let layers = Layers {
            env: map(&[("token", "hunter2hunter2hunter2")]),
            ..Default::default()
        };
        let r = resolve("X", &knobs(), &layers, &BTreeMap::new()).unwrap();
        let table = render_table(&r);
        assert!(!table.contains("hunter2"));
        assert!(table.contains("token"));
        assert!(table.contains("(env)"));
        assert!(table.contains("(default)"));
    }

    #[test]
    fn names_derive_from_the_key() {
        let k = &knobs()[2];
        assert_eq!(k.env_name("INBOX"), "INBOX_SHUTDOWN_TIMEOUT_MS");
        assert_eq!(k.flag_name(), "--shutdown-timeout-ms");
    }
}
