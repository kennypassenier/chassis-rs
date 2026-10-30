//! The Storage kit page (3.11.0), locked to what Kenny approved in the demo
//! `research/chassis-storage` of kp-themes (21/10/2026 07:42, all four
//! sections, formal): the budget (8 columns) against the empty space (4) and
//! the kinds as a TABLE across 12, a clean-up dialog in two steps (a
//! read-only preview, then the kind's NAME typed), a compact dialog, every
//! card with its own loading, empty and failed state, and stable control ids
//! for the homelab Live view. The page is listed by the registry, so the bar,
//! the palette, the tab bar and the phone's More drawer all show it.
#![cfg(all(feature = "testing", feature = "storage"))]

mod support;

#[path = "storage_page/fixtures.rs"]
mod fixtures;
#[path = "storage_page/served_page.rs"]
mod served_page;
#[path = "storage_page/shipped_assets.rs"]
mod shipped_assets;
