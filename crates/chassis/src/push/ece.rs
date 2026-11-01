//! Web Push message encryption: `aes128gcm` content coding (RFC 8188) with
//! the key agreement of RFC 8291. Pure: the only effects are the random
//! source behind [`encrypt`], and [`encrypt_with`] takes the shared secret
//! and the salt as arguments, so the RFC's own test vector runs byte for
//! byte (`ece_tests.rs`).
//!
//! One record, always: the push services guarantee a 4096-byte body, and a
//! notification payload is a few hundred bytes. The record size written in
//! the header is therefore 4096 and the padding delimiter is `0x02` (the
//! last record). No padding bytes are added; the payload is small enough
//! that its length is not a secret worth hiding.

use ring::aead::{AES_128_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::agreement::{ECDH_P256, EphemeralPrivateKey, UnparsedPublicKey, agree_ephemeral};
use ring::hkdf::{HKDF_SHA256, KeyType, Prk, Salt};
use ring::rand::{SecureRandom, SystemRandom};

use crate::core::error::Error;

/// The record size written into the header (RFC 8188 section 2.1).
pub const RECORD_SIZE: u32 = 4096;
/// Length of an uncompressed P-256 point: `0x04 || X || Y`.
pub const PUBLIC_KEY_LEN: usize = 65;
/// Length of the subscription's authentication secret.
pub const AUTH_LEN: usize = 16;
const SALT_LEN: usize = 16;
const TAG_LEN: usize = 16;
/// Header: salt, record size (4), key id length (1) and the key id, which
/// RFC 8291 sets to the sender's public key.
const HEADER_LEN: usize = SALT_LEN + 4 + 1 + PUBLIC_KEY_LEN;
/// A push service must accept 4096 bytes in all (RFC 8030 section 7.2), so
/// the plaintext leaves room for the header, the delimiter and the tag.
pub const MAX_PLAINTEXT: usize = RECORD_SIZE as usize - HEADER_LEN - TAG_LEN - 1;
const DELIMITER_LAST: u8 = 0x02;

/// HKDF output of a fixed length.
struct Len(usize);

impl KeyType for Len {
    fn len(&self) -> usize {
        self.0
    }
}

fn crypto_failure(what: &str) -> Error {
    Error::internal(
        format!("push encryption failed: {what}"),
        "report this to the project; the subscription itself is not the cause",
    )
}

/// `HKDF-Expand(prk, info, out.len())` into `out`.
fn expand(prk: &Prk, info: &[u8], out: &mut [u8]) -> Result<(), Error> {
    prk.expand(&[info], Len(out.len()))
        .and_then(|okm| okm.fill(out))
        .map_err(|_| crypto_failure("key derivation"))
}

/// Check the two things a subscription gives us before any maths.
pub fn check_receiver(ua_public: &[u8], auth: &[u8]) -> Result<(), Error> {
    if ua_public.len() != PUBLIC_KEY_LEN || ua_public[0] != 0x04 {
        return Err(Error::invalid(
            "the subscription's p256dh key is not an uncompressed P-256 point (65 bytes)",
            "send the keys exactly as PushSubscription.toJSON() gives them",
        ));
    }
    if auth.len() != AUTH_LEN {
        return Err(Error::invalid(
            "the subscription's auth secret is not 16 bytes",
            "send the keys exactly as PushSubscription.toJSON() gives them",
        ));
    }
    Ok(())
}

/// The input keying material of RFC 8291 section 3.4:
/// `HKDF(salt = auth, ikm = ecdh)` expanded with
/// `"WebPush: info" 0x00 || ua_public || as_public` to 32 bytes.
pub(super) fn derive_ikm(
    ecdh: &[u8],
    ua_public: &[u8],
    as_public: &[u8],
    auth: &[u8],
) -> Result<[u8; 32], Error> {
    let prk_key = Salt::new(HKDF_SHA256, auth).extract(ecdh);
    let mut info = Vec::with_capacity(14 + 2 * PUBLIC_KEY_LEN);
    info.extend_from_slice(b"WebPush: info\0");
    info.extend_from_slice(ua_public);
    info.extend_from_slice(as_public);
    let mut ikm = [0u8; 32];
    expand(&prk_key, &info, &mut ikm)?;
    Ok(ikm)
}

/// The content encryption key and nonce of RFC 8188 section 2.2 and 2.3.
pub(super) fn derive_content_keys(ikm: &[u8], salt: &[u8]) -> Result<([u8; 16], [u8; 12]), Error> {
    let prk = Salt::new(HKDF_SHA256, salt).extract(ikm);
    let mut cek = [0u8; 16];
    expand(&prk, b"Content-Encoding: aes128gcm\0", &mut cek)?;
    let mut nonce = [0u8; 12];
    expand(&prk, b"Content-Encoding: nonce\0", &mut nonce)?;
    Ok((cek, nonce))
}

/// Encrypt with the ECDH secret and salt given: header plus one record.
pub(super) fn encrypt_with(
    ecdh: &[u8],
    as_public: &[u8],
    ua_public: &[u8],
    auth: &[u8],
    salt: &[u8; SALT_LEN],
    plaintext: &[u8],
) -> Result<Vec<u8>, Error> {
    if plaintext.len() > MAX_PLAINTEXT {
        return Err(Error::invalid(
            format!(
                "the push payload is {} bytes; at most {MAX_PLAINTEXT} fit in one message",
                plaintext.len()
            ),
            "shorten the title or body, or leave out actions",
        ));
    }
    let ikm = derive_ikm(ecdh, ua_public, as_public, auth)?;
    let (cek, nonce) = derive_content_keys(&ikm, salt)?;
    let key = UnboundKey::new(&AES_128_GCM, &cek).map_err(|_| crypto_failure("the cipher key"))?;
    let mut record = Vec::with_capacity(plaintext.len() + 1 + TAG_LEN);
    record.extend_from_slice(plaintext);
    record.push(DELIMITER_LAST);
    LessSafeKey::new(key)
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce),
            Aad::empty(),
            &mut record,
        )
        .map_err(|_| crypto_failure("sealing the record"))?;
    let mut out = Vec::with_capacity(HEADER_LEN + record.len());
    out.extend_from_slice(salt);
    out.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    out.push(PUBLIC_KEY_LEN as u8);
    out.extend_from_slice(as_public);
    out.extend_from_slice(&record);
    Ok(out)
}

/// Encrypt `plaintext` for one subscription: a fresh ephemeral key pair and
/// a fresh salt per message, so no two messages share a key.
pub fn encrypt(ua_public: &[u8], auth: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, Error> {
    check_receiver(ua_public, auth)?;
    let rng = SystemRandom::new();
    let private = EphemeralPrivateKey::generate(&ECDH_P256, &rng)
        .map_err(|_| crypto_failure("generating the ephemeral key"))?;
    let as_public = private
        .compute_public_key()
        .map_err(|_| crypto_failure("computing the ephemeral public key"))?;
    let mut salt = [0u8; SALT_LEN];
    rng.fill(&mut salt)
        .map_err(|_| crypto_failure("the random source"))?;
    let peer = UnparsedPublicKey::new(&ECDH_P256, ua_public);
    let ecdh = agree_ephemeral(private, &peer, |secret| secret.to_vec()).map_err(|_| {
        Error::invalid(
            "the subscription's p256dh key is not a point on the P-256 curve",
            "the browser must subscribe again",
        )
    })?;
    encrypt_with(&ecdh, as_public.as_ref(), ua_public, auth, &salt, plaintext)
}

#[cfg(test)]
mod tests;
