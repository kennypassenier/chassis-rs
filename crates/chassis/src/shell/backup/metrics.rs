//! The `/metrics` view of the backup pause. Its own module because it is the
//! one piece that speaks the Prometheus text format; the gate stays free of it.

use super::*;

/// `<prefix>_backup_paused` (0/1) and `<prefix>_backup_paused_since_seconds`
/// (unix time, 0 when running) for `/metrics`.
pub(crate) struct PauseMetrics(pub String);

impl crate::shell::metrics::ScrapeSource for PauseMetrics {
    fn scrape(&self) -> String {
        let (paused, since) = {
            let s = state();
            (u8::from(s.paused), if s.paused { s.since } else { 0 })
        };
        let p = &self.0;
        format!(
            "# HELP {p}_backup_paused 1 while a backup pause holds the state's writes.\n# TYPE {p}_backup_paused gauge\n{p}_backup_paused {paused}\n# HELP {p}_backup_paused_since_seconds Unix time the backup pause in force began; 0 when none.\n# TYPE {p}_backup_paused_since_seconds gauge\n{p}_backup_paused_since_seconds {since}\n"
        )
    }
}
