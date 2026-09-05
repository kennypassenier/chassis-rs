//! The cryptographic primitives behind the encrypted stores and the
//! token checks (AR5, AR6), as pure functions.
//!
//! - **Key:** `<PREFIX>_SECRET_KEY`, 64 hex characters = 32 bytes. Parsing
//!   fails closed with a remedy that contains a freshly generated valid
//!   value, so the operator can paste rather than invent.
//! - **Sealing:** XChaCha20-Poly1305 with a 24-byte nonce the caller
//!   supplies (random, from the shell), so this module never touches a
//!   random source and every path is testable with fixed bytes.
//! - **Comparison:** constant-time, so a token check leaks nothing about
//!   how many leading bytes matched.
//! - **Hashing:** SHA-256 for session ids (critic #11: a sessions file
//!   holds hashes, so it is worthless without the id itself).
//!
//! Contract values (standing rule 27 exception): the nonce size and the
//! sealed-envelope version byte are pinned; changing either invalidates
//! every store on disk.

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::core::error::Error;

/// XChaCha20-Poly1305 nonce size. Pinned: it is part of the on-disk format.
pub const NONCE_LEN: usize = 24;
/// Envelope format version. Pinned: bump only with a migration.
pub const ENVELOPE_VERSION: u8 = 1;

/// A parsed 32-byte key.
#[derive(Clone)]
pub struct Key([u8; 32]);

impl std::fmt::Debug for Key {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Key(***)")
    }
}

impl Key {
    /// Parse 64 hex characters. `candidate` is a freshly generated valid
    /// value the caller obtained from the shell's random source; it goes
    /// into the remedy so the fix is a paste (K8), and never into a log.
    pub fn parse_hex(env_name: &str, raw: &str, candidate_hex: &str) -> Result<Key, Error> {
        let bytes = hex::decode(raw.trim()).map_err(|_| {
            Error::config(
                format!("{env_name} is not hexadecimal"),
                format!("set {env_name} to 64 hex characters, e.g. {candidate_hex}"),
            )
        })?;
        let arr: [u8; 32] = bytes.try_into().map_err(|_| {
            Error::config(
                format!("{env_name} must be exactly 32 bytes (64 hex characters)"),
                format!("set {env_name} to 64 hex characters, e.g. {candidate_hex}"),
            )
        })?;
        Ok(Key(arr))
    }

    pub fn from_bytes(bytes: [u8; 32]) -> Key {
        Key(bytes)
    }
}

/// What a sealed store looks like on disk, before JSON encoding.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Sealed {
    pub v: u8,
    pub nonce: String,
    pub ciphertext: String,
}

/// Encrypt `plaintext` under `key` with the caller's `nonce`.
pub fn seal(key: &Key, nonce: &[u8; NONCE_LEN], plaintext: &[u8]) -> Result<Sealed, Error> {
    let cipher = XChaCha20Poly1305::new((&key.0).into());
    let ct = cipher
        .encrypt(XNonce::from_slice(nonce), plaintext)
        .map_err(|_| {
            Error::internal("encryption failed", "report this; it should be impossible")
        })?;
    Ok(Sealed {
        v: ENVELOPE_VERSION,
        nonce: hex::encode(nonce),
        ciphertext: hex::encode(ct),
    })
}

/// Decrypt. A wrong key, a tampered file or a foreign format all end here
/// with a remedy that names the two ways this happens in practice.
pub fn open(key: &Key, sealed: &Sealed, what: &str) -> Result<Vec<u8>, Error> {
    if sealed.v != ENVELOPE_VERSION {
        return Err(Error::config(
            format!(
                "{what} has envelope version {} but this build reads {}",
                sealed.v, ENVELOPE_VERSION
            ),
            "this file was written by a newer or older chassis; restore the pre-update copy or upgrade",
        ));
    }
    let nonce = hex::decode(&sealed.nonce).map_err(|_| corrupt(what))?;
    let ct = hex::decode(&sealed.ciphertext).map_err(|_| corrupt(what))?;
    if nonce.len() != NONCE_LEN {
        return Err(corrupt(what));
    }
    let cipher = XChaCha20Poly1305::new((&key.0).into());
    cipher.decrypt(XNonce::from_slice(&nonce), ct.as_ref()).map_err(|_| {
        Error::config(
            format!("{what} cannot be decrypted with the current secret key"),
            "either the SECRET_KEY changed (rotate with `<binary> rekey`: export the previous key as <PREFIX>_OLD_SECRET_KEY and the new one as <PREFIX>_SECRET_KEY) or the file was tampered with; restore it from backup",
        )
    })
}

fn corrupt(what: &str) -> Error {
    Error::config(
        format!("{what} is not a valid sealed store"),
        "the file is corrupt; restore it from the last backup or pre-update copy",
    )
}

/// Constant-time equality for tokens and secrets.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.ct_eq(b).into()
}

/// SHA-256 as lowercase hex; used for session ids at rest.
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> Key {
        Key::from_bytes([7u8; 32])
    }

    #[test]
    fn parse_hex_refuses_bad_input_with_a_pasteable_remedy() {
        let cand = "ab".repeat(32);
        let err = Key::parse_hex("INBOX_SECRET_KEY", "not-hex", &cand).unwrap_err();
        assert!(err.remedy.contains(&cand));
        let err = Key::parse_hex("INBOX_SECRET_KEY", "abcd", &cand).unwrap_err();
        assert!(err.message.contains("32 bytes"));
        assert!(Key::parse_hex("X", &cand, &cand).is_ok());
    }

    #[test]
    fn seal_and_open_round_trip_and_wrong_key_fails_with_remedy() {
        let nonce = [1u8; NONCE_LEN];
        let sealed = seal(&key(), &nonce, b"clients v1").unwrap();
        assert_eq!(sealed.v, ENVELOPE_VERSION);
        assert_eq!(open(&key(), &sealed, "clients").unwrap(), b"clients v1");
        let err = open(&Key::from_bytes([8u8; 32]), &sealed, "clients").unwrap_err();
        assert!(err.remedy.contains("rekey"), "{}", err.remedy);
    }

    #[test]
    fn tampering_and_foreign_versions_are_named() {
        let nonce = [2u8; NONCE_LEN];
        let mut sealed = seal(&key(), &nonce, b"x").unwrap();
        sealed.ciphertext.replace_range(0..2, "ff");
        assert!(open(&key(), &sealed, "s").is_err());
        let mut newer = seal(&key(), &nonce, b"x").unwrap();
        newer.v = 9;
        let err = open(&key(), &newer, "sessions").unwrap_err();
        assert!(err.message.contains("envelope version 9"));
    }

    #[test]
    fn constant_time_eq_and_sha256() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"abcd"));
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
