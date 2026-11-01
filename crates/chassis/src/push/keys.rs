//! The application server's VAPID key pair (RFC 8292): one P-256 key per
//! app, made on the first start. This module is the pure side: making a key,
//! reading it back from PKCS#8 and signing with it. Where the secret is kept
//! (sealed in the kit file) is `mount.rs`'s business.

use std::sync::Arc;

use ring::rand::SystemRandom;
use ring::signature::{ECDSA_P256_SHA256_FIXED_SIGNING, EcdsaKeyPair, KeyPair};

use crate::core::error::Error;

/// A VAPID key pair ready to sign. Cheap to clone; the private part never
/// leaves it (no accessor, and `Debug` prints no key material).
#[derive(Clone)]
pub struct VapidKey {
    pair: Arc<EcdsaKeyPair>,
    public: Vec<u8>,
}

impl std::fmt::Debug for VapidKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("VapidKey(***)")
    }
}

/// A new key pair as PKCS#8 bytes: the form that is stored (sealed).
pub fn generate_pkcs8() -> Result<Vec<u8>, Error> {
    EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &SystemRandom::new())
        .map(|doc| doc.as_ref().to_vec())
        .map_err(|_| {
            Error::internal(
                "the VAPID key pair could not be generated",
                "the system's random source failed; check it and restart",
            )
        })
}

impl VapidKey {
    /// Read a key pair from the PKCS#8 bytes [`generate_pkcs8`] made.
    pub fn from_pkcs8(pkcs8: &[u8]) -> Result<Self, Error> {
        let pair = EcdsaKeyPair::from_pkcs8(
            &ECDSA_P256_SHA256_FIXED_SIGNING,
            pkcs8,
            &SystemRandom::new(),
        )
        .map_err(|_| {
            Error::config(
                "the stored VAPID key is not a valid P-256 key",
                "delete the `push_vapid_key` row of chassis_meta in the kit database to make a new key; every browser then subscribes again",
            )
        })?;
        let public = pair.public_key().as_ref().to_vec();
        Ok(VapidKey {
            pair: Arc::new(pair),
            public,
        })
    }

    /// The public key, uncompressed (65 bytes): what the browser subscribes
    /// with and what the `k=` parameter carries.
    pub fn public_key(&self) -> &[u8] {
        &self.public
    }

    /// An ECDSA signature, the fixed `r || s` form JWT's ES256 wants.
    pub(super) fn sign(&self, message: &[u8]) -> Result<Vec<u8>, Error> {
        self.pair
            .sign(&SystemRandom::new(), message)
            .map(|s| s.as_ref().to_vec())
            .map_err(|_| {
                Error::internal(
                    "the VAPID signature could not be made",
                    "the system's random source failed; check it and retry",
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_key_reads_back_with_the_same_public_key() {
        let pkcs8 = generate_pkcs8().unwrap();
        let a = VapidKey::from_pkcs8(&pkcs8).unwrap();
        let b = VapidKey::from_pkcs8(&pkcs8).unwrap();
        assert_eq!(a.public_key(), b.public_key());
        assert_eq!(a.public_key().len(), 65);
        assert_eq!(a.public_key()[0], 0x04);
        assert_ne!(
            VapidKey::from_pkcs8(&generate_pkcs8().unwrap())
                .unwrap()
                .public_key(),
            a.public_key()
        );
    }

    #[test]
    fn garbage_is_refused_and_debug_shows_no_key() {
        assert!(VapidKey::from_pkcs8(b"not a key").is_err());
        let key = VapidKey::from_pkcs8(&generate_pkcs8().unwrap()).unwrap();
        assert_eq!(format!("{key:?}"), "VapidKey(***)");
    }
}
