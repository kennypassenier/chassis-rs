//! Delivery against a fake push service on 127.0.0.1: the headers it gets,
//! the body decrypted with the browser's private key (proof of the whole
//! round trip), and what each kind of answer does to the subscription.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use ring::aead::{AES_128_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::agreement::{ECDH_P256, EphemeralPrivateKey, UnparsedPublicKey, agree_ephemeral};
use ring::rand::SystemRandom;
use ring::signature::{ECDSA_P256_SHA256_FIXED, UnparsedPublicKey as SigKey};

use super::config::PushKnobs;
use super::keys::{VapidKey, generate_pkcs8};
use super::message::{Push, Urgency};
use super::sender::Sender;
use super::{b64, ece};
use crate::storage::push_store::PushStore;

/// A browser: the private half of its subscription key and its auth secret.
struct Browser {
    private: Option<EphemeralPrivateKey>,
    public: Vec<u8>,
    auth: [u8; 16],
}

/// (path name, request headers, decrypted payload when it was accepted)
type Seen = (String, HeaderMap, Option<Vec<u8>>);

#[derive(Default)]
struct Fake {
    browsers: Mutex<HashMap<String, Browser>>,
    seen: Mutex<Vec<Seen>>,
    inflight: AtomicUsize,
    peak: AtomicUsize,
}

fn decrypt(body: &[u8], b: &mut Browser) -> Vec<u8> {
    assert_eq!(&body[16..20], &4096u32.to_be_bytes(), "record size");
    let id_len = body[20] as usize;
    let as_public = &body[21..21 + id_len];
    let ecdh = agree_ephemeral(
        b.private.take().expect("one message per browser key"),
        &UnparsedPublicKey::new(&ECDH_P256, as_public),
        |s| s.to_vec(),
    )
    .unwrap();
    let ikm = ece::derive_ikm(&ecdh, &b.public, as_public, &b.auth).unwrap();
    let (cek, nonce) = ece::derive_content_keys(&ikm, &body[..16]).unwrap();
    let key = LessSafeKey::new(UnboundKey::new(&AES_128_GCM, &cek).unwrap());
    let mut record = body[21 + id_len..].to_vec();
    let plain = key
        .open_in_place(
            Nonce::assume_unique_for_key(nonce),
            Aad::empty(),
            &mut record,
        )
        .unwrap();
    assert_eq!(plain.last(), Some(&0x02), "the last-record delimiter");
    plain[..plain.len() - 1].to_vec()
}

async fn handler(
    State(f): State<Arc<Fake>>,
    Path(name): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let now = f.inflight.fetch_add(1, Ordering::SeqCst) + 1;
    f.peak.fetch_max(now, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(60)).await;
    f.inflight.fetch_sub(1, Ordering::SeqCst);
    let status = match name.as_str() {
        "gone" => StatusCode::GONE,
        "missing" => StatusCode::NOT_FOUND,
        "boom" => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::CREATED,
    };
    let plain = (status == StatusCode::CREATED).then(|| {
        let mut browsers = f.browsers.lock().unwrap();
        decrypt(&body, browsers.get_mut(&name).expect("a known browser"))
    });
    f.seen.lock().unwrap().push((name, headers, plain));
    status
}

async fn serve(fake: Arc<Fake>) -> SocketAddr {
    let app = Router::new()
        .route("/{name}", post(handler))
        .with_state(fake);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await });
    addr
}

struct Rig {
    sender: Sender,
    store: PushStore,
    fake: Arc<Fake>,
    addr: SocketAddr,
    vapid: VapidKey,
    _dir: tempfile::TempDir,
}

async fn rig(concurrency: usize, subject: Option<&str>) -> Rig {
    let dir = tempfile::tempdir().unwrap();
    let db = crate::storage::Db::open(
        &dir.path().join("svc-kit.db"),
        &crate::storage::kit_migrations(),
    )
    .unwrap();
    let store = PushStore::new(db, 50);
    let vapid = VapidKey::from_pkcs8(&generate_pkcs8().unwrap()).unwrap();
    let knobs = PushKnobs {
        subject: subject.map(str::to_string),
        ttl: Duration::from_secs(3600),
        timeout: Duration::from_secs(2),
        max_subscriptions: 50,
        concurrency,
    };
    let fake = Arc::new(Fake::default());
    let addr = serve(fake.clone()).await;
    let sender = Sender::new(store.clone(), vapid.clone(), knobs).unwrap();
    Rig {
        sender,
        store,
        fake,
        addr,
        vapid,
        _dir: dir,
    }
}

impl Rig {
    /// Subscribe a new browser whose push service path is `name`.
    fn subscribe(&self, name: &str) {
        let rng = SystemRandom::new();
        let private = EphemeralPrivateKey::generate(&ECDH_P256, &rng).unwrap();
        let public = private.compute_public_key().unwrap().as_ref().to_vec();
        let auth = [9u8; 16];
        self.store
            .upsert(
                &format!("http://{}/{name}", self.addr),
                &b64::encode(&public),
                &b64::encode(&auth),
                1,
            )
            .unwrap();
        let browser = Browser {
            private: Some(private),
            public,
            auth,
        };
        self.fake
            .browsers
            .lock()
            .unwrap()
            .insert(name.to_string(), browser);
    }
}

