//! What the preferences API stores, refuses and limits.

use chassis::testing::TestApp;
use reqwest::Method;
use serde_json::json;

use crate::fixtures::{SERIAL, put, rows, start};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_preference_round_trips_through_the_kit_api_and_lands_in_the_app_database() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs1", &[]).await;
    let (app, db) = (&h.0, &h.1);
    let (s, body) = put(app, "homelab.log-levels", r#"["warn"]"#).await;
    assert_eq!(s, 200, "{body}");
    assert_eq!(
        put(app, "kp-remember:datatable:status:sort", "{}").await.0,
        200
    );
    // A key with a slash (kp-themes' unsaved bar) goes through the path.
    let (s, body) = put(app, "kp-unsaved%3A/settings%3Asettings", r#"{"port":"1"}"#).await;
    assert_eq!(s, 200, "{body}");
    assert_eq!(rows(db), 3);

    let (s, body) = app.get_json("/api/kit/prefs").await;
    assert_eq!(s, 200);
    assert_eq!(body["scope"], "admin");
    assert_eq!(body["keys"]["homelab.log-levels"], r#"["warn"]"#);
    assert_eq!(
        body["session"]["kp-unsaved:/settings:settings"], r#"{"port":"1"}"#,
        "a session key is served apart from the local ones"
    );
    assert!(body["keys"].get("kp-unsaved:/settings:settings").is_none());
    let (_, body) = app.get_json("/api/kit/prefs?prefix=kp-remember:").await;
    assert_eq!(body["keys"].as_object().unwrap().len(), 1);

    // Overwrite, then delete.
    put(app, "homelab.log-levels", r#"["error"]"#).await;
    let (_, body) = app.get_json("/api/kit/prefs?prefix=homelab.").await;
    assert_eq!(body["keys"]["homelab.log-levels"], r#"["error"]"#);
    let (s, body) = app.delete("/api/kit/prefs/homelab.log-levels").await;
    assert_eq!((s, &body["removed"]), (200, &json!(true)));
    assert_eq!(rows(db), 2);
    let (_, body) = app.delete("/api/kit/prefs/homelab.log-levels").await;
    assert_eq!(body["removed"], false);
    h.0.shutdown().await;
}

/// The scope is the login identity: the cookie session and the bearer token
/// of the one admin see the same preferences, from any device.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_scope_is_the_login_not_the_session() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs2", &[]).await;
    let app = &h.0;
    put(app, "homelab-toured", "1").await;
    let token = app.token().to_string();
    let (s, body) = TestApp::send_json(app.bearer(Method::GET, "/api/kit/prefs", &token)).await;
    assert_eq!(s, 200, "{body}");
    assert_eq!(body["scope"], "admin");
    assert_eq!(body["keys"]["homelab-toured"], "1");
    h.0.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_kit_refuses_what_it_was_not_told_to_sync_and_what_looks_like_a_secret() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs3", &[]).await;
    let app = &h.0;
    for (key, value) in [
        ("other", "1"),
        ("homelab.theme-light", "x"),
        ("theme", "dark"),
        ("homelab.api-token", "x"),
        ("homelab.control%01char", "x"),
        ("homelab.v", "-----BEGIN PRIVATE KEY-----"),
        ("homelab.v", "Bearer abcdefghijklmnopqrstuvwxyz0123"),
        ("kp-unsaved:/s:s", r#"{"password":"x"}"#),
    ] {
        let (s, body) = put(app, key, value).await;
        assert_eq!(s, 400, "{key}={value}: {body}");
    }
    // The service's own login token is never accepted as a value.
    let own = format!("x{}x", app.token());
    assert_eq!(put(app, "homelab.v", &own).await.0, 400);
    assert_eq!(
        h.1.read_blocking(|c| Ok(c
            .query_row("SELECT count(*) FROM chassis_prefs", [], |r| r
                .get::<_, i64>(0))?))
            .unwrap(),
        0
    );
    h.0.shutdown().await;
}

/// Percent-encode every byte but unreserved ones, the way
/// `encodeURIComponent` does for the whole key.
fn enc(key: &str) -> String {
    key.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Kenny, 2026-10-21: "elke app kan elke setting welke naam ook geven en het
/// moet werken". Any name that is not truly unusable stores, lists, reads
/// back and deletes, whole-key encoded or with raw slashes.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn any_key_name_works_and_values_are_opaque() {
    let _one = SERIAL.lock().await;
    let mut h = start("prefs13", &[]).await;
    let app = &h.0;
    let keys = [
        "homelab.a b",
        "homelab.slash/inside",
        "homelab./leading",
        "homelab.trailing/",
        "homelab.//double",
        "homelab.é ключ 名前",
        "homelab.100%/? #&=+;,",
        "homelab. ",
        "homelab...",
    ];
    for (i, key) in keys.iter().enumerate() {
        let value = if i % 2 == 0 {
            format!("{{\"n\":{i}}}")
        } else {
            format!("plain {i} \u{e9}")
        };
        let (s, body) = put(app, &enc(key), &value).await;
        assert_eq!(s, 200, "{key}: {body}");
    }
    let (_, body) = app.get_json("/api/kit/prefs").await;
    let got = body["keys"].as_object().unwrap();
    assert_eq!(got.len(), keys.len());
    for (i, key) in keys.iter().enumerate() {
        let want = if i % 2 == 0 {
            format!("{{\"n\":{i}}}")
        } else {
            format!("plain {i} \u{e9}")
        };
        assert_eq!(got[*key], want, "{key}");
    }
    // A prefix with odd characters lists its keys.
    let (_, body) = app
        .get_json(&format!("/api/kit/prefs?prefix={}", enc("homelab.slash/")))
        .await;
    assert_eq!(body["keys"].as_object().unwrap().len(), 1);
    // Raw slashes in the path find the same row.
    let (s, b) = app.delete("/api/kit/prefs/homelab.slash/inside").await;
    assert_eq!((s, &b["removed"]), (200, &json!(true)));
    let (s, b) = app
        .delete(&format!("/api/kit/prefs/{}", enc("homelab.a b")))
        .await;
    assert_eq!((s, &b["removed"]), (200, &json!(true)));
    // Only the truly unusable is refused.
    assert_eq!(put(app, &enc("homelab.\u{7}bell"), "x").await.0, 400);
    assert_eq!(
        put(app, &enc(&format!("homelab.{}", "k".repeat(300))), "x")
            .await
            .0,
        400
    );
    h.0.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_limits_hold_and_the_knobs_change_them() {
    let _one = SERIAL.lock().await;
    let mut h = start(
        "prefs4",
        &[
            ("PREFS4_PREFS_MAX_VALUE_BYTES", "20"),
            ("PREFS4_PREFS_MAX_SCOPE_BYTES", "60"),
            ("PREFS4_PREFS_MAX_KEYS", "5"),
        ],
    )
    .await;
    let app = &h.0;
    assert_eq!(
        put(app, "homelab.a", &"x".repeat(21)).await.0,
        400,
        "value limit"
    );
    assert_eq!(put(app, "homelab.a", &"x".repeat(20)).await.0, 200);
    assert_eq!(put(app, "homelab.b", &"x".repeat(20)).await.0, 200);
    let (s, body) = put(app, "homelab.c", &"x".repeat(20)).await;
    assert_eq!(s, 503, "scope total: {body}");
    assert!(body.to_string().contains("full"), "{body}");
    // Replacing a value inside the limit still works when full.
    assert_eq!(put(app, "homelab.a", "short").await.0, 200);
    h.0.shutdown().await;
}
