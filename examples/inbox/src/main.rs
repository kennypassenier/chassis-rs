//! inbox — the example service that proves the kit (K26).
//!
//! L1: it runs on the kit's lifecycle (config, logging, request-id,
//! readiness, graceful shutdown) and serves one route. Clients, messages
//! and the dashboard page are assembled in L7.

#![forbid(unsafe_code)]

use axum::Router;
use axum::routing::get;
use chassis::{App, AppSpec};

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let spec = AppSpec {
        name: "inbox",
        version: env!("CARGO_PKG_VERSION"),
        ..Default::default()
    };
    let routes = Router::new().route("/", get(|| async { "inbox: nothing here yet (L1)" }));
    App::main(spec, routes).await
}
