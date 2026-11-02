//! What the notification channel remembers beside the outbox (3.15.0): the
//! targets saved from the Status page, the last error, the last delivery and
//! how many messages the cap has dropped. Rows of `chassis_meta` in the kit
//! file, so they survive a restart like the messages do.

use serde::{Deserialize, Serialize};

use super::db::{Db, meta_get, meta_set};
use crate::core::error::Error;

const LAST_ERROR: &str = "notify_last_error";
const LAST_DELIVERY: &str = "notify_last_delivery";
const DROPPED: &str = "notify_dropped_total";

/// The last thing that went wrong, with its time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct LastError {
    /// RFC 3339.
    pub at: String,
    /// `primary`, `kit`, `fallback`, `outbox` (storage trouble) or `test`.
    pub target: String,
    /// A sentence; never an address (an address can carry a webhook id).
    pub message: String,
}

/// The last message a target accepted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct LastDelivery {
    pub at: String,
    /// `primary`, `kit` or `fallback`.
    pub via: String,
}

#[derive(Clone)]
pub(crate) struct NotifyMeta {
    db: Db,
}

impl NotifyMeta {
    pub(crate) fn new(db: Db) -> Self {
        NotifyMeta { db }
    }

    /// The saved value for a target key (`notify_url`, `notify_fallback_url`).
    /// `Some("")` is a saved "no target".
    pub(crate) fn stored(&self, key: &str) -> Result<Option<String>, Error> {
        self.db.read_blocking(|c| meta_get(c, key))
    }

    /// Save addresses in one transaction: `(key, value)` pairs.
    pub(crate) fn store(&self, entries: &[(&str, &str)]) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            for (key, value) in entries {
                meta_set(tx, key, value)?;
            }
            Ok(())
        })
    }

    /// Remove the saved values of the named keys ("Use the default").
    pub(crate) fn forget(&self, keys: &[&str]) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            for key in keys {
                tx.execute("DELETE FROM chassis_meta WHERE key = ?1", [key])?;
            }
            Ok(())
        })
    }

    pub(crate) fn last_error(&self) -> Result<Option<LastError>, Error> {
        self.read_json(LAST_ERROR)
    }

    /// Remember an error as the latest one AND as the last one of its own
    /// target, so the card can show what each target said.
    pub(crate) fn set_last_error(&self, e: &LastError) -> Result<(), Error> {
        let text = serde_json::to_string(e).expect("meta value serialises");
        let per_target = format!("{LAST_ERROR}:{}", e.target);
        self.db.write_blocking(|tx| {
            meta_set(tx, LAST_ERROR, &text)?;
            meta_set(tx, &per_target, &text)
        })
    }

    /// The last error of one target (`primary`, `kit`, `fallback`, ...).
    pub(crate) fn last_error_of(&self, target: &str) -> Result<Option<LastError>, Error> {
        self.read_json(&format!("{LAST_ERROR}:{target}"))
    }

    pub(crate) fn last_delivery(&self) -> Result<Option<LastDelivery>, Error> {
        self.read_json(LAST_DELIVERY)
    }

    pub(crate) fn set_last_delivery(&self, d: &LastDelivery) -> Result<(), Error> {
        self.write_json(LAST_DELIVERY, d)
    }

    /// Messages the outbox cap has pushed out, since the file was made.
    pub(crate) fn dropped_total(&self) -> Result<u64, Error> {
        Ok(self
            .db
            .read_blocking(|c| meta_get(c, DROPPED))?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0))
    }

    pub(crate) fn add_dropped(&self, n: u64) -> Result<(), Error> {
        self.db.write_blocking(|tx| {
            let now: u64 = meta_get(tx, DROPPED)?
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            meta_set(tx, DROPPED, &(now + n).to_string())
        })
    }

    fn read_json<T: serde::de::DeserializeOwned>(&self, key: &str) -> Result<Option<T>, Error> {
        Ok(self
            .db
            .read_blocking(|c| meta_get(c, key))?
            .and_then(|v| serde_json::from_str(&v).ok()))
    }

    fn write_json<T: Serialize>(&self, key: &str, value: &T) -> Result<(), Error> {
        let text = serde_json::to_string(value).expect("meta value serialises");
        self.db.write_blocking(|tx| meta_set(tx, key, &text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_are_kept_across_a_reopen_and_forgotten_on_request() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("svc-kit.db");
        let open = || Db::open(&path, &crate::storage::kit_migrations()).unwrap();
        {
            let meta = NotifyMeta::new(open());
            meta.store(&[
                ("notify_url", "http://hub/t/x"),
                ("notify_fallback_url", ""),
            ])
            .unwrap();
            meta.set_last_error(&LastError {
                at: "2026-10-30T10:00:00Z".into(),
                target: "primary".into(),
                message: "HTTP 503".into(),
            })
            .unwrap();
            meta.add_dropped(2).unwrap();
            meta.add_dropped(3).unwrap();
        }
        let meta = NotifyMeta::new(open());
        assert_eq!(
            meta.stored("notify_url").unwrap().as_deref(),
            Some("http://hub/t/x")
        );
        assert_eq!(
            meta.stored("notify_fallback_url").unwrap().as_deref(),
            Some(""),
            "a saved 'none' is not 'unset'"
        );
        assert_eq!(meta.last_error().unwrap().unwrap().message, "HTTP 503");
        assert_eq!(meta.dropped_total().unwrap(), 5);
        meta.forget(&["notify_url"]).unwrap();
        assert_eq!(meta.stored("notify_url").unwrap(), None);
        assert!(meta.stored("notify_fallback_url").unwrap().is_some());
        assert_eq!(meta.last_delivery().unwrap(), None);
    }
}
