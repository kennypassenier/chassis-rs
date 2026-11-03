//! Declaring a collection (decision 1): one kind of item the app syncs.
//! Declared once in Rust; the page builds its stores from the manifest, so
//! nothing is kept in step by hand between Rust and JS.

use std::time::Duration;

use serde_json::{Value as Json, json};

use crate::core::error::Error;

/// The most changes one page may hold, whatever a request or a collection asks.
pub const MAX_PAGE_LIMIT: usize = 2000;
/// The page size when neither the request nor the collection says.
const DEFAULT_PAGE_LIMIT: usize = 500;

/// One collection of the local database, as the server knows it.
///
/// ```text
/// SyncCollection::new("dishes").key("id").index("name").index("category")
///     .routes("/data/dishes", "/data/dishes/:id")
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncCollection {
    name: String,
    key: String,
    rev: String,
    indexes: Vec<String>,
    shared: bool,
    retain: Option<Duration>,
    page_limit: usize,
    routes: Option<(String, String)>,
    server_keys: bool,
}

impl SyncCollection {
    /// A collection called `name` (lowercase letters, digits and `_`, starting
    /// with a letter, at most 40 characters, as the page requires), keyed by `id`, revision field `rev`.
    pub fn new(name: &str) -> Self {
        SyncCollection {
            name: name.to_string(),
            key: "id".into(),
            rev: "rev".into(),
            indexes: Vec::new(),
            shared: false,
            retain: None,
            page_limit: DEFAULT_PAGE_LIMIT,
            routes: None,
            server_keys: false,
        }
    }

    /// The field of an item that holds its key.
    pub fn key(mut self, field: &str) -> Self {
        self.key = field.to_string();
        self
    }

    /// The field of an item that holds its revision (the kit's `rev`).
    pub fn rev(mut self, field: &str) -> Self {
        self.rev = field.to_string();
        self
    }

    /// A field the page may query locally. The server ignores indexes; they
    /// only travel in the manifest.
    pub fn index(mut self, field: &str) -> Self {
        self.indexes.push(field.to_string());
        self
    }

    /// Every login reads every item (today's apps: one login per household).
    /// Without it the app records the scope of each change itself, with
    /// `sync_upsert_for`.
    pub fn shared(mut self) -> Self {
        self.shared = true;
        self
    }

    /// Keep tombstones this long (default 30 days; `<P>_SYNC_RETAIN_DAYS`
    /// wins when it is set).
    pub fn retain(mut self, tombstones: Duration) -> Self {
        self.retain = Some(tombstones);
        self
    }

    /// The page size when a request names none (at most [`MAX_PAGE_LIMIT`]).
    pub fn page_limit(mut self, limit: usize) -> Self {
        self.page_limit = limit;
        self
    }

    /// The app's item routes, for the page's write queue: the list route
    /// (POST creates) and the item route (`:id` (any single `:param`) stands for the key).
    pub fn routes(mut self, list: &str, item: &str) -> Self {
        self.routes = Some((list.to_string(), item.to_string()));
        self
    }

    /// The server assigns the key (an integer id, say): the page's `create`
    /// POSTs the item without a key and shows it under a temporary local one
    /// until the answer or the next pull brings the real record.
    pub fn server_keys(mut self) -> Self {
        self.server_keys = true;
        self
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn key_field(&self) -> &str {
        &self.key
    }

    pub fn is_shared(&self) -> bool {
        self.shared
    }

    pub fn retention(&self) -> Option<Duration> {
        self.retain
    }

    /// The page size for a request that asked for `asked` (or nothing).
    pub(crate) fn effective_limit(&self, asked: Option<usize>) -> usize {
        asked.unwrap_or(self.page_limit).clamp(1, MAX_PAGE_LIMIT)
    }

    /// Names are validated at start like `DataKind` names.
    pub(crate) fn validate(&self) -> Result<(), Error> {
        let bad = |what: &str, v: &str| {
            Error::config(
                format!("sync collection `{}`: {what} `{v}` is not valid", self.name),
                "collection names are `[a-z][a-z0-9_]{0,39}`; field names are letters, digits, `_` and `.` starting with a letter or `_`",
            )
        };
        if !is_name(&self.name) {
            return Err(bad("the name", &self.name));
        }
        for f in [&self.key, &self.rev].into_iter().chain(&self.indexes) {
            if !is_field(f) {
                return Err(bad("the field", f));
            }
        }
        if self.page_limit == 0 || self.page_limit > MAX_PAGE_LIMIT {
            return Err(Error::config(
                format!(
                    "sync collection `{}`: page_limit {} is outside 1 to {MAX_PAGE_LIMIT}",
                    self.name, self.page_limit
                ),
                "pick a page size within the range",
            ));
        }
        if let Some((list, item)) = &self.routes
            && !(list.starts_with('/') && item.starts_with('/') && item.matches(':').count() == 1)
        {
            return Err(Error::config(
                format!(
                    "sync collection `{}`: routes `{list}`, `{item}` are not same-origin paths with exactly one `:param` in the item route",
                    self.name
                ),
                "use e.g. .routes(\"/data/dishes\", \"/data/dishes/:id\")",
            ));
        }
        Ok(())
    }

    /// A hash of everything the page builds its store from. When it changes
    /// the page drops the store and resyncs.
    pub fn schema_hash(&self) -> String {
        let mut h = Fnv::new();
        h.feed(&self.name);
        h.feed(&self.key);
        h.feed(&self.rev);
        h.feed(if self.shared { "shared" } else { "scoped" });
        for i in &self.indexes {
            h.feed(i);
        }
        h.hex()
    }

    /// This collection's entry of `GET /api/sync`.
    pub(crate) fn manifest_entry(&self) -> Json {
        json!({
            "name": self.name,
            "key": self.key,
            "rev": self.rev,
            "indexes": self.indexes,
            "shared": self.shared,
            "keys": if self.server_keys { "server" } else { "client" },
            "routes": self.routes.as_ref().map(|(list, item)| json!({ "list": list, "item": item })),
            "schema": self.schema_hash(),
        })
    }
}

fn is_name(s: &str) -> bool {
    let mut c = s.chars();
    s.len() <= 40
        && c.next().is_some_and(|f| f.is_ascii_lowercase())
        && c.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
}

fn is_field(s: &str) -> bool {
    let mut c = s.chars();
    s.len() <= 64
        && c.next()
            .is_some_and(|f| f.is_ascii_alphabetic() || f == '_')
        && c.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.')
}

/// FNV-1a 64 over length-prefixed parts: a change detector, not a secret.
pub(crate) struct Fnv(u64);

impl Fnv {
    pub(crate) fn new() -> Self {
        Fnv(0xcbf2_9ce4_8422_2325)
    }

    pub(crate) fn feed(&mut self, part: &str) {
        for b in (part.len() as u64)
            .to_le_bytes()
            .iter()
            .chain(part.as_bytes())
        {
            self.0 ^= u64::from(*b);
            self.0 = self.0.wrapping_mul(0x0100_0000_01b3);
        }
    }

    pub(crate) fn hex(&self) -> String {
        format!("{:016x}", self.0)
    }
}
