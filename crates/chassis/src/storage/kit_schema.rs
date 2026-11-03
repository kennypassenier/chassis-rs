//! The kit file's name and numbered schema. Its own module because the
//! migration list is append-only history, kept apart from the code that
//! reads and writes the tables. Compiled with the `storage` feature alone:
//! every build, whichever of `dashboard`, `notify`, `push` or `self-update`
//! it has, agrees on the kit file's version.

use crate::storage::db::Migration;

/// `<name>-kit.db`: the kit file's name beside the app's own, for a test
/// or a backup script that needs to find it.
pub fn kit_file_name(app: &str) -> String {
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
        Migration::sql(
            "CREATE TABLE kit_outbox (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   INTEGER NOT NULL,
            kind         TEXT NOT NULL,
            body         TEXT NOT NULL,
            attempts     INTEGER NOT NULL DEFAULT 0,
            next_try_at  INTEGER NOT NULL DEFAULT 0,
            dedup_key    TEXT,
            dedup_window TEXT
         ) STRICT;
         CREATE INDEX kit_outbox_due ON kit_outbox (next_try_at, id);",
        ),
        // habits-push-1: the Web Push subscriptions (storage/push_store.rs).
        Migration::sql(
            "CREATE TABLE kit_push_subscriptions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint        TEXT NOT NULL UNIQUE,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            created_at      INTEGER NOT NULL,
            last_success_at INTEGER,
            last_error      TEXT,
            last_error_at   INTEGER
         ) STRICT;",
        ),
        // nojson-1: the self-update state and the rolled-back versions,
        // formerly update-state.json and update-skip.json
        // (shell/update/store.rs). `kit_update_state` holds at most one row.
        Migration::sql(
            "CREATE TABLE kit_update_state (
            id               INTEGER PRIMARY KEY CHECK (id = 1),
            from_version     TEXT NOT NULL,
            to_version       TEXT NOT NULL,
            previous_binary  TEXT NOT NULL,
            attempts         INTEGER NOT NULL
         ) STRICT;
         CREATE TABLE kit_update_skipped (
            version     TEXT PRIMARY KEY,
            skipped_at  TEXT NOT NULL
         ) STRICT;",
        ),
    ]
}

/// How many migrations the kit file knows, for `--check`.
pub(crate) fn kit_schema_version() -> usize {
    kit_migrations().len()
}
