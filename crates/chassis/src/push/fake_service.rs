//! A fake push service for the delivery tests: an axum server on 127.0.0.1
//! that answers by the first path segment (`gone` 410, `missing` 404, `boom`
//! 500, anything else 201), records every request and decrypts accepted
//! bodies with the private key of the browser it stands for.

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

use super::ece;

/// A browser: the private half of its subscription key and its auth secret.
pub(super) struct Browser {
    pub(super) private: Option<EphemeralPrivateKey>,
    pub(super) public: Vec<u8>,
    pub(super) auth: [u8; 16],
}

/// (path name, request headers, decrypted payload when it was accepted)
pub(super) type Seen = (String, HeaderMap, Option<Vec<u8>>);

#[derive(Default)]
pub(super) struct Fake {
    pub(super) browsers: Mutex<HashMap<String, Browser>>,
    pub(super) seen: Mutex<Vec<Seen>>,
    pub(super) inflight: AtomicUsize,
    pub(super) peak: AtomicUsize,
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

pub(super) async fn serve(fake: Arc<Fake>) -> SocketAddr {
    let app = Router::new()
        .route("/{name}", post(handler))
        .with_state(fake);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await });
    addr
}
