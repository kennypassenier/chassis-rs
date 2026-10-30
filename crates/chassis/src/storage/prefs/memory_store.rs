//! The in-memory [`PrefStore`] adapter's behaviour, for tests of code that
//! takes the port. Its own module because it shares nothing with the sqlite
//! adapter beside the port's contract.

use super::{MemoryPrefStore, PrefFuture, PrefStore, Quota, SetOutcome, entry_bytes};

impl PrefStore for MemoryPrefStore {
    fn get<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, Option<String>> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .get(&(scope.to_string(), key.to_string()))
                .cloned())
        })
    }

    fn set<'a>(
        &'a self,
        scope: &'a str,
        key: &'a str,
        value: &'a str,
        quota: Quota,
    ) -> PrefFuture<'a, SetOutcome> {
        Box::pin(async move {
            let mut rows = self.rows.lock().expect("prefs lock");
            let id = (scope.to_string(), key.to_string());
            let (mut used, mut keys) = (0u64, 0u64);
            for ((s, k), v) in rows.iter() {
                if s == scope && k != key {
                    used += entry_bytes(k, v);
                    keys += 1;
                }
            }
            if used + entry_bytes(key, value) > quota.max_scope_bytes || keys + 1 > quota.max_keys {
                return Ok(SetOutcome::ScopeFull {
                    used_bytes: used,
                    keys,
                });
            }
            rows.insert(id, value.to_string());
            Ok(SetOutcome::Stored)
        })
    }

    fn remove<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, bool> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .remove(&(scope.to_string(), key.to_string()))
                .is_some())
        })
    }

    fn list<'a>(
        &'a self,
        scope: &'a str,
        prefix: &'a str,
    ) -> PrefFuture<'a, Vec<(String, String)>> {
        Box::pin(async move {
            Ok(self
                .rows
                .lock()
                .expect("prefs lock")
                .iter()
                .filter(|((s, k), _)| s == scope && k.starts_with(prefix))
                .map(|((_, k), v)| (k.clone(), v.clone()))
                .collect())
        })
    }
}

// ---- sqlite ---------------------------------------------------------------
