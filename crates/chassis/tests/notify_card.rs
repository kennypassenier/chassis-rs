//! The shared notification sender and its Status card (3.15.0): the
//! precedence of the two addresses, the locked refusal, fallback once, the
//! outbox cap, kyu's duplicate answer and the Test button.
#![cfg(all(feature = "testing", feature = "notify"))]

#[path = "notify_card/configuration.rs"]
mod configuration;
#[path = "notify_card/delivery.rs"]
mod delivery;
#[path = "notify_card/fixtures.rs"]
mod fixtures;
#[path = "notify_card/link_and_kit.rs"]
mod link_and_kit;
#[path = "notify_card/token.rs"]
mod token;
