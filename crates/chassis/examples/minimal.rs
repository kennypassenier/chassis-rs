//! The smallest service on chassis (K24): one file, one route, the rest
//! from the kit. Run `cargo run --example minimal --features dashboard --
//! --listen 127.0.0.1:8080` after `gen-secret` gave you the two secrets.

use axum::routing::post;
use axum::{Json, Router};
use chassis::{App, AppSpec, Caller};

/// A client posts JSON with its token; we answer with who sent it.
async fn echo(caller: Caller, Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let from = match caller {
        Caller::Client { name, .. } => name,
        Caller::Admin => "admin".to_string(),
    };
    Json(serde_json::json!({ "from": from, "echo": body }))
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let spec = AppSpec {
        name: "minimal",
        version: env!("CARGO_PKG_VERSION"),
        ..Default::default()
    };
    let mut app = match App::from_env_and_args(spec, Router::new()) {
        Ok(app) => app,
        Err(e) => {
            eprintln!("{e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    app.api_routes(Router::new().route("/v1/echo", post(echo)));
    app.test_route(
        "POST",
        "/v1/echo",
        "application/json",
        r#"{"hello":"world"}"#,
    );
    app.run().await
}
