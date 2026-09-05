//! Everything that touches the world: files, sockets, signals, the clock
//! (AR1). Thin by design; the decisions live in `crate::core`.

#[cfg(feature = "dashboard")]
pub mod assets;
#[cfg(feature = "dashboard")]
pub mod auth;
#[cfg(feature = "dashboard")]
pub mod captures;
#[cfg(feature = "dashboard")]
pub mod clients_api;
pub mod config_load;
#[cfg(feature = "dashboard")]
pub mod dashboard;
pub mod guards;
pub mod health;
pub mod http;
pub mod lifecycle;
pub mod logging;
pub mod metrics;
#[cfg(feature = "passkeys")]
pub mod passkeys;
pub mod store;
pub mod time;
