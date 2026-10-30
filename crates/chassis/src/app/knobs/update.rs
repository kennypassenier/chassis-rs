//! The self-update knobs (L5, A3): mode, release host, intervals, probation,
//! trust root and failure notices.

use super::{UPDATE, k};
use crate::core::config::Knob;

pub(super) fn rows() -> Vec<Knob> {
    vec![
        // L5 — self-update (K18–K21)
        k(
            "update_mode",
            Some("off"),
            UPDATE,
            "Who installs updates: `off`, `supervised` (the homelab runs `<name> update`) or `autonomous` (the process itself).",
        ),
        k(
            "update_url",
            None,
            UPDATE,
            "Directory URL holding `VERSION`, `SHA256SUMS`, `SHA256SUMS.minisig` and the binary; default the latest GitHub release of the service's repository.",
        ),
        k(
            "update_asset",
            None,
            UPDATE,
            "The binary's asset name in the release manifest; default the service name.",
        ),
        k(
            "update_interval_secs",
            Some("21600"),
            UPDATE,
            "Seconds between release checks.",
        ),
        k(
            "update_startup_delay_secs",
            Some("300"),
            UPDATE,
            "Seconds after start before the first release check.",
        ),
        k(
            "update_healthy_after_secs",
            Some("60"),
            UPDATE,
            "Seconds an autonomously installed version must serve before it counts as proven.",
        ),
        k(
            "update_max_start_attempts",
            Some("2"),
            UPDATE,
            "Starts an unproven version gets before the previous binary is restored.",
        ),
        k(
            "update_hold",
            Some(""),
            UPDATE,
            "Pin a version (`1.4.0` or `pin:1.4.0`) or refuse exactly one (`skip:1.4.0`); empty holds nothing.",
        ),
        k(
            "update_drill",
            Some(""),
            UPDATE,
            "`broken` or `broken-after-ready` runs the broken-release drill; empty otherwise.",
        ),
        k(
            "update_keep_copies",
            Some("3"),
            UPDATE,
            "Pre-update state copies kept.",
        ),
        k(
            "update_probe_timeout_secs",
            Some("30"),
            UPDATE,
            "Seconds the staged binary's `--check` may take.",
        ),
        k(
            "update_download_timeout_secs",
            Some("300"),
            UPDATE,
            "Seconds allowed per download.",
        ),
        k(
            "update_copies_dir",
            None,
            UPDATE,
            "Where pre-update state copies go; default `<state_dir>-pre-update`, beside the state root.",
        ),
        k(
            "update_pubkey",
            None,
            UPDATE,
            "A minisign public key (base64 line) replacing the compiled-in one, for drills and staging.",
        ),
        k(
            "update_allow_insecure",
            Some("false"),
            UPDATE,
            "Allow a plain `http://` release host (`true` or `false`).",
        ),
        k(
            "update_max_download_bytes",
            Some("268435456"),
            UPDATE,
            "An asset above this many bytes is refused before it is read in full.",
        ),
        // A3 (1.4.0) — say it once, after N consecutive failed checks
        k(
            "update_notify_after_failures",
            Some("3"),
            UPDATE,
            "Consecutive failed release checks before `update.failed` is emitted once; `update.ok` follows the next success.",
        ),
        k(
            "timeout_stop_secs",
            None,
            None,
            "Mirror of the unit's `TimeoutStopSec`, in seconds, so `--check` can warn when it is shorter than `shutdown_timeout_ms`.",
        ),
    ]
}
