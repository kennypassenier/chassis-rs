//! Unit tests for `passkeys`; kept in their own file so the module stays small.

use super::*;

#[test]
fn rename_trims_and_bounds_the_name_in_plain_language() {
    assert_eq!(clean_name("  Phone  ").unwrap(), "Phone");
    assert!(clean_name("   ").unwrap_err().message.contains("empty"));
    assert!(clean_name(&"x".repeat(64)).is_ok());
    let err = clean_name(&"x".repeat(65)).unwrap_err();
    assert!(err.message.contains("limit is 64"));
    assert!(clean_name(&"é".repeat(64)).is_ok(), "counted in characters");
}

#[test]
fn public_url_is_required_https_and_names_the_proxy() {
    let err = build_webauthn("inbox", "INBOX", None).unwrap_err();
    assert!(err.remedy.contains("INBOX_PUBLIC_URL"));
    let err = build_webauthn("inbox", "INBOX", Some("http://inbox.lan:8080")).unwrap_err();
    assert!(err.remedy.contains("Traefik"));
    let err = build_webauthn("inbox", "INBOX", Some("not a url")).unwrap_err();
    assert!(err.message.contains("not a URL"));
    assert!(build_webauthn("inbox", "INBOX", Some("https://inbox.example.lan")).is_ok());
}

#[tokio::test]
async fn registration_start_issues_a_challenge_and_finish_refuses_garbage() {
    let dir = tempfile::tempdir().unwrap();
    let webauthn = build_webauthn("t", "T", Some("https://t.example")).unwrap();
    let key = crate::core::crypto::Key::from_bytes([9u8; 32]);
    let file = EncryptedFile::new(
        dir.path().join("passkeys.json.enc"),
        key.clone(),
        "passkeys",
    );
    let auth = AuthState {
        name: "t",
        secrets: Some(
            crate::shell::auth::Secrets::parse(
                "T",
                Some("a-long-enough-login-token"),
                Some(&"ab".repeat(32)),
            )
            .unwrap()
            .unwrap(),
        ),
        clients: Arc::new(crate::shell::store::MemoryClientStore::default()),
        sessions: Arc::new(crate::shell::store::SessionStore::in_memory()),
        session_ttl_secs: 60,
        remember_me_secs: 60,
        guards: crate::shell::guards::Guards {
            max_in_flight: Arc::new(tokio::sync::Semaphore::new(1)),
            retry_after: Duration::from_secs(1),
            request_timeout: Duration::from_secs(1),
            timeout_exempt: Arc::new(Default::default()),
            trusted_proxies: Arc::new(vec![]),
            kit_problems: Arc::new(std::sync::Mutex::new(Vec::new())),
            untrusted_proxy_warned: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
    };
    let guards = auth.guards.clone();
    let state = PasskeyState::open(
        webauthn,
        auth,
        file,
        CeremonyLimits {
            cap: 64,
            ttl: CEREMONY_TTL,
            per_ip: 8,
        },
        guards,
    )
    .unwrap();
    let peer: SocketAddr = "127.0.0.1:1".parse().unwrap();
    let Json(start) = register_start(State(state.clone()), ConnectInfo(peer), HeaderMap::new())
        .await
        .unwrap();
    assert_eq!(start.ceremony.len(), 32);
    assert!(!start.options.public_key.challenge.is_empty());
    // Unknown ceremony id.
    let bad = serde_json::from_value::<RegisterPublicKeyCredential>(serde_json::json!({
        "id": "AAAA", "rawId": "AAAA", "type": "public-key",
        "response": {"attestationObject": "AAAA", "clientDataJSON": "AAAA"},
        "extensions": {}
    }))
    .unwrap();
    let err = register_finish(
        State(state.clone()),
        Json(RegisterFinish {
            ceremony: "nope".into(),
            label: "x".into(),
            credential: bad,
        }),
    )
    .await
    .unwrap_err();
    assert!(err.remedy.contains("start again"));
    // No passkeys yet → login start says so with a remedy.
    let err = login_start(State(state), ConnectInfo(peer), HeaderMap::new())
        .await
        .err()
        .expect("no passkeys yet is an error");
    assert!(err.remedy.contains("register one"));
    assert!(
        !dir.path().join("passkeys.json.enc").exists(),
        "no passkey was saved, so no store file may exist yet"
    );
}
