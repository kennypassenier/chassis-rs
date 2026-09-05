//! Everything that touches the world: files, sockets, signals, the clock
//! (AR1). Thin by design; the decisions live in `crate::core`.

pub mod config_load;
pub mod guards;
pub mod health;
pub mod http;
pub mod lifecycle;
pub mod logging;
pub mod metrics;
