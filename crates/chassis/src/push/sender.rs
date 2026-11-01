//! The sender: one message to every subscription, a few at a time, and a
//! report of what happened. The glue between the pieces; each piece is a
//! module of its own (`ece`, `vapid`, `delivery`, the store).

use std::sync::Arc;

use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use super::config::PushKnobs;
use super::delivery::{Outcome, Request, post};
use super::keys::VapidKey;
use super::message::Push;
use super::{ece, vapid};
use crate::core::error::Error;
use crate::shell::time::now_epoch;
use crate::storage::push_store::{PushStore, Stored};

/// What [`Sender::send`] did, per message. Sealed, so a later field is
/// not a breaking change; read the fields, never build one.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct PushReport {
    /// Subscriptions whose push service accepted the message.
    pub accepted: usize,
    /// Subscriptions the push service reported as gone (404/410); deleted.
    pub removed: usize,
    /// Subscriptions that failed for another reason; kept, with the error.
    pub failed: usize,
    /// The last failure as a sentence (never an endpoint), if any failed.
    pub last_error: Option<String>,
}

#[derive(Clone)]
pub(crate) struct Sender {
    store: PushStore,
    key: VapidKey,
    knobs: Arc<PushKnobs>,
    client: reqwest::Client,
}

impl Sender {
    pub(crate) fn new(store: PushStore, key: VapidKey, knobs: PushKnobs) -> Result<Self, Error> {
        // No redirects: an endpoint that redirects is not a push service, and
        // following it would carry the signed token to another host.
        let client = reqwest::Client::builder()
            .timeout(knobs.timeout)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| {
                Error::internal(
                    format!("the push HTTP client could not be built: {e}"),
                    "report this to the project",
                )
            })?;
        Ok(Sender {
            store,
            key,
            knobs: Arc::new(knobs),
            client,
        })
    }

    /// Send `push` to every subscription. An `Err` means nothing could be
    /// attempted (no subject, an invalid notification, an unreadable store);
    /// per-subscription trouble is in the report.
    pub(crate) async fn send(&self, push: &Push) -> Result<PushReport, Error> {
        let subject = self.knobs.require_subject()?.to_string();
        let payload = Arc::new(push.payload()?);
        let store = self.store.clone();
        let subs = blocking(move || store.all()).await?;
        let gate = Arc::new(Semaphore::new(self.knobs.concurrency));
        let ttl = push.ttl_value().unwrap_or(self.knobs.ttl);
        let mut tasks = JoinSet::new();
        for sub in subs {
            let ctx = Delivery {
                sender: self.clone(),
                subject: subject.clone(),
                payload: payload.clone(),
                push: push.clone(),
                ttl,
            };
            let gate = gate.clone();
            tasks.spawn(async move {
                let _slot = gate.acquire_owned().await;
                ctx.run(sub).await
            });
        }
        let mut report = PushReport::default();
        while let Some(done) = tasks.join_next().await {
            match done {
                Ok(outcome) => tally(&mut report, outcome),
                Err(e) => tally(
                    &mut report,
                    Outcome::Failed(format!("a push task failed: {e}")),
                ),
            }
        }
        Ok(report)
    }
}

fn tally(report: &mut PushReport, outcome: Outcome) {
    match outcome {
        Outcome::Accepted => report.accepted += 1,
        Outcome::Gone => report.removed += 1,
        Outcome::Failed(why) => {
            report.failed += 1;
            report.last_error = Some(why);
        }
    }
}

/// Everything one subscription's delivery needs.
struct Delivery {
    sender: Sender,
    subject: String,
    payload: Arc<Vec<u8>>,
    push: Push,
    ttl: std::time::Duration,
}

impl Delivery {
    /// Encrypt, sign, post, and record the result in the store.
    async fn run(self, sub: Stored) -> Outcome {
        let outcome = match self.request(&sub) {
            Ok(body) => post(&self.sender.client, body).await,
            Err(e) => Outcome::Failed(e.message),
        };
        let store = self.sender.store.clone();
        let (endpoint, seen) = (sub.endpoint.clone(), outcome.clone());
        let recorded = blocking(move || record(&store, &endpoint, &seen)).await;
        if let Err(e) = recorded {
            tracing::warn!(error = %e, "push: the result of a delivery could not be recorded");
        }
        outcome
    }

    fn request<'a>(&'a self, sub: &'a Stored) -> Result<Request<'a>, Error> {
        let corrupt = || {
            Error::internal(
                "a stored subscription has unreadable keys",
                "the browser must subscribe again",
            )
        };
        let public = super::b64::decode(&sub.p256dh).ok_or_else(corrupt)?;
        let auth = super::b64::decode(&sub.auth).ok_or_else(corrupt)?;
        Ok(Request {
            endpoint: &sub.endpoint,
            body: ece::encrypt(&public, &auth, &self.payload)?,
            authorization: vapid::authorization(
                &self.sender.key,
                &sub.endpoint,
                &self.subject,
                now_epoch(),
            )?,
            ttl: self.ttl,
            urgency: self.push.urgency_value(),
        })
    }
}

/// Write one outcome to the store: success stamps, gone deletes, a failure
/// is remembered with its sentence.
fn record(store: &PushStore, endpoint: &str, outcome: &Outcome) -> Result<(), Error> {
    let now = now_epoch() as i64;
    match outcome {
        Outcome::Accepted => store.record_success(endpoint, now),
        Outcome::Gone => store.remove(endpoint).map(|_| ()),
        Outcome::Failed(why) => store.record_error(endpoint, why, now),
    }
}

pub(crate) async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
    tokio::task::spawn_blocking(f).await.unwrap_or_else(|e| {
        Err(Error::internal(
            format!("a push task failed: {e}"),
            "report this to the project",
        ))
    })
}
