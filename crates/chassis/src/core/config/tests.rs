//! Tests of the knob layers: precedence, expansion, masking and name derivation.

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
            key: "token",
            default: None,
            secret: true,
            doc: "",
            feature: None,
        },
        Knob {
            key: "shutdown_timeout_ms",
            default: Some("10000"),
            secret: false,
            doc: "",
            feature: None,
        },
        Knob {
            key: "log",
            default: Some("info"),
            secret: false,
            doc: "",
            feature: None,
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
