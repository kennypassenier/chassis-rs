//! VAPID (RFC 8292): the signed token that tells a push service which
//! application server is sending. An ES256 JWT whose audience is the push
//! service's origin, valid for at most 24 hours, carried in
//! `Authorization: vapid t=<jwt>, k=<public key>`.

use super::b64;
use super::keys::VapidKey;
use crate::core::error::Error;

/// How long a token lives. The RFC allows 24 hours at most; half of that
/// leaves room for clock differences with the push service.
pub const TOKEN_LIFETIME_SECS: u64 = 12 * 60 * 60;
const JWT_HEADER: &str = r#"{"typ":"JWT","alg":"ES256"}"#;

/// The origin (`https://host[:port]`) of a push endpoint: the JWT audience.
pub fn audience(endpoint: &str) -> Result<String, Error> {
    let url = reqwest::Url::parse(endpoint).map_err(|e| {
        Error::invalid(
            format!("the push endpoint is not a URL: {e}"),
            "send the endpoint exactly as PushSubscription.toJSON() gives it",
        )
    })?;
    Ok(url.origin().ascii_serialization())
}

/// The subject claim must be a `mailto:` or `https:` URI (RFC 8292
/// section 2.1); Apple's service refuses a token without a usable one.
pub fn check_subject(subject: &str) -> Result<(), Error> {
    let ok = subject
        .strip_prefix("mailto:")
        .is_some_and(|m| m.contains('@'))
        || subject
            .strip_prefix("https://")
            .is_some_and(|h| !h.is_empty());
    if ok {
        Ok(())
    } else {
        Err(Error::config(
            format!("push_subject `{subject}` is neither a mailto: address nor an https: URL"),
            "set push_subject to something like mailto:you@example.org",
        ))
    }
}

/// The compact JWT for `aud`, valid until `exp` (epoch seconds).
pub fn jwt(key: &VapidKey, aud: &str, subject: &str, exp: u64) -> Result<String, Error> {
    let claims = serde_json::json!({ "aud": aud, "exp": exp, "sub": subject });
    let signing_input = format!(
        "{}.{}",
        b64::encode(JWT_HEADER.as_bytes()),
        b64::encode(claims.to_string().as_bytes())
    );
    let signature = key.sign(signing_input.as_bytes())?;
    Ok(format!("{signing_input}.{}", b64::encode(&signature)))
}

/// The `Authorization` header value for a request to `endpoint` at `now`.
pub fn authorization(
    key: &VapidKey,
    endpoint: &str,
    subject: &str,
    now: u64,
) -> Result<String, Error> {
    let token = jwt(
        key,
        &audience(endpoint)?,
        subject,
        now + TOKEN_LIFETIME_SECS,
    )?;
    Ok(format!(
        "vapid t={token}, k={}",
        b64::encode(key.public_key())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::push::keys::generate_pkcs8;
    use ring::signature::{ECDSA_P256_SHA256_FIXED, UnparsedPublicKey};

    fn key() -> VapidKey {
        VapidKey::from_pkcs8(&generate_pkcs8().unwrap()).unwrap()
    }

    #[test]
    fn the_audience_is_the_origin_of_the_endpoint() {
        let a = |e| audience(e).unwrap();
        assert_eq!(
            a("https://fcm.googleapis.com/fcm/send/abc"),
            "https://fcm.googleapis.com"
        );
        assert_eq!(
            a("https://push.example:8443/x?y=1"),
            "https://push.example:8443"
        );
        assert_eq!(a("https://push.example:443/x"), "https://push.example");
        assert!(audience("not a url").is_err());
    }

    #[test]
    fn the_subject_must_be_a_mailto_or_https_uri() {
        assert!(check_subject("mailto:kenny@example.org").is_ok());
        assert!(check_subject("https://habits.example").is_ok());
        for bad in [
            "",
            "kenny@example.org",
            "mailto:nobody",
            "http://x.example",
            "https://",
        ] {
            assert!(check_subject(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn the_token_carries_the_right_claims_and_its_signature_verifies() {
        let key = key();
        let header =
            authorization(&key, "https://push.example/send/1", "mailto:a@b.c", 1_000).unwrap();
        let (t, k) = header
            .strip_prefix("vapid t=")
            .and_then(|r| r.split_once(", k="))
            .expect("the documented header shape");
        assert_eq!(b64::decode(k).unwrap(), key.public_key());
        let parts: Vec<&str> = t.split('.').collect();
        assert_eq!(parts.len(), 3);
        let json = |i: usize| -> serde_json::Value {
            serde_json::from_slice(&b64::decode(parts[i]).unwrap()).unwrap()
        };
        assert_eq!(json(0), serde_json::json!({"typ": "JWT", "alg": "ES256"}));
        let claims = json(1);
        assert_eq!(claims["aud"], "https://push.example");
        assert_eq!(claims["sub"], "mailto:a@b.c");
        let exp = claims["exp"].as_u64().unwrap();
        assert_eq!(exp, 1_000 + TOKEN_LIFETIME_SECS);
        assert!(exp - 1_000 <= 24 * 3600, "RFC 8292: at most 24 hours");
        let signature = b64::decode(parts[2]).unwrap();
        assert_eq!(signature.len(), 64, "r || s, as JWT wants");
        let signed = format!("{}.{}", parts[0], parts[1]);
        UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, key.public_key())
            .verify(signed.as_bytes(), &signature)
            .expect("the signature verifies against the public key");
        let other = self::key();
        assert!(
            UnparsedPublicKey::new(&ECDSA_P256_SHA256_FIXED, other.public_key())
                .verify(signed.as_bytes(), &signature)
                .is_err(),
            "and against no other key"
        );
    }
}
