//! User preferences in the database (3.12.0): the kit API, the scope, the
//! limits and the refusals, the values carried in signed-in pages, the
//! Preferences kind on the Storage page, and the browser script's own test.
#![cfg(all(feature = "testing", feature = "storage"))]

#[path = "prefs_api/access_and_declaration.rs"]
mod access_and_declaration;
#[path = "prefs_api/fixtures.rs"]
mod fixtures;
#[path = "prefs_api/round_trip.rs"]
mod round_trip;
