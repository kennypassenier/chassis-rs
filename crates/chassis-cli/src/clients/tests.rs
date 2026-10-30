//! Tests of the clients command that need no running service.

use super::api::kind_of;
use super::rows::{ClientRow, parse_fields, resolve, short_time, table};
use super::token::admin_token;
use chassis::Kind;
use reqwest::StatusCode;

use secrecy::ExposeSecret;

fn row(id: &str, name: &str, active: bool) -> ClientRow {
    ClientRow {
        id: id.to_string(),
        name: name.to_string(),
        active,
        issued_at: "2026-09-06T21:35:12Z".to_string(),
        revoked_at: if active {
            None
        } else {
            Some("2026-09-07T08:00:00Z".to_string())
        },
        last_used_at: None,
        uses: 0,
    }
}

// Drilled red once: refusing `name` was removed and the third assert failed.
#[test]
fn k30_fields_parse_as_key_value_and_refuse_what_would_break_the_form() {
    let ok = parse_fields(&["calendar=cal-1".into(), "note=a=b".into()]).unwrap();
    assert_eq!(ok.get("calendar").unwrap(), "cal-1");
    assert_eq!(ok.get("note").unwrap(), "a=b", "only the first `=` splits");
    let err = parse_fields(&["name=other".into()]).unwrap_err();
    assert!(err.remedy.contains("positional"), "{err}");
    let err = parse_fields(&["calendar".into()]).unwrap_err();
    assert!(err.remedy.contains("--field key=value"), "{err}");
    let err = parse_fields(&["=x".into()]).unwrap_err();
    assert!(err.message.contains("empty key"), "{err}");
    let err = parse_fields(&["a=1".into(), "a=2".into()]).unwrap_err();
    assert!(err.message.contains("twice"), "{err}");
    assert!(parse_fields(&[]).unwrap().is_empty());
}

// Drilled red once: the default name was changed and the first assert failed.
#[test]
fn k30_the_token_comes_from_the_named_variable_or_the_default_and_never_argv() {
    let env = |name: &str| match name {
        "CHASSIS_TOKEN" => Some("default-token".to_string()),
        "SWITCHBOARD_TOKEN" => Some(" named-token \n".to_string()),
        "EMPTY" => Some("   ".to_string()),
        _ => None,
    };
    let (var, token) = admin_token(None, env).unwrap();
    assert_eq!(var, "CHASSIS_TOKEN");
    assert_eq!(token.expose_secret(), "default-token");
    let (var, token) = admin_token(Some("SWITCHBOARD_TOKEN"), env).unwrap();
    assert_eq!(var, "SWITCHBOARD_TOKEN");
    assert_eq!(token.expose_secret(), "named-token", "trimmed");
    // Missing or blank: a refusal that names the variable and the flag,
    // and no token value anywhere in it.
    let err = admin_token(Some("MISSING"), env).unwrap_err();
    assert_eq!(err.kind, Kind::Config);
    assert!(err.message.contains("MISSING"), "{err}");
    assert!(
        err.remedy.contains("never accepted on the command line"),
        "{err}"
    );
    let err = admin_token(Some("EMPTY"), env).unwrap_err();
    assert!(err.message.contains("EMPTY is not set"), "{err}");
    let err = admin_token(None, |_| None).unwrap_err();
    assert!(err.remedy.contains("--token-env"), "{err}");
    // A secret never prints itself.
    let (_, token) = admin_token(None, env).unwrap();
    assert!(!format!("{token:?}").contains("default-token"));
}

// Drilled red once: the id lookup was skipped and the first assert failed.
#[test]
fn k30_id_or_name_resolves_over_a_fixed_list() {
    let list = vec![
        row("11111111-1111-4111-8111-111111111111", "alertmanager", true),
        row("22222222-2222-4222-8222-222222222222", "grafana", false),
        row("33333333-3333-4333-8333-333333333333", "grafana", true),
        row("44444444-4444-4444-8444-444444444444", "old", false),
        row("55555555-5555-4555-8555-555555555555", "old", false),
    ];
    assert_eq!(
        resolve("11111111-1111-4111-8111-111111111111", &list)
            .unwrap()
            .name,
        "alertmanager"
    );
    assert_eq!(resolve("alertmanager", &list).unwrap().id, list[0].id);
    // Two namesakes, one active: the active one is meant.
    assert_eq!(resolve("grafana", &list).unwrap().id, list[2].id);
    // Two revoked namesakes: ambiguous, the remedy lists both ids.
    let err = resolve("old", &list).unwrap_err();
    assert_eq!(err.kind, Kind::Invalid);
    assert!(
        err.remedy.contains(&list[3].id) && err.remedy.contains(&list[4].id),
        "{err}"
    );
    // Unknown: not found, with the list command as the remedy.
    let err = resolve("nobody", &list).unwrap_err();
    assert_eq!(err.kind, Kind::NotFound);
    assert!(err.remedy.contains("chassis clients list"), "{err}");
    // Names match exactly, never by prefix or case.
    assert!(resolve("alert", &list).is_err());
    assert!(resolve("Alertmanager", &list).is_err());
}

// Drilled red once: the STATE column was renamed and the header assert failed.
#[test]
fn k30_the_table_aligns_columns_and_shortens_times() {
    let mut revoked = row("22222222-2222-4222-8222-222222222222", "grafana", false);
    revoked.last_used_at = Some("2026-09-06T22:01:00Z".to_string());
    revoked.uses = 42;
    let list = vec![
        row("11111111-1111-4111-8111-111111111111", "alertmanager", true),
        revoked,
    ];
    let t = table(&list);
    let lines: Vec<&str> = t.lines().collect();
    assert_eq!(lines.len(), 3, "{t}");
    assert!(lines[0].starts_with("ID"), "{t}");
    assert!(
        lines[0].contains("STATE") && lines[0].contains("LAST USED"),
        "{t}"
    );
    assert!(
        lines[1].contains("alertmanager  active   2026-09-06 21:35  never             0"),
        "{t}"
    );
    assert!(
        lines[2].contains("grafana       revoked  2026-09-06 21:35  2026-09-06 22:01  42"),
        "{t}"
    );
    // Every ID starts at the same column as the header's.
    let name_col = lines[0].find("NAME").unwrap();
    assert!(lines[1][name_col..].starts_with("alertmanager"), "{t}");
    assert!(lines[2][name_col..].starts_with("grafana"), "{t}");
    assert!(table(&[]).contains("no clients yet"));
    assert_eq!(short_time("garbage"), "garbage");
}

// Drilled red once: 401 was mapped to Dependency and the kind assert failed.
#[test]
fn k30_statuses_map_to_the_kits_kinds() {
    assert_eq!(kind_of(StatusCode::BAD_REQUEST), Kind::Invalid);
    assert_eq!(kind_of(StatusCode::UNAUTHORIZED), Kind::Unauthorized);
    assert_eq!(kind_of(StatusCode::NOT_FOUND), Kind::NotFound);
    assert_eq!(kind_of(StatusCode::TOO_MANY_REQUESTS), Kind::Overloaded);
    assert_eq!(kind_of(StatusCode::BAD_GATEWAY), Kind::Dependency);
}
