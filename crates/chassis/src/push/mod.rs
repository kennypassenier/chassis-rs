//! Web Push for the installed web app (habits-push-1, `docs/PUSH_DESIGN.md`).
//!
//! A browser subscribes through the page (`window.chassisPush`), the kit
//! keeps the subscription in the kit file, and the app sends with its own
//! command, separate from the notification channel:
//!
//! ```ignore
//! let report = app.push().send(
//!     Push::new("Water drinken")
//!         .body("Het is tijd voor een glas")
//!         .url("/habits/water")
//!         .tag("water")
//!         .action("done", "Gedaan", "/api/habits/water/done"),
//! ).await?;
//! ```
//!
//! The pieces are one module each: `ece` (RFC 8291 encryption) and `vapid`
//! (RFC 8292 signing) are pure; `keys`, `message` and `subscription` are
//! plain data; `storage::push_store` persists; `delivery` and `sender` are
//! transport; `api` and `mount` are the HTTP face and the wiring.

mod api;
mod b64;
mod config;
mod delivery;
mod ece;
mod handle;
mod keys;
mod message;
pub(crate) mod mount;
mod sender;
mod subscription;
mod vapid;

pub use handle::PushHandle;
pub use message::{MAX_ACTIONS, Push, Urgency};
pub use sender::PushReport;

pub(crate) use config::PushKnobs;

#[cfg(test)]
mod api_tests;
#[cfg(test)]
mod delivery_tests;
#[cfg(test)]
mod fake_service;
