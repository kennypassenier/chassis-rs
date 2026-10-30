//! The Storage page's JSON API (3.11.0): overview, preview, the typed
//! confirmation delete, compact, the same-origin and login rules, and the
//! lock that keeps the kit's file out of reach of every route.
#![cfg(all(feature = "testing", feature = "storage"))]

#[path = "storage_api/cleanup.rs"]
mod cleanup;
#[path = "storage_api/fixtures.rs"]
mod fixtures;
#[path = "storage_api/kit_file_guard.rs"]
mod kit_file_guard;
#[path = "storage_api/overview_and_access.rs"]
mod overview_and_access;
