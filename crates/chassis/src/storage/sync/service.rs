//! The service the routes call: the manifest of the declared collections
//! and the pages of a feed, with the floor check that turns an old cursor
//! into a resync.

use std::collections::BTreeSet;
use std::sync::Arc;

use serde_json::{Value as Json, json};

use super::collection::{Fnv, SyncCollection};
use super::cursor::Cursor;
use super::feed::Feed;
use super::log::SyncSource;
use crate::core::error::{Error, Kind};

struct Inner {
    collections: Vec<SyncCollection>,
    source: Arc<dyn SyncSource>,
}

/// The declared collections and the source their feeds come from. Cheap to
/// clone.
#[derive(Clone)]
pub struct SyncService {
    inner: Arc<Inner>,
}

impl SyncService {
    /// Validate the declarations (names, fields, no collection twice) and
    /// join them to a source.
    pub fn new(
        collections: Vec<SyncCollection>,
        source: Arc<dyn SyncSource>,
    ) -> Result<Self, Error> {
        let mut seen = BTreeSet::new();
        for c in &collections {
            c.validate()?;
            if !seen.insert(c.name().to_string()) {
                return Err(Error::config(
                    format!("sync collection `{}` is declared twice", c.name()),
                    "give each collection its own name",
                ));
            }
        }
        Ok(SyncService {
            inner: Arc::new(Inner {
                collections,
                source,
            }),
        })
    }

    /// The declarations, in the order they were made.
    pub fn collections(&self) -> &[SyncCollection] {
        &self.inner.collections
    }

    /// The answer of `GET /api/sync`: every collection with its key,
    /// indexes and schema hash, and one hash over all of them.
    pub fn manifest(&self) -> Json {
        let mut all = Fnv::new();
        for c in &self.inner.collections {
            all.feed(&c.schema_hash());
        }
        json!({
            "collections": self.inner.collections.iter()
                .map(SyncCollection::manifest_entry)
                .collect::<Vec<_>>(),
            "schema": all.hex(),
        })
    }

    /// One page of `collection` for the login `scope`. `since` is the
    /// cursor string of the previous answer, or `None` for the beginning;
    /// `limit` is the page size asked for.
    pub async fn feed(
        &self,
        collection: &str,
        scope: &str,
        since: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Feed, Error> {
        let decl = self
            .inner
            .collections
            .iter()
            .find(|c| c.name() == collection)
            .ok_or_else(|| {
                Error::new(
                    Kind::NotFound,
                    format!("there is no sync collection `{collection}`"),
                    "ask GET /api/sync for the collections this app syncs",
                )
            })?;
        let since = since.map(Cursor::decode).transpose()?;
        let source = &self.inner.source;
        if let Some(c) = since {
            let floor = source.floor(collection).await?;
            // Below the floor (a sweep is exempt: it lists live items only),
            // or from another epoch: the file was restored from a copy.
            if c.is_foreign_to(floor) || (!c.is_sweep() && c < floor) {
                return Ok(Feed::Resync { floor });
            }
        }
        source
            .changes_since(collection, scope, since, decl.effective_limit(limit))
            .await
    }
}

#[cfg(test)]
impl SyncService {
    /// The source, for a test that builds a second service over it.
    pub(super) fn inner_source_for_tests(&self) -> Arc<dyn SyncSource> {
        self.inner.source.clone()
    }
}
