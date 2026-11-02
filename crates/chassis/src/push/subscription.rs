//! What a browser sends when it subscribes (`PushSubscription.toJSON()`),
//! and the checks it must pass before it is stored. Pure.

use serde::Deserialize;

use super::b64;
use super::ece::check_receiver;
use crate::core::error::Error;

/// A real endpoint is a few hundred bytes; this only stops abuse.
const MAX_ENDPOINT_BYTES: usize = 2048;

/// The body of `POST /api/kit/push/subscribe`.
#[derive(Debug, Deserialize)]
pub(crate) struct SubscribeBody {
    pub endpoint: String,
    pub keys: Keys,
}

/// The two secrets of the subscription, base64url as the browser gives them.
#[derive(Debug, Deserialize)]
pub(crate) struct Keys {
    pub p256dh: String,
    pub auth: String,
}

/// The body of `POST /api/kit/push/unsubscribe`.
#[derive(Debug, Deserialize)]
pub(crate) struct UnsubscribeBody {
    pub endpoint: String,
}

/// A subscription that passed the checks, in the form the store keeps.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Checked {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// An endpoint must be an `https` URL with a public host and no credentials: the
/// message body is encrypted, but the endpoint itself is a capability, and
/// a plain-text hop would leak it.
pub fn check_endpoint(endpoint: &str) -> Result<(), Error> {
    let refuse = |why: &str| {
        Error::invalid(
            format!("the push endpoint is refused: {why}"),
            "subscribe from a page served over https, with the endpoint exactly as the browser gave it",
        )
    };
    if endpoint.len() > MAX_ENDPOINT_BYTES {
        return Err(refuse("it is too long"));
    }
    let url = reqwest::Url::parse(endpoint).map_err(|_| refuse("it is not a URL"))?;
    if url.scheme() != "https" {
        return Err(refuse("only https endpoints are accepted"));
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err(refuse("it has no host"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(refuse("it carries credentials"));
    }
    if super::host::is_internal(&url) {
        return Err(refuse("it points into a local network"));
    }
    Ok(())
}

impl SubscribeBody {
    /// Check the endpoint and the two keys; the keys are decoded only to
    /// prove they are the right shape, and stored as the text they came as.
    pub fn check(self) -> Result<Checked, Error> {
        check_endpoint(&self.endpoint)?;
        let (Some(public), Some(auth)) =
            (b64::decode(&self.keys.p256dh), b64::decode(&self.keys.auth))
        else {
            return Err(Error::invalid(
                "the subscription's keys are not base64url",
                "send p256dh and auth exactly as PushSubscription.toJSON() gives them",
            ));
        };
        check_receiver(&public, &auth)?;
        Ok(Checked {
            endpoint: self.endpoint,
            p256dh: b64::encode(&public),
            auth: b64::encode(&auth),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const P256DH: &str =
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const AUTH: &str = "BTBZMqHH6r4Tts7J_aSIgg";

    fn body(endpoint: &str, p256dh: &str, auth: &str) -> SubscribeBody {
        SubscribeBody {
            endpoint: endpoint.into(),
            keys: Keys {
                p256dh: p256dh.into(),
                auth: auth.into(),
            },
        }
    }

    #[test]
    fn a_wellformed_https_subscription_passes() {
        let ok = body("https://push.example/send/1", P256DH, AUTH)
            .check()
            .unwrap();
        assert_eq!(ok.endpoint, "https://push.example/send/1");
        assert_eq!((ok.p256dh.as_str(), ok.auth.as_str()), (P256DH, AUTH));
        let padded = body("https://push.example/1", &format!("{P256DH}="), AUTH)
            .check()
            .unwrap();
        assert_eq!(
            padded.p256dh, P256DH,
            "stored in the canonical unpadded form"
        );
    }

    #[test]
    fn endpoints_that_are_not_plain_https_are_refused() {
        for bad in [
            "http://push.example/1",
            "ftp://push.example/1",
            "https://user:pw@push.example/1",
            "https://",
            "push.example/1",
            "",
        ] {
            assert!(check_endpoint(bad).is_err(), "{bad:?}");
        }
        let long = format!("https://push.example/{}", "a".repeat(MAX_ENDPOINT_BYTES));
        assert!(check_endpoint(&long).is_err());
    }

    #[test]
    fn endpoints_that_point_into_the_local_network_are_refused() {
        for bad in [
            "https://localhost/x",
            "https://LOCALHOST./x",
            "https://api.localhost/x",
            "https://nas/x",
            "https://127.0.0.1/x",
            "https://2130706433/x",
            "https://10.0.0.5:8443/x",
            "https://192.168.1.1/x",
            "https://172.16.0.1/x",
            "https://169.254.169.254/latest/meta-data",
            "https://100.64.0.1/x",
            "https://0.0.0.0/x",
            "https://[::1]/x",
            "https://[fe80::1]/x",
            "https://[fd00::1]/x",
            "https://[::ffff:10.0.0.1]/x",
        ] {
            assert!(check_endpoint(bad).is_err(), "{bad:?}");
        }
        for good in [
            "https://fcm.googleapis.com/fcm/send/abc",
            "https://updates.push.services.mozilla.com/wpush/v2/x",
            "https://8.8.8.8/x",
        ] {
            assert!(check_endpoint(good).is_ok(), "{good:?}");
        }
    }

    #[test]
    fn keys_of_the_wrong_shape_are_refused() {
        let e = "https://push.example/1";
        assert!(body(e, "not base64!", AUTH).check().is_err());
        assert!(body(e, &P256DH[..40], AUTH).check().is_err(), "short key");
        assert!(body(e, P256DH, &AUTH[..10]).check().is_err(), "short auth");
        assert!(body(e, P256DH, "").check().is_err());
    }
}
