//! The app database through a running service (3.11.0): the budget that
//! only warns, the status-page problem and the metrics, the one-time import
//! at start, the daily finished-rows rule, `--check`, and compact refused
//! while a backup pause holds the state.
#![cfg(all(feature = "testing", feature = "storage"))]

#[path = "storage_app/budget_warning.rs"]
mod budget_warning;
#[path = "storage_app/fixtures.rs"]
mod fixtures;
#[path = "storage_app/import_and_check.rs"]
mod import_and_check;
