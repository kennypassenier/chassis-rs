//! Everything that touches the world: files, sockets, signals, the clock
//! (AR1). Thin by design; the decisions live in `crate::core`.

pub mod config_load;
pub mod http;
pub mod lifecycle;
pub mod logging;
