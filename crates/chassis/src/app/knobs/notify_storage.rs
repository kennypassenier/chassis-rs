//! The notification (K22) and storage knobs: webhook delivery, the outbox,
//! the health sampler, the storage budget and the synced preferences limits.

use super::{NOTIFY, STORAGE, k};
use crate::core::config::Knob;

pub(super) fn rows() -> Vec<Knob> {
    vec![
        // L5 — notifications (K22)
        k(
            "notify_timeout_secs",
            Some("10"),
            NOTIFY,
            "Seconds allowed per webhook attempt.",
        ),
        k(
            "notify_retries",
            Some("3"),
            NOTIFY,
            "Retries per webhook target before the fallback is tried.",
        ),
        k(
            "notify_backoff_base_ms",
            Some("500"),
            NOTIFY,
            "Milliseconds before the first webhook retry.",
        ),
        k(
            "notify_backoff_cap_ms",
            Some("30000"),
            NOTIFY,
            "Largest delay, in milliseconds, between webhook retries.",
        ),
        k(
            "notify_queue_size",
            Some("1024"),
            NOTIFY,
            "Events waiting for delivery; a full queue drops the event with a warning.",
        ),
        k(
            "notify_url",
            None,
            NOTIFY,
            "Primary notification target: where every event goes first (a kyu topic such as http://hub.example:8080/t/ops.alerts). Unset = no target. Fixes the address on the Status page's Notifications card; put a webhook id in through ${VAR} or the environment, never in the file.",
        ),
        k(
            "notify_fallback_url",
            None,
            NOTIFY,
            "Fallback notification target, asked once when the primary does not take a message (for example a Home Assistant webhook address). Unset = no fallback. Same rules as notify_url.",
        ),
        k(
            "notify_outbox_max",
            Some("5000"),
            NOTIFY,
            "Most unsent messages kept on disk; past it the oldest are dropped and counted.",
        ),
        k(
            "health_sample_secs",
            Some("30"),
            NOTIFY,
            "Seconds between health samples for `health.degraded` and `health.recovered`.",
        ),
        k(
            "storage_budget_mb",
            Some("50"),
            STORAGE,
            "Megabytes both database files may take together before the kit warns (status page, metrics, hook); it never refuses a write.",
        ),
        k(
            "storage_warn_mb",
            Some("40"),
            STORAGE,
            "Megabytes at which storage starts to warn; 80 % of the budget when the budget is changed in code and this is not set.",
        ),
        k(
            "prefs_max_value_bytes",
            Some("16384"),
            STORAGE,
            "Largest synced browser preference (one localStorage value), in bytes; only used by a service that declares App::sync_browser_keys.",
        ),
        k(
            "prefs_max_scope_bytes",
            Some("262144"),
            STORAGE,
            "Most bytes (keys plus values) the synced preferences of one login may take in total.",
        ),
        k(
            "prefs_max_keys",
            Some("512"),
            STORAGE,
            "Most synced preferences one login may hold.",
        ),
    ]
}
