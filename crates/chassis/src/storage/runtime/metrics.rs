//! The `/metrics` view of the budget: the sizes of the files, the budget,
//! the warn line and the level. Its own module because it only reads the
//! last report and renders text, apart from the monitor that produces it.

use super::Storage;

impl Storage {
    /// `/metrics`: `<prefix>_storage_bytes{file}`, the budget, the warn line
    /// and the level (0 ok, 1 warn, 2 over).
    pub(crate) fn metrics(&self, prefix: String) -> StorageMetrics {
        StorageMetrics {
            storage: self.clone(),
            prefix,
        }
    }
}

pub(crate) struct StorageMetrics {
    storage: Storage,
    prefix: String,
}

impl crate::shell::metrics::ScrapeSource for StorageMetrics {
    fn scrape(&self) -> String {
        let Some(r) = self
            .storage
            .inner
            .report
            .lock()
            .expect("report lock")
            .clone()
        else {
            return String::new();
        };
        let p = &self.prefix;
        let mut out = format!(
            "# HELP {p}_storage_bytes Size of a storage file on disk, log included.\n# TYPE {p}_storage_bytes gauge\n"
        );
        for f in &r.files {
            out.push_str(&format!(
                "{p}_storage_bytes{{file=\"{}\"}} {}\n",
                f.role, f.total_bytes
            ));
        }
        let level = r.level as u8;
        out.push_str(&format!(
            "# HELP {p}_storage_budget_bytes The storage budget; it only warns.\n# TYPE {p}_storage_budget_bytes gauge\n{p}_storage_budget_bytes {}\n# HELP {p}_storage_warn_bytes The size at which storage warns.\n# TYPE {p}_storage_warn_bytes gauge\n{p}_storage_warn_bytes {}\n# HELP {p}_storage_level 0 ok, 1 past the warn line, 2 past the budget.\n# TYPE {p}_storage_level gauge\n{p}_storage_level {level}\n",
            r.budget_bytes, r.warn_bytes
        ));
        out
    }
}
