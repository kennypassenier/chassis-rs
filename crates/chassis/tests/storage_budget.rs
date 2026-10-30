//! The budget controls of the Storage page (3.11.0): the page setting in the
//! app file, `POST /api/kit/storage/budget`, its validation in plain words,
//! the precedence (environment > page setting > code > default), the reset,
//! the level that moves with the setting, and the audit line.
#![cfg(all(feature = "testing", feature = "storage"))]

#[path = "storage_budget/fixtures.rs"]
mod fixtures;
#[path = "storage_budget/level_and_access.rs"]
mod level_and_access;
#[path = "storage_budget/settings.rs"]
mod settings;
