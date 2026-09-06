//! Reading the three layers from the world (K2, AR3): flags the CLI
//! parsed, the process environment under the app's prefix, and the TOML
//! file under the state root. The precedence itself lives in
//! `core::config`; this module only collects.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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
mod tests {
    use super::*;

    fn knobs() -> Vec<Knob> {
        vec![
            Knob {
                key: "listen",
                default: Some("0.0.0.0:8080"),
                secret: false,
                doc: "",
                feature: None,
            },
            Knob {
                key: "state_dir",
                default: None,
                secret: false,
                doc: "",
                feature: None,
            },
            Knob {
                key: "config",
                default: None,
                secret: false,
                doc: "",
                feature: None,
            },
        ]
    }

    #[test]
    fn missing_file_is_fine_and_malformed_file_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let (flat, _) = file_layer(&dir.path().join("none.toml"), &knobs()).unwrap();
        assert!(flat.is_empty());
        std::fs::write(dir.path().join("bad.toml"), "listen = [").unwrap();
        let err = file_layer(&dir.path().join("bad.toml"), &knobs()).unwrap_err();
        assert!(err.message.contains("not valid TOML"));
    }

    #[test]
    fn file_under_state_dir_is_read_and_flag_state_dir_wins() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "listen = \"127.0.0.1:1\"\n[inbox]\nx = 1\n",
        )
        .unwrap();
        let mut flags = BTreeMap::new();
        flags.insert("state_dir".to_string(), dir.path().display().to_string());
        let loaded = load("T", &knobs(), flags, Path::new("/nonexistent")).unwrap();
        assert_eq!(loaded.get("listen"), Some("127.0.0.1:1"));
        assert_eq!(loaded.source("listen"), Some(Source::File));
        assert_eq!(loaded.state_dir, dir.path());
        assert!(loaded.file_table.get("inbox").is_some());
    }
}
