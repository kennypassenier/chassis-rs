//! The `sync` hint (decision 6): after a write the app publishes the names
//! of the collections that changed on its live channel, and open pages pull
//! at once. A page that misses a hint still catches up at its next pull.

use crate::core::error::Error;
use crate::shell::live::Live;

/// Publish `sync` with `{"collections": [..]}` to every open page; returns
/// how many subscribers it reached.
pub fn publish_hint(live: &Live, collections: &[&str]) -> Result<usize, Error> {
    live.publish("sync", &serde_json::json!({ "collections": collections }))
}
