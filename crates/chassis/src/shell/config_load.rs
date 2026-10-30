//! Reading the three layers from the world (K2, AR3): flags the CLI
//! parsed, the process environment under the app's prefix, and the TOML
//! file under the state root. The precedence itself lives in
//! `core::config`; this module only collects.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::app::AppSpec;
use crate::core::config::{Knob, Layers, Resolved, Source, resolve};
use crate::core::error::Error;

/// Snapshot the process environment once, so every layer and every
/// `${VAR}` expansion sees the same values.
pub fn env_snapshot() -> BTreeMap<String, String> {
    std::env::vars().collect()
}

/// The env layer: every knob whose `<PREFIX>_<KEY>` is set.
pub fn env_layer(
    prefix: &str,
    knobs: &[Knob],
    env: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    knobs
        .iter()
        .filter_map(|k| {
            env.get(&k.env_name(prefix))
                .map(|v| (k.key.to_string(), v.clone()))
        })
        .collect()
}

/// The file layer: top-level keys of a TOML file, rendered to text.
/// Nested tables are left for the project (`[inbox]` and friends); the
/// kit reads only its own flat keys. A missing file is not an error —
/// the file is optional — but an unreadable or malformed one is.
pub fn file_layer(
    path: &Path,
    knobs: &[Knob],
) -> Result<(BTreeMap<String, String>, toml::Table), Error> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((BTreeMap::new(), toml::Table::new()));
        }
        Err(e) => {
            return Err(Error::config(
                format!("cannot read config file {}: {e}", path.display()),
                "fix the file's permissions, or point --config / the CONFIG env var at the right file",
            ));
        }
    };
    let table: toml::Table = text.parse().map_err(|e| {
        Error::config(
            format!("config file {} is not valid TOML: {e}", path.display()),
            "fix the syntax error at the position named above",
        )
    })?;
    let mut flat = BTreeMap::new();
    for k in knobs {
        if let Some(v) = table.get(k.key) {
            let rendered = match v {
                toml::Value::String(s) => s.clone(),
                toml::Value::Integer(i) => i.to_string(),
                toml::Value::Float(f) => f.to_string(),
                toml::Value::Boolean(b) => b.to_string(),
                other => {
                    return Err(Error::config(
                        format!(
                            "config key `{}` in {} is a {} and must be a scalar",
                            k.key,
                            path.display(),
                            other.type_str()
                        ),
                        "write it as a string, number or boolean",
                    ));
                }
            };
            flat.insert(k.key.to_string(), rendered);
        }
    }
    Ok((flat, table))
}

/// Everything the kit resolved plus the raw file table for the project.
#[derive(Debug, Clone)]
pub struct Loaded {
    pub resolved: Vec<Resolved>,
    pub file_path: PathBuf,
    pub file_table: toml::Table,
    pub state_dir: PathBuf,
}

impl Loaded {
    /// A resolved knob's value, if it has one.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.resolved
            .iter()
            .find(|r| r.key == key)
            .map(|r| r.value.as_str())
    }

    pub fn source(&self, key: &str) -> Option<Source> {
        self.resolved
            .iter()
            .find(|r| r.key == key)
            .map(|r| r.source)
    }

    /// The project's half of the shared config file (feat-config-1): the
    /// file table with every kit knob key and every kit-owned section
    /// removed. What remains is the project's alone, so it can be parsed
    /// with `deny_unknown_fields`. Prefer [`crate::App::project_table`],
    /// which knows the spec already.
    pub fn project_table(&self, spec: &AppSpec) -> toml::Table {
        strip_kit(&self.file_table, &spec.knob_keys(), spec.kit_sections())
    }

    /// [`Loaded::project_table`] deserialised into the project's own type.
    /// Prefer [`crate::App::project_config`], which is the one-line call.
    pub fn project_config<T: serde::de::DeserializeOwned>(
        &self,
        spec: &AppSpec,
    ) -> Result<T, Error> {
        toml::Value::Table(self.project_table(spec))
            .try_into()
            .map_err(|e| {
                Error::config(
                    format!(
                        "config file {} does not match this service's own settings: {e}",
                        self.file_path.display()
                    ),
                    "fix or remove the key the message names; the kit's own keys and sections are already stripped and are listed by --knobs",
                )
            })
    }
}

/// Remove what the kit owns from a file table. The two lists are arguments
/// rather than read off the spec so a test can prove that a section
/// disappears BECAUSE it is listed in `AppSpec::kit_sections`.
fn strip_kit(table: &toml::Table, knob_keys: &[&str], sections: &[&str]) -> toml::Table {
    let mut out = table.clone();
    for name in knob_keys.iter().chain(sections) {
        out.remove(*name);
    }
    out
}

/// Collect the layers and resolve them. `flags` is what clap parsed
/// (already keyed by knob key). The state root and config path are
/// special: they decide WHERE the file layer is read from, so they are
/// resolved from flags, env and default before the file exists.
pub fn load(
    prefix: &str,
    knobs: &[Knob],
    flags: BTreeMap<String, String>,
    default_state_dir: &Path,
) -> Result<Loaded, Error> {
    load_with_env(prefix, knobs, flags, default_state_dir, env_snapshot())
}

/// `load` with an explicit environment instead of the process's: tests
/// hand secrets in this way (S8 took them off argv), embedders may too.
pub fn load_with_env(
    prefix: &str,
    knobs: &[Knob],
    flags: BTreeMap<String, String>,
    default_state_dir: &Path,
    env: BTreeMap<String, String>,
) -> Result<Loaded, Error> {
    let env_layer = env_layer(prefix, knobs, &env);

    let state_dir = flags
        .get("state_dir")
        .cloned()
        .or_else(|| env_layer.get("state_dir").cloned())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_state_dir.to_path_buf());
    let file_path = flags
        .get("config")
        .cloned()
        .or_else(|| env_layer.get("config").cloned())
        .map(PathBuf::from)
        .unwrap_or_else(|| state_dir.join("config.toml"));

    let (file_layer, file_table) = file_layer(&file_path, knobs)?;
    let layers = Layers {
        flags,
        env: env_layer,
        file: file_layer,
    };
    let mut resolved = resolve(prefix, knobs, &layers, &env)?;
    // The two location knobs are reported like any other, with the value
    // that was actually used.
    for (key, value) in [("state_dir", &state_dir), ("config", &file_path)] {
        if let Some(r) = resolved.iter_mut().find(|r| r.key == key) {
            r.value = value.display().to_string();
        }
    }
    Ok(Loaded {
        resolved,
        file_path,
        file_table,
        state_dir,
    })
}

#[cfg(test)]
mod tests;
