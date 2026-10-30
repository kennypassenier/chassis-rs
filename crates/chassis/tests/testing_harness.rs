//! K25: the `chassis::testing` harness proves itself — every helper has a
//! test that goes red when the behaviour it wraps is gone. Each test was
//! driven red once before it went green (standing rule 7e); the comment
//! on each says how.
#![cfg(feature = "testing")]

#[path = "testing_harness/docs_and_clients.rs"]
mod docs_and_clients;
#[path = "testing_harness/env_and_open.rs"]
mod env_and_open;
#[path = "testing_harness/fixtures.rs"]
mod fixtures;
#[path = "testing_harness/session_and_csrf.rs"]
mod session_and_csrf;
