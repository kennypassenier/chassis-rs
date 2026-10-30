//! The preview token: a signed, expiring statement of what a preview
//! counted, which a delete must present. Its own module because it is the
//! one piece of cryptography in the Storage page and is easiest to audit
//! apart from the delete that consumes it.

use super::{AppDb, TOKEN_TTL_SECS, TokenBody};
use crate::core::error::Error;
use crate::storage::kinds::Now;

impl AppDb {
    pub(super) fn sign(&self, body: &TokenBody) -> String {
        let payload = serde_json::to_vec(body).expect("token serialises");
        let b64 = hex::encode(&payload);
        let mac =
            crate::core::crypto::sha256_hex(format!("{}.{b64}", self.shared.secret).as_bytes());
        format!("{b64}.{mac}")
    }

    pub(super) fn verify(&self, token: &str, now: &Now) -> Result<TokenBody, Error> {
        let bad = || {
            Error::invalid(
                "the preview token is not valid",
                "preview the selection again; a token does not survive a restart",
            )
        };
        let (b64, mac) = token.split_once('.').ok_or_else(bad)?;
        let want =
            crate::core::crypto::sha256_hex(format!("{}.{b64}", self.shared.secret).as_bytes());
        if !crate::core::crypto::ct_eq(want.as_bytes(), mac.as_bytes()) {
            return Err(bad());
        }
        let payload = hex::decode(b64).map_err(|_| bad())?;
        let body: TokenBody = serde_json::from_slice(&payload).map_err(|_| bad())?;
        if now.secs - body.issued > TOKEN_TTL_SECS || body.issued - now.secs > 60 {
            return Err(Error::invalid(
                "the preview is older than 15 minutes",
                "preview the selection again",
            ));
        }
        Ok(body)
    }
}
