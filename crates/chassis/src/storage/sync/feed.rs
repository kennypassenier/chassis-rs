//! What a feed answers with (decision 2). One entry per key, newest state.

use serde_json::{Value as Json, json};

use super::cursor::Cursor;

/// An item that is new or changed: the server's current body.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub struct Upsert {
    pub key: String,
    pub rev: u64,
    pub data: Json,
}

impl Upsert {
    pub fn new(key: impl Into<String>, rev: u64, data: Json) -> Self {
        Upsert {
            key: key.into(),
            rev,
            data,
        }
    }
}

/// An item that is gone (a tombstone), with the revision of the delete.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Delete {
    pub key: String,
    pub rev: u64,
}

impl Delete {
    pub fn new(key: impl Into<String>, rev: u64) -> Self {
        Delete {
            key: key.into(),
            rev,
        }
    }
}

/// One page of a feed.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub struct Page {
    pub upserts: Vec<Upsert>,
    pub deletes: Vec<Delete>,
    /// Where to ask next.
    pub cursor: Cursor,
    /// True: ask again at once with `cursor`.
    pub more: bool,
}

impl Page {
    pub fn new(upserts: Vec<Upsert>, deletes: Vec<Delete>, cursor: Cursor, more: bool) -> Self {
        Page {
            upserts,
            deletes,
            cursor,
            more,
        }
    }

    /// The wire shape of `GET /api/sync/<collection>`.
    pub fn to_json(&self) -> Json {
        json!({
            "upserts": self.upserts.iter()
                .map(|u| json!({ "key": u.key, "rev": u.rev, "data": u.data }))
                .collect::<Vec<_>>(),
            "deletes": self.deletes.iter()
                .map(|d| json!({ "key": d.key, "rev": d.rev }))
                .collect::<Vec<_>>(),
            "cursor": self.cursor.encode(),
            "more": self.more,
        })
    }
}

/// What a source answers: a page, or "your cursor is older than I keep".
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum Feed {
    Page(Page),
    /// The cursor is below the floor (retention removed tombstones the
    /// device never saw): it must start over from the master (HTTP 410).
    Resync {
        floor: Cursor,
    },
}
