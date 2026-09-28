//! Everything that touches the world: files, sockets, signals, the clock
//! (AR1). Thin by design; the decisions live in `crate::core`.

#[cfg(feature = "assets")]
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
#[cfg(feature = "live")]
pub mod live;
pub mod logging;
pub mod metrics;
#[cfg(feature = "notify")]
pub mod notify;
#[cfg(feature = "passkeys")]
pub mod passkeys;
#[cfg(feature = "request-guard")]
pub mod request_guard;
pub mod store;
pub mod time;
#[cfg(feature = "self-update")]
pub mod update;
#[cfg(feature = "webapp")]
pub mod webapp;
