//! Field-by-field sealing of the kit database's secrets, with the same
//! crypto and key as the old sealed JSON files. Its own module because
//! every table that holds a secret goes through these two functions.

use crate::core::crypto::{Key, NONCE_LEN, Sealed, open, seal};
use crate::core::error::Error;

pub(super) fn seal_text(key: &Key, plain: &[u8]) -> Result<String, Error> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce)
        .map_err(|e| Error::internal(format!("random nonce: {e}"), "report this"))?;
    let sealed = seal(key, &nonce, plain)?;
    serde_json::to_string(&sealed)
        .map_err(|e| Error::internal(format!("serialise: {e}"), "report this"))
}

pub(super) fn open_text(key: &Key, text: &str, what: &str) -> Result<Vec<u8>, Error> {
    let sealed: Sealed = serde_json::from_str(text).map_err(|e| {
        Error::config(
            format!("a sealed field of {what} in the kit database is not an envelope: {e}"),
            "the kit database is corrupt; restore it from the last backup or pre-update copy",
        )
    })?;
    open(key, &sealed, what)
}
