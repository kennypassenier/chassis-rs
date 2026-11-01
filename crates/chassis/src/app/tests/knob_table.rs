//! Tests of the knob table (K31, K36): every knob listed once, documented,
//! filtered by feature.

use super::*;

/// Every feature a knob can name; `core` knobs carry `None`.
const ALL_FEATURES: [&str; 6] = [
    "dashboard",
    "passkeys",
    "self-update",
    "notify",
    "storage",
    "push",
];

/// K31: the table has one row per knob, in `knobs()` order, and the
/// two secrets show `(secret)` where a default would be — never a
/// value, never a flag. Drilled red once by adding a duplicate row.
#[test]
fn k31_knob_table_lists_every_knob_once_and_no_secret_default() {
    let spec = spec();
    // The shape assertions want every row, so they ask for every
    // feature; the filtering itself is K36's own test below.
    let table = spec.knobs_markdown_for(&ALL_FEATURES);
    let rows: Vec<&str> = table
        .lines()
        .skip(2)
        .filter(|l| l.starts_with('|'))
        .collect();
    let knobs = spec.knobs();
    assert_eq!(rows.len(), knobs.len(), "one row per knob:\n{table}");
    for (row, knob) in rows.iter().zip(&knobs) {
        let cells: Vec<&str> = row.split('|').map(str::trim).collect();
        assert_eq!(cells[1], format!("`{}`", knob.key), "order follows knobs()");
        assert_eq!(cells[2], format!("`{}`", knob.env_name("T_APP")));
        if knob.secret {
            assert_eq!(cells[3], "—", "a secret has no flag: {row}");
            assert_eq!(cells[4], "(secret)", "{row}");
        } else {
            assert_eq!(cells[3], format!("`{}`", knob.flag_name()));
        }
        assert_eq!(cells[5], knob.feature.unwrap_or("core"));
        assert_eq!(cells[6], knob.doc);
    }
    for key in spec.knob_keys() {
        assert_eq!(
            table.matches(&format!("| `{key}` |")).count(),
            1,
            "{key} appears exactly once"
        );
    }
    assert!(table.contains("| `T_APP_LISTEN` |"), "{table}");
    assert!(table.contains("| self-update |") && table.contains("| notify |"));
}

/// K31: every knob carries a meaning — a whole sentence, so the table
/// never shows an empty cell or a fragment. Drilled red once by
/// blanking one doc.
/// K36: the document names what the binary can actually be told.
/// Drilled red by dropping the filter from `knobs_markdown_for`: the
/// core-only table then carried `T_APP_TOKEN` and the assertion fired.
#[test]
fn k36_the_knob_table_lists_only_the_features_it_is_asked_for() {
    let spec = spec();
    let core_only = spec.knobs_markdown_for(&["core"]);
    assert!(
        core_only.contains("| `T_APP_LISTEN` |"),
        "a core knob is always listed:\n{core_only}"
    );
    for absent in ["T_APP_TOKEN", "T_APP_SESSION_TTL_SECS", "T_APP_PUBLIC_URL"] {
        assert!(
            !core_only.contains(&format!("| `{absent}` |")),
            "{absent} belongs to a feature this binary does not have:\n{core_only}"
        );
    }
    let with_dashboard = spec.knobs_markdown_for(&["core", "dashboard"]);
    assert!(
        with_dashboard.contains("| `T_APP_TOKEN` |"),
        "a dashboard knob is listed once the dashboard is asked for:\n{with_dashboard}"
    );
    assert!(
        !with_dashboard.contains("| `T_APP_PUBLIC_URL` |"),
        "passkeys is a feature of its own:\n{with_dashboard}"
    );
}

/// K36: the filter is on the DOCUMENT only. A knob of a feature the
/// binary lacks stays parseable, which is what `docs/KIT.md` promises
/// ("accepted and ignored") and what a project's own config parser
/// strips with `knob_keys`. Drilled red by filtering `knobs()` itself.
#[test]
fn k36_filtering_the_table_leaves_the_parsed_knob_keys_whole() {
    let spec = spec();
    for key in ["token", "session_ttl_secs", "public_url"] {
        assert!(
            spec.knob_keys().contains(&key),
            "{key} stays a key the kit owns whatever the binary was built with"
        );
    }
}

/// K36: `--knobs` answers for the binary that prints it, so the
/// unparameterised table is the compiled feature set's.
#[test]
fn k36_knobs_markdown_is_the_table_of_the_compiled_features() {
    let spec = spec();
    assert_eq!(
        spec.knobs_markdown(),
        spec.knobs_markdown_for(compiled_features()),
        "--knobs describes this binary"
    );
    assert!(
        compiled_features().contains(&"core"),
        "core is always compiled in"
    );
}

#[test]
fn k31_every_knob_has_a_doc_sentence() {
    for k in spec().knobs() {
        assert!(
            k.doc.split_whitespace().count() >= 3 && k.doc.ends_with('.'),
            "{}: doc must be a sentence ending in a period, got {:?}",
            k.key,
            k.doc
        );
        assert!(
            !k.doc.contains('|') && !k.doc.contains('\n'),
            "{}: a pipe or newline would break the Markdown row",
            k.key
        );
        if let Some(f) = k.feature {
            assert!(
                matches!(
                    f,
                    "dashboard" | "passkeys" | "self-update" | "notify" | "storage" | "push"
                ),
                "{}: unknown feature {f}",
                k.key
            );
        }
    }
}
