//! The numbered schema migrations: each step runs in its own transaction
//! together with the `user_version` bump, and a database newer than the
//! binary is refused. Its own module because it is the one place that
//! decides how a schema moves forward; `Migration`'s constructors sit here
//! too.

use std::sync::Arc;

use rusqlite::{Connection, Transaction, TransactionBehavior};

use super::Migration;
use crate::core::error::Error;

pub(super) fn migrate(
    conn: &mut Connection,
    migrations: &[Migration],
    path: &str,
) -> Result<usize, Error> {
    let current: usize =
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
    if current > migrations.len() {
        return Err(Error::config(
            format!(
                "the database {path} is schema {current} but this build knows {}",
                migrations.len()
            ),
            "it was written by a newer build; run that build, or restore the pre-update copy (<name>-pre-update/<version>/) taken before the update",
        ));
    }
    for (i, step) in migrations.iter().enumerate().skip(current) {
        let version = i + 1;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        // Another process starting at the same moment may have applied this
        // step between the read above and the lock: look again under it.
        let applied = tx.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
        if applied >= version {
            continue;
        }
        (step.0)(&tx).map_err(|e| {
            Error::new(
                e.kind,
                format!(
                    "migration {version} of {path} failed and was rolled back: {}",
                    e.message
                ),
                e.remedy,
            )
        })?;
        // `user_version` takes no bound parameter; the number is ours.
        tx.execute_batch(&format!("PRAGMA user_version = {version}"))?;
        tx.commit()?;
        tracing::info!(file = path, version, "database migrated");
    }
    Ok(migrations.len())
}

impl Migration {
    /// A step that is a batch of SQL statements.
    pub fn sql(sql: &'static str) -> Self {
        Migration(Arc::new(move |tx| {
            tx.execute_batch(sql).map_err(Error::from)
        }))
    }

    /// A step that is code, for a change SQL alone cannot make (copying
    /// rows through a transformation).
    pub fn code(f: impl Fn(&Transaction) -> Result<(), Error> + Send + Sync + 'static) -> Self {
        Migration(Arc::new(f))
    }
}
