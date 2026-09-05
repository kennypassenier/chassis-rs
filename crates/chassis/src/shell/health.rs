//! `/healthz` (K6, AR12): what is running, and whether each part of it
//! is doing its job.
//!
//! The answer is JSON, open (no auth), and carries the service's own
//! `version` — the field the homelab reads after an update to learn what
//! is *running*, as opposed to what `--version` says is on disk. Each
//! registered subsystem contributes a status; the whole answer is `ok`
//! (200) unless a subsystem says otherwise, then `degraded` (503).
//!
//! Two consumers ask two different questions, and the critic's objection
//! #3 is why they are kept apart: a monitor wants "is it doing its job"
//! (this endpoint's status code), while the self-updater and the
//! container HEALTHCHECK want "is the process alive" — they treat ANY
//! well-formed answer here, 200 or 503, as alive (see `probe`).

use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::core::error::Error;

/// One subsystem's verdict.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SubsystemStatus {
    pub ok: bool,
    /// Short, human: "writable", "3 pending", "Google unreachable since 09:12".
    pub detail: String,
}

impl SubsystemStatus {
    pub fn ok(detail: impl Into<String>) -> Self {
        Self {
            ok: true,
            detail: detail.into(),
        }
    }
    pub fn failing(detail: impl Into<String>) -> Self {
        Self {
            ok: false,
            detail: detail.into(),
        }
    }
}

/// What a project registers per subsystem (AR12). `check` must be cheap
/// and must not block for long; it runs under `subsystem_check_timeout_ms`
/// and a timeout counts as failing with the detail "check timed out".
pub trait Subsystem: Send + Sync {
    fn name(&self) -> &str;
    fn check(&self) -> SubsystemStatus;
}

/// The registry the handler reads.
#[derive(Clone)]
pub struct Health {
    pub version: &'static str,
    pub check_timeout: Duration,
    subsystems: Arc<Vec<Arc<dyn Subsystem>>>,
}

impl Health {
    pub fn new(
        version: &'static str,
        check_timeout: Duration,
        subsystems: Vec<Arc<dyn Subsystem>>,
    ) -> Self {
        Self {
            version,
            check_timeout,
            subsystems: Arc::new(subsystems),
        }
    }

    /// Run every check (each bounded), assemble the report.
    pub async fn report(&self) -> Report {
        let mut subsystems = serde_json::Map::new();
        let mut all_ok = true;
        for s in self.subsystems.iter() {
            let s2 = s.clone();
            let status = match tokio::time::timeout(
                self.check_timeout,
                tokio::task::spawn_blocking(move || s2.check()),
            )
            .await
            {
                Ok(Ok(st)) => st,
                Ok(Err(_)) => SubsystemStatus::failing("check panicked"),
                Err(_) => SubsystemStatus::failing("check timed out"),
            };
            all_ok &= status.ok;
            subsystems.insert(
                s.name().to_string(),
                serde_json::to_value(&status).expect("status serialises"),
            );
        }
        Report {
            status: if all_ok { "ok" } else { "degraded" },
            version: self.version,
            subsystems: serde_json::Value::Object(subsystems),
        }
    }
}

/// The JSON shape of `/healthz`.
#[derive(Debug, Serialize)]
pub struct Report {
    pub status: &'static str,
    pub version: &'static str,
    pub subsystems: serde_json::Value,
}

impl IntoResponse for Report {
    fn into_response(self) -> Response {
        let code = if self.status == "ok" {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        };
        (code, Json(self)).into_response()
    }
}

/// The axum handler; `Health` is the router state for this route.
pub async fn healthz(State(health): State<Health>) -> Report {
    health.report().await
}

/// What `--healthcheck` learned: alive means the endpoint answered with a
/// well-formed report, whatever its status (critic #3); `degraded` is
/// reported but does not fail the probe.
#[derive(Debug, PartialEq, Eq)]
pub struct Probe {
    pub alive: bool,
    pub status: String,
    pub version: String,
}

/// GET `url` with a timeout and judge liveness. Used by `--healthcheck`
/// in containers without curl and by the autonomous updater.
pub async fn probe(url: &str, timeout: Duration) -> Result<Probe, Error> {
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| Error::internal(format!("http client: {e}"), "report this"))?;
    let res = client.get(url).send().await.map_err(|e| {
        Error::dependency(
            format!("healthcheck GET {url} failed: {e}"),
            "is the service running and listening on that address? compare with --print-config",
        )
    })?;
    let code = res.status();
    let body: serde_json::Value = res.json().await.map_err(|e| {
        Error::dependency(
            format!("healthcheck {url} answered {code} but not with the JSON report: {e}"),
            "the address may point at something that is not this service",
        )
    })?;
    let status = body["status"].as_str().unwrap_or("").to_string();
    let version = body["version"].as_str().unwrap_or("").to_string();
    Ok(Probe {
        alive: !status.is_empty() && !version.is_empty(),
        status,
        version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed(&'static str, SubsystemStatus);
    impl Subsystem for Fixed {
        fn name(&self) -> &str {
            self.0
        }
        fn check(&self) -> SubsystemStatus {
            self.1.clone()
        }
    }

    struct Slow;
    impl Subsystem for Slow {
        fn name(&self) -> &str {
            "slow"
        }
        fn check(&self) -> SubsystemStatus {
            std::thread::sleep(Duration::from_millis(300));
            SubsystemStatus::ok("late")
        }
    }

    #[tokio::test]
    async fn report_is_ok_only_when_every_subsystem_is() {
        let h = Health::new(
            "1.2.3",
            Duration::from_secs(1),
            vec![
                Arc::new(Fixed("store", SubsystemStatus::ok("writable"))),
                Arc::new(Fixed("worker", SubsystemStatus::failing("3 stuck"))),
            ],
        );
        let r = h.report().await;
        assert_eq!(r.status, "degraded");
        assert_eq!(r.version, "1.2.3");
        assert_eq!(r.subsystems["worker"]["detail"], "3 stuck");
        assert_eq!(r.into_response().status(), StatusCode::SERVICE_UNAVAILABLE);

        let h = Health::new("1.2.3", Duration::from_secs(1), vec![]);
        assert_eq!(h.report().await.into_response().status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn slow_check_is_bounded_and_counts_as_failing() {
        let h = Health::new("0.0.1", Duration::from_millis(50), vec![Arc::new(Slow)]);
        let r = h.report().await;
        assert_eq!(r.status, "degraded");
        assert_eq!(r.subsystems["slow"]["detail"], "check timed out");
    }
}