fn water() -> Push {
    Push::new("Water drinken")
        .body("Het is tijd")
        .url("/habits/water")
        .tag("water")
        .action("done", "Gedaan", "/api/habits/water/done")
        .urgency(Urgency::High)
}

#[tokio::test]
async fn a_message_reaches_the_push_service_encrypted_signed_and_decryptable() {
    let rig = rig(4, Some("mailto:ops@example.org")).await;
    rig.subscribe("ok");
    let report = rig.sender.send(&water()).await.unwrap();
    assert_eq!((report.accepted, report.removed, report.failed), (1, 0, 0));
    let seen = rig.fake.seen.lock().unwrap();
    let (_, headers, plain) = &seen[0];
    assert_eq!(headers["content-encoding"], "aes128gcm");
    assert_eq!(headers["ttl"], "3600");
    assert_eq!(headers["urgency"], "high");
    assert_eq!(
        plain.as_deref(),
        Some(water().payload().unwrap().as_slice())
    );
    let auth = headers["authorization"].to_str().unwrap();
    let (jwt, k) = auth
        .strip_prefix("vapid t=")
        .unwrap()
        .split_once(", k=")
        .unwrap();
    assert_eq!(b64::decode(k).unwrap(), rig.vapid.public_key());
    let parts: Vec<&str> = jwt.split('.').collect();
    let claims: serde_json::Value =
        serde_json::from_slice(&b64::decode(parts[1]).unwrap()).unwrap();
    assert_eq!(claims["aud"], format!("http://{}", rig.addr));
    assert_eq!(claims["sub"], "mailto:ops@example.org");
    SigKey::new(&ECDSA_P256_SHA256_FIXED, rig.vapid.public_key())
        .verify(
            format!("{}.{}", parts[0], parts[1]).as_bytes(),
            &b64::decode(parts[2]).unwrap(),
        )
        .expect("the live signature verifies");
    assert!(rig.store.all().unwrap()[0].last_success_at.is_some());
}

#[tokio::test]
async fn gone_subscriptions_are_removed_and_other_failures_are_kept_and_counted() {
    let rig = rig(4, Some("mailto:ops@example.org")).await;
    for name in ["ok", "gone", "missing", "boom"] {
        rig.subscribe(name);
    }
    let report = rig.sender.send(&Push::new("x")).await.unwrap();
    assert_eq!((report.accepted, report.removed, report.failed), (1, 2, 1));
    assert_eq!(
        report.last_error.as_deref(),
        Some("the push service answered HTTP 500")
    );
    let left: Vec<_> = rig.store.all().unwrap();
    assert_eq!(left.len(), 2, "410 and 404 were deleted");
    let boom = left.iter().find(|s| s.endpoint.ends_with("/boom")).unwrap();
    assert_eq!(
        boom.last_error.as_deref(),
        Some("the push service answered HTTP 500")
    );
    assert!(
        !boom.last_error.as_deref().unwrap().contains("127.0.0.1"),
        "no endpoint on disk"
    );
}

#[tokio::test]
async fn an_unreachable_service_is_a_counted_failure_not_a_panic() {
    let rig = rig(4, Some("mailto:ops@example.org")).await;
    let dead = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = dead.local_addr().unwrap().port();
    drop(dead);
    rig.store
        .upsert(
            &format!("http://127.0.0.1:{port}/x"),
            &b64::encode(&[4u8; 65]),
            &b64::encode(&[1u8; 16]),
            1,
        )
        .unwrap();
    // The stored key is not a real point, so encryption fails first: also a counted failure.
    let report = rig.sender.send(&Push::new("x")).await.unwrap();
    assert_eq!((report.accepted, report.failed), (0, 1));
    assert!(report.last_error.is_some());
}

#[tokio::test]
async fn at_most_the_configured_number_of_requests_are_in_flight() {
    let rig = rig(2, Some("mailto:ops@example.org")).await;
    for i in 0..6 {
        rig.subscribe(&format!("ok{i}"));
    }
    let report = rig.sender.send(&Push::new("x")).await.unwrap();
    assert_eq!(report.accepted, 6);
    let peak = rig.fake.peak.load(Ordering::SeqCst);
    assert!((1..=2).contains(&peak), "peak {peak}");
}

#[tokio::test]
async fn without_a_subject_or_with_an_invalid_notification_nothing_is_attempted() {
    let rig = rig(4, None).await;
    rig.subscribe("ok");
    let err = rig.sender.send(&Push::new("x")).await.unwrap_err();
    assert!(err.remedy.contains("push_subject"), "{}", err.remedy);
    let rig = self::rig(4, Some("mailto:ops@example.org")).await;
    rig.subscribe("ok");
    assert!(rig.sender.send(&Push::new("")).await.is_err());
    assert!(rig.fake.seen.lock().unwrap().is_empty());
}

#[tokio::test]
async fn the_handle_says_why_when_the_service_has_not_started() {
    let handle = super::PushHandle::default();
    assert!(!handle.is_ready());
    let err = handle.send(Push::new("x")).await.unwrap_err();
    assert!(err.message.contains("not available"), "{}", err.message);
}
