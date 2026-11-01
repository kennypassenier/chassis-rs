//! One request to one push service (RFC 8030): the headers, and what each
//! answer means. Transport only; the encryption and the signature are made
//! by the caller.

use std::time::Duration;

use super::message::Urgency;

/// What a push service said, reduced to what the sender acts on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Outcome {
    /// 2xx: the service has the message (201 Created is the usual answer).
    Accepted,
    /// 404 or 410: the subscription no longer exists; delete it.
    Gone,
    /// Anything else; a sentence that never contains the endpoint, because
    /// an endpoint is a capability and ends up in logs and on disk.
    Failed(String),
}

/// What one request carries besides the body.
pub(crate) struct Request<'a> {
    pub endpoint: &'a str,
    pub body: Vec<u8>,
    pub authorization: String,
    pub ttl: Duration,
    pub urgency: Option<Urgency>,
}

/// The meaning of an HTTP status from a push service (RFC 8030 section 8).
pub(crate) fn classify(status: u16) -> Outcome {
    match status {
        200..=299 => Outcome::Accepted,
        404 | 410 => Outcome::Gone,
        413 => Outcome::Failed("the push service says the message is too large (HTTP 413)".into()),
        429 => Outcome::Failed("the push service is limiting this server (HTTP 429)".into()),
        401 | 403 => Outcome::Failed(format!(
            "the push service refused the VAPID signature (HTTP {status})"
        )),
        other => Outcome::Failed(format!("the push service answered HTTP {other}")),
    }
}

/// Send one message. A transport error becomes a sentence, like an HTTP
/// error does: both are a failed delivery the sender counts.
pub(crate) async fn post(client: &reqwest::Client, req: Request<'_>) -> Outcome {
    let mut builder = client
        .post(req.endpoint)
        .header("Content-Encoding", "aes128gcm")
        .header("Content-Type", "application/octet-stream")
        .header("TTL", req.ttl.as_secs().to_string())
        .body(req.body);
    let mut auth = match reqwest::header::HeaderValue::from_str(&req.authorization) {
        Ok(v) => v,
        Err(_) => return Outcome::Failed("the VAPID header could not be sent".into()),
    };
    // Keep the signed token out of any debug print of the request.
    auth.set_sensitive(true);
    builder = builder.header(reqwest::header::AUTHORIZATION, auth);
    if let Some(u) = req.urgency {
        builder = builder.header("Urgency", u.as_str());
    }
    match builder.send().await {
        Ok(res) => classify(res.status().as_u16()),
        Err(e) if e.is_timeout() => {
            Outcome::Failed("the push service did not answer in time".into())
        }
        Err(e) if e.is_connect() => {
            Outcome::Failed("the connection to the push service failed".into())
        }
        Err(e) => Outcome::Failed(format!("the request failed: {}", e.without_url())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_map_to_accepted_gone_or_a_failure_sentence() {
        for ok in [200, 201, 202, 204] {
            assert_eq!(classify(ok), Outcome::Accepted, "{ok}");
        }
        for gone in [404, 410] {
            assert_eq!(classify(gone), Outcome::Gone, "{gone}");
        }
        for bad in [301, 400, 401, 403, 413, 429, 500, 503] {
            let Outcome::Failed(why) = classify(bad) else {
                panic!("{bad} must fail");
            };
            assert!(why.contains(&bad.to_string()), "{why}");
            assert!(!why.contains("https://"), "never an endpoint in a sentence");
        }
    }
}
