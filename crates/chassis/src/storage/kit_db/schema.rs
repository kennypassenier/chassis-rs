//! The kit file's name and numbered schema. Its own module because the
//! migration list is append-only history, kept apart from the code that
//! reads and writes the tables.

use crate::storage::db::Migration;

/// `<name>-kit.db`.
pub(crate) fn kit_file_name(app: &str) -> String {
    format!("{app}-kit.db")
}

/// The kit's schema. Append only.
pub(crate) fn kit_migrations() -> Vec<Migration> {
    vec![
        Migration::sql(
            "CREATE TABLE kit_clients (
            id             TEXT NOT NULL UNIQUE,
            name           TEXT NOT NULL,
            token_sealed   TEXT,
            issued_at      TEXT NOT NULL,
            revoked_at     TEXT,
            last_used_at   TEXT,
            uses           INTEGER NOT NULL,
            fields_sealed  TEXT
         ) STRICT;
         CREATE TABLE kit_sessions (
            id_hash     TEXT PRIMARY KEY,
            created_at  INTEGER NOT NULL,
            expires_at  INTEGER NOT NULL,
            remember    INTEGER NOT NULL
         ) STRICT;
         CREATE INDEX kit_sessions_expiry ON kit_sessions (expires_at);
         CREATE TABLE kit_passkeys (
            id                TEXT NOT NULL UNIQUE,
            label             TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            last_used_at      TEXT,
            credential_sealed TEXT NOT NULL
         ) STRICT;",
        ),
        // 3.15.0: the notification outbox (storage/outbox.rs).
        crate::storage::outbox::migration(),
    ]
}

/// How many migrations the kit file knows, for `--check`.
pub(crate) fn kit_schema_version() -> usize {
    kit_migrations().len()
}
