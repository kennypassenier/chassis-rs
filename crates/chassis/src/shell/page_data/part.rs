//! One part of a page's data: how it is read, timed and answered.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::core::error::{Error, Kind};

/// What a part's read gives: its data, or the error and remedy to show in
/// that part's place.
pub type PartResult = Result<Value, Error>;

type Read = dyn Fn() -> Pin<Box<dyn Future<Output = PartResult> + Send>> + Send + Sync;

/// A named read.
#[derive(Clone)]
pub(super) struct Part {
    pub(super) name: String,
    read: Arc<Read>,
}

impl Part {
    pub(super) fn new<F, Fut>(name: &str, read: F) -> Self
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = PartResult> + Send + 'static,
    {
        Self {
            name: name.to_string(),
            read: Arc::new(move || Box::pin(read())),
        }
    }

    /// The read, bounded by `timeout`; a read that panics is an error too.
    async fn run(&self, timeout: Duration) -> PartResult {
        let read = tokio::spawn((self.read)());
        match tokio::time::timeout(timeout, read).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(Error::internal(
                format!("reading the part {:?} failed unexpectedly", self.name),
                "reload the page; if it keeps failing, the service log names the cause",
            )),
            Err(_) => Err(Error::new(
                Kind::Overloaded,
                format!(
                    "the part {:?} took longer than {} s",
                    self.name,
                    timeout.as_secs()
                ),
                "try again in a moment",
            )),
        }
    }
}

/// A failed part as the merged answer shows it.
fn failed(err: &Error) -> Value {
    json!({ "error": err.message, "remedy": err.remedy, "status": err.kind.status().as_u16() })
}

/// Every part, side by side, in one 200 answer.
pub(super) async fn read_all(parts: &[Part], timeout: Duration) -> Response {
    let mut set = tokio::task::JoinSet::new();
    for (i, part) in parts.iter().cloned().enumerate() {
        set.spawn(async move { (i, part.run(timeout).await) });
    }
    let mut results: Vec<Option<PartResult>> = vec![None; parts.len()];
    while let Some(Ok((i, result))) = set.join_next().await {
        results[i] = Some(result);
    }
    let mut out = Map::new();
    for (part, result) in parts.iter().zip(results) {
        let value = match result {
            Some(Ok(data)) => json!({ "data": data }),
            Some(Err(err)) => failed(&err),
            None => failed(&Error::internal(
                format!("the part {:?} was not read", part.name),
                "reload the page",
            )),
        };
        out.insert(part.name.clone(), value);
    }
    Json(json!({ "parts": out })).into_response()
}

/// One part as a plain answer: its data, or its error with its own status.
pub(super) async fn read_one(parts: &[Part], name: &str, timeout: Duration) -> Response {
    let Some(part) = parts.iter().find(|p| p.name == name) else {
        let names: Vec<&str> = parts.iter().map(|p| p.name.as_str()).collect();
        return Error::new(
            Kind::NotFound,
            format!("this page has no data part {name:?}"),
            format!("ask for one of: {}", names.join(", ")),
        )
        .into_response();
    };
    match part.run(timeout).await {
        Ok(data) => Json(data).into_response(),
        Err(err) => err.into_response(),
    }
}
