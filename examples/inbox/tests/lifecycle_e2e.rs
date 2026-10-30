//! E2E tests against the real `inbox` binary (K2, K5, K8, K11, K12, K13,
//! AR15, AR20) and one in-process drain test (K5). These drive what a
//! unit test cannot: the process boundary, signals, exit codes, stderr,
//! and the full client-token flow over HTTP.
//!
//! The tests are grouped by what they drive, in `lifecycle_e2e/`; `support.rs`
//! starts the real binary and is shared by all of them.

#[path = "lifecycle_e2e/api_edges.rs"]
mod api_edges;
#[path = "lifecycle_e2e/client_flow.rs"]
mod client_flow;
#[path = "lifecycle_e2e/dashboard.rs"]
mod dashboard;
#[path = "lifecycle_e2e/declared_field.rs"]
mod declared_field;
#[path = "lifecycle_e2e/hygiene.rs"]
mod hygiene;
#[path = "lifecycle_e2e/observability.rs"]
mod observability;
#[path = "lifecycle_e2e/passkeys.rs"]
mod passkeys;
#[path = "lifecycle_e2e/shutdown.rs"]
mod shutdown;
#[path = "lifecycle_e2e/startup.rs"]
mod startup;
#[path = "lifecycle_e2e/support.rs"]
mod support;
#[path = "lifecycle_e2e/update.rs"]
mod update;
