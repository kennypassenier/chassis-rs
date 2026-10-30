//! The sqlite [`PrefStore`] adapter's behaviour over the `chassis_prefs`
//! table. Its own module because it holds every SQL statement of the
//! preferences, apart from the in-memory reference adapter.

use rusqlite::params;

use super::{PrefFuture, PrefStore, Quota, SetOutcome, SqlitePrefStore, entry_bytes};

fn now_secs() -> i64 {
    crate::shell::time::now_epoch() as i64
}

impl PrefStore for SqlitePrefStore {
    fn get<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, Option<String>> {
        let (scope, key) = (scope.to_string(), key.to_string());
        Box::pin(async move {
            self.db
                .read(move |c| {
                    use rusqlite::OptionalExtension;
                    Ok(c.query_row(
                        "SELECT value FROM chassis_prefs WHERE scope = ?1 AND key = ?2",
                        params![scope, key],
                        |r| r.get(0),
                    )
                    .optional()?)
                })
                .await
        })
    }

    fn set<'a>(
        &'a self,
        scope: &'a str,
        key: &'a str,
        value: &'a str,
        quota: Quota,
    ) -> PrefFuture<'a, SetOutcome> {
        let (scope, key, value) = (scope.to_string(), key.to_string(), value.to_string());
        Box::pin(async move {
            self.db
                .write(move |tx| {
                    let (used, keys): (i64, i64) = tx.query_row(
                        "SELECT COALESCE(SUM(length(CAST(key AS BLOB)) + length(CAST(value AS BLOB))), 0), COUNT(*) \
                         FROM chassis_prefs WHERE scope = ?1 AND key <> ?2",
                        params![scope, key],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )?;
                    let (used, keys) = (used.max(0) as u64, keys.max(0) as u64);
                    if used + entry_bytes(&key, &value) > quota.max_scope_bytes
                        || keys + 1 > quota.max_keys
                    {
                        return Ok(SetOutcome::ScopeFull {
                            used_bytes: used,
                            keys,
                        });
                    }
                    tx.execute(
                        "INSERT INTO chassis_prefs (scope, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) \
                         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                        params![scope, key, value, now_secs()],
                    )?;
                    Ok(SetOutcome::Stored)
                })
                .await
        })
    }

    fn remove<'a>(&'a self, scope: &'a str, key: &'a str) -> PrefFuture<'a, bool> {
        let (scope, key) = (scope.to_string(), key.to_string());
        Box::pin(async move {
            self.db
                .write(move |tx| {
                    Ok(tx.execute(
                        "DELETE FROM chassis_prefs WHERE scope = ?1 AND key = ?2",
                        params![scope, key],
                    )? > 0)
                })
                .await
        })
    }

    fn list<'a>(
        &'a self,
        scope: &'a str,
        prefix: &'a str,
    ) -> PrefFuture<'a, Vec<(String, String)>> {
        let (scope, prefix) = (scope.to_string(), prefix.to_string());
        Box::pin(async move {
            self.db
                .read(move |c| {
                    // `substr` counts characters on both sides; no LIKE, so
                    // `%` and `_` in a prefix mean themselves.
                    let mut stmt = c.prepare(
                        "SELECT key, value FROM chassis_prefs \
                         WHERE scope = ?1 AND substr(key, 1, length(?2)) = ?2 ORDER BY key",
                    )?;
                    let rows = stmt
                        .query_map(params![scope, prefix], |r| Ok((r.get(0)?, r.get(1)?)))?
                        .collect::<Result<Vec<_>, _>>()?;
                    Ok(rows)
                })
                .await
        })
    }
}
