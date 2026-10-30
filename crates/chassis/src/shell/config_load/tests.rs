//! Unit tests for `config_load`; kept in their own file so the module stays small.

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

fn spec() -> AppSpec {
    AppSpec {
        name: "t-app",
        ..Default::default()
    }
}

/// The file as a consumer really writes it: kit knobs, the kit's own
/// `notify` section, and the project's own flat key and table.
fn shared_table() -> toml::Table {
    r#"
listen = "127.0.0.1:1"
notify_retries = 2
greeting = "hello"

[[notify.webhook]]
events = ["update.ok"]
url = "http://h"

[inbox]
topic = "ops"
"#
    .parse()
    .unwrap()
}

fn loaded_with(file_table: toml::Table) -> Loaded {
    Loaded {
        resolved: Vec::new(),
        file_path: PathBuf::from("/etc/t-app/config.toml"),
        file_table,
        state_dir: PathBuf::from("/var/lib/t-app"),
    }
}

#[derive(Debug, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectConfig {
    greeting: String,
    inbox: Inbox,
}

#[derive(Debug, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Inbox {
    topic: String,
}

/// feat-config-1: what the kit owns is gone, what the project wrote is
/// untouched — including the `notify` section, which no knob key names.
#[test]
fn project_table_keeps_the_projects_keys_and_nothing_of_the_kits() {
    let spec = spec();
    let table = loaded_with(shared_table()).project_table(&spec);
    assert_eq!(
        table.keys().collect::<Vec<_>>(),
        vec!["greeting", "inbox"],
        "{table:?}"
    );
    for section in spec.kit_sections() {
        assert!(!table.contains_key(*section), "{section} is the kit's");
    }
}

/// feat-config-1: the point of the strip — the project's own struct
/// refuses unknown fields, and the kit's leftovers would be unknown.
#[test]
fn project_config_deserialises_a_deny_unknown_fields_struct() {
    let config: ProjectConfig = loaded_with(shared_table()).project_config(&spec()).unwrap();
    assert_eq!(
        config,
        ProjectConfig {
            greeting: "hello".to_string(),
            inbox: Inbox {
                topic: "ops".to_string()
            },
        }
    );
    let mut with_typo = shared_table();
    with_typo.insert("greetings".to_string(), toml::Value::from("hi"));
    let err = loaded_with(with_typo)
        .project_config::<ProjectConfig>(&spec())
        .unwrap_err();
    assert!(err.message.contains("greetings"), "{err}");
    assert!(err.remedy.contains("remove the key"), "{err}");
}

/// feat-config-1: the strip is driven by `AppSpec::kit_sections`, not by
/// the name `notify`. A section the kit starts reading is stripped the
/// moment it is listed there — and until it is listed, it stays in the
/// project's table and breaks the project's parse.
#[test]
fn a_kit_section_is_stripped_because_the_list_names_it() {
    let spec = spec();
    let mut table = shared_table();
    table.insert(
        "audit".to_string(),
        toml::Value::Table(toml::Table::from_iter([(
            "sink".to_string(),
            toml::Value::from("file"),
        )])),
    );
    assert!(
        loaded_with(table.clone())
            .project_table(&spec)
            .contains_key("audit"),
        "an unlisted section is the project's"
    );
    let listed: Vec<&str> = spec
        .kit_sections()
        .iter()
        .copied()
        .chain(["audit"])
        .collect();
    let stripped = strip_kit(&table, &spec.knob_keys(), &listed);
    assert_eq!(
        stripped.keys().collect::<Vec<_>>(),
        vec!["greeting", "inbox"],
        "a listed section goes with the rest of the kit's: {stripped:?}"
    );
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
