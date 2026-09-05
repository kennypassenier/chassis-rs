//! Pure decisions: no files, no sockets, no clock (AR1).
//!
//! Everything in here takes plain values and returns plain values, so it
//! is tested exhaustively with no setup. The shell (`crate::shell`) is
//! the only place that reads the world and feeds it in. A CI grep keeps
//! it that way: `std::fs`, `std::net`, `tokio::fs`, `reqwest` and
//! `SystemTime` are refused under `src/core/`.

pub mod config;
pub mod error;
