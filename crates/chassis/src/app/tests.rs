//! Tests of the `App` builder, the control commands and a real start/stop.

use std::collections::BTreeMap;
use std::process::ExitCode;

use super::*;
use crate::shell::health::{self, SubsystemStatus};
use axum::routing::get;

mod cli;
mod config;
mod knob_table;
mod lifecycle;

fn spec() -> AppSpec {
    AppSpec {
        name: "t-app",
        version: "9.8.7",
        ..Default::default()
    }
}

fn argv(rest: &[&str]) -> Vec<String> {
    std::iter::once("t-app".to_string())
        .chain(rest.iter().map(|s| s.to_string()))
        .collect()
}

fn base_args(dir: &std::path::Path) -> Vec<&'static str> {
    let leaked: &'static str = Box::leak(dir.display().to_string().into_boxed_str());
    vec![
        "--state-dir",
        leaked,
        "--listen",
        "127.0.0.1:0",
        "--shutdown-timeout-ms",
        "2000",
        // Read only when the passkeys feature is compiled in (K9).
        "--public-url",
        "https://t.example",
    ]
}

struct Store(bool);
impl Subsystem for Store {
    fn name(&self) -> &str {
        "store"
    }
    fn check(&self) -> SubsystemStatus {
        if self.0 {
            SubsystemStatus::ok("writable")
        } else {
            SubsystemStatus::failing("read-only filesystem")
        }
    }
}

struct Scraper;
impl ScrapeSource for Scraper {
    fn scrape(&self) -> String {
        "project_things_total 7\n".to_string()
    }
}

/// The dashboard needs both secrets to start; the core-only tests set
/// them so `start()` is reachable whatever features are compiled.
fn secrets_env(dir: &std::path::Path) -> Vec<&'static str> {
    base_args(dir)
}

/// The two dashboard secrets, as the environment carries them (S8:
/// never as flags).
fn secret_map() -> BTreeMap<String, String> {
    BTreeMap::from([
        (
            "T_APP_TOKEN".to_string(),
            "a-login-token-that-is-long-enough".to_string(),
        ),
        ("T_APP_SECRET_KEY".to_string(), "ab".repeat(32)),
        (
            "T_APP_PUBLIC_URL".to_string(),
            "https://t.example".to_string(),
        ),
    ])
}

fn from_args_secret(spec: AppSpec, args: Vec<String>, router: Router) -> Result<App, Error> {
    App::from_args_with_env(spec, args, secret_map(), router)
}
