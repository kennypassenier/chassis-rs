//! Tests of the self-update. Shared fixtures (a signed fake release, a
//! config, a sink) live here; the tests are grouped by topic in the children.

mod events;
mod install;
mod loops;
mod startup;
mod trust;

use super::*;
use crate::shell::install_binary::prev_link_remedy;
use std::sync::atomic::{AtomicUsize, Ordering};

/// The signed fake release lives in `chassis::testing` (K25); these
/// two wrappers keep the suite's call sites and the repo it signs for.
type FakeRelease = crate::testing::FakeReleaseServer;

const TEST_REPO: &str = "kennypassenier/svc";

async fn fake_release(version: &str, binary: &[u8], asset: &str) -> FakeRelease {
    FakeRelease::start(TEST_REPO, version, binary, asset).await
}

/// A release whose trusted comment is `comment` (S1 tests a wrong one).
async fn fake_release_signed_as(
    version: &str,
    binary: &[u8],
    asset: &str,
    comment: &str,
) -> FakeRelease {
    FakeRelease::start_signed_as(version, binary, asset, comment).await
}

/// A "binary" that passes --check: a shell script exiting 0.
const GOOD_BINARY: &[u8] = b"#!/bin/sh\nexit 0\n";
const BAD_BINARY: &[u8] = b"#!/bin/sh\necho 'config broken. What now: fix it' >&2\nexit 1\n";

fn cfg(release: &FakeRelease, mode: Mode, copies_dir: PathBuf) -> UpdateConfig {
    UpdateConfig {
        mode,
        url: release.url.clone(),
        asset_name: "svc".into(),
        interval: Duration::from_secs(3600),
        startup_delay: Duration::from_millis(1),
        healthy_after: Duration::from_millis(1),
        max_start_attempts: 2,
        hold: Hold::None,
        drill: None,
        keep_copies: 2,
        probe_timeout: Duration::from_secs(5),
        download_timeout: Duration::from_secs(5),
        pubkey: release.pubkey.clone(),
        pubkey_overridden: false,
        repo: Some(TEST_REPO.to_string()),
        allow_insecure: true,
        max_download_bytes: 64 * 1024 * 1024,
        copies_dir,
        gate: None,
        notify_after_failures: 3,
    }
}

fn sink() -> (EventSink, Arc<Mutex<Vec<Event>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let s2 = seen.clone();
    (Arc::new(move |e| s2.lock().unwrap().push(e)), seen)
}

fn installed(dir: &Path, bytes: &[u8]) -> PathBuf {
    let bin = dir.join("bin").join("svc");
    std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
    write_executable(&bin, bytes).unwrap();
    bin
}

/// A local port that refuses at once. A fixed low port (1, 9) is not
/// that everywhere: on WSL2 a connect there hangs until the timeout.
fn refused_url(path: &str) -> String {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    drop(l);
    format!("http://127.0.0.1:{port}{path}")
}
