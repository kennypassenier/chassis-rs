//! Tests of the kit database: sealed tables, the one-time import and the
//! re-keying, over real files in a temp dir. The fixtures live here.

use std::path::Path;

use super::*;
use crate::core::clients::ClientsFile;
use crate::core::crypto::Key;
use crate::core::session::SessionsFile;
use crate::shell::store::EncryptedFile;
use crate::storage::db::Db;

mod import;
mod rekey;
mod tables;

pub(super) fn key() -> Key {
    Key::from_bytes([5u8; 32])
}

pub(super) fn kit(dir: &Path) -> KitDb {
    KitDb::new(
        Db::open(&dir.join("svc-kit.db"), &kit_migrations()).unwrap(),
        key(),
    )
}

pub(super) fn clients() -> ClientsFile {
    let mut f = ClientsFile::default();
    f.issue_with_fields(
        "ha",
        "id-1".into(),
        "very-secret-token-1".into(),
        "2026-09-05T07:00:00Z",
        [("calendar".to_string(), "private-calendar-id".to_string())].into(),
    )
    .unwrap();
    f.issue_with_fields(
        "other",
        "id-2".into(),
        "very-secret-token-2".into(),
        "2026-09-05T07:01:00Z",
        Default::default(),
    )
    .unwrap();
    f.revoke("id-2", "2026-09-06T00:00:00Z").unwrap();
    f
}

pub(super) fn raw_bytes(dir: &Path) -> Vec<u8> {
    let mut all = Vec::new();
    for f in ["svc-kit.db", "svc-kit.db-wal"] {
        all.extend(std::fs::read(dir.join(f)).unwrap_or_default());
    }
    all
}

pub(super) fn contains(hay: &[u8], needle: &str) -> bool {
    hay.windows(needle.len()).any(|w| w == needle.as_bytes())
}
