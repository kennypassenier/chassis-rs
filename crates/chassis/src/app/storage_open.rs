//! The two stores `App::start` opens before anything serves: the synced
//! preferences service and the sqlite files with their budget monitor.

#[cfg(feature = "dashboard")]
use std::sync::Arc;

use super::limits::parse_u64;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

/// 3.12.0: the preferences service. The limits come from the knobs when
/// one is set by flag, environment or file, else from the declaration,
/// else the kit's defaults; the service's own login token and key can
/// never be stored as a value.
#[cfg(feature = "dashboard")]
pub(super) fn build_prefs(
    loaded: &Loaded,
    keys: crate::storage::BrowserKeys,
    store: Option<Arc<dyn crate::storage::PrefStore>>,
    app: Option<&crate::storage::AppDb>,
) -> Result<crate::storage::Prefs, Error> {
    use crate::core::config::Source;
    let mut limits = keys.code_limits();
    let fixed = |key: &str, min: u64, into: &mut u64| -> Result<(), Error> {
        if matches!(
            loaded.source(key),
            Some(Source::Flag) | Some(Source::Env) | Some(Source::File)
        ) {
            *into = parse_u64(loaded, key, min)?;
        }
        Ok(())
    };
    fixed("prefs_max_value_bytes", 1, &mut limits.max_value_bytes)?;
    fixed("prefs_max_scope_bytes", 1, &mut limits.max_scope_bytes)?;
    fixed("prefs_max_keys", 1, &mut limits.max_keys)?;
    if limits.max_scope_bytes < limits.max_value_bytes {
        return Err(Error::config(
            "the preference scope limit is below the value limit",
            "raise prefs_max_scope_bytes or lower prefs_max_value_bytes",
        ));
    }
    let store: Arc<dyn crate::storage::PrefStore> = match (store, app) {
        (Some(s), _) => s,
        (None, Some(app)) => Arc::new(crate::storage::SqlitePrefStore::new(app.clone())),
        (None, None) => {
            return Err(Error::config(
                "the preferences have no store",
                "call App::app_db or App::prefs_store",
            ));
        }
    };
    let own: Vec<String> = ["token", "secret_key"]
        .iter()
        .filter_map(|k| loaded.get(k).map(str::to_string))
        .collect();
    Ok(crate::storage::Prefs::new(store, keys, limits).forbid_values(own))
}

/// Open the sqlite files for `start` and build the budget monitor. The
/// app's file is installed into the handle `App::app_db` returned; every
/// file joins `dbs`, which the backup pause and the pre-update copy read.
#[cfg(feature = "storage")]
pub(super) struct StorageSetup {
    pub(super) app_db: Option<(crate::storage::AppDb, crate::storage::AppDbSpec)>,
    pub(super) kinds: Vec<crate::storage::DataKind>,
    pub(super) budget: Option<(u64, Option<u64>)>,
    pub(super) hook: Option<crate::storage::WarnHook>,
}

#[cfg(feature = "storage")]
pub(super) fn open_storage(
    loaded: &Loaded,
    name: &str,
    prefix: &str,
    kit_db: Option<crate::storage::Db>,
    setup: StorageSetup,
    dbs: &mut Vec<crate::storage::Db>,
) -> Result<crate::storage::Storage, Error> {
    use crate::core::config::Source;
    use crate::storage::{Storage, StorageConfig};
    let StorageSetup {
        app_db,
        kinds,
        budget,
        hook,
    } = setup;
    // Precedence: environment / flag / file, then the page setting (read by
    // `Storage::new`), then App::storage_budget, then the default.
    let fixed = |key: &str| -> Result<Option<crate::storage::Fixed>, Error> {
        let by = match loaded.source(key) {
            Some(Source::Flag) => "flag",
            Some(Source::Env) => "env",
            Some(Source::File) => "file",
            _ => return Ok(None),
        };
        let name = match by {
            "flag" => format!("--{}", key.replace('_', "-")),
            "env" => format!("{prefix}_{}", key.to_ascii_uppercase()),
            _ => key.to_string(),
        };
        Ok(Some(crate::storage::Fixed {
            mb: parse_u64(loaded, key, 1)?,
            by,
            name,
        }))
    };
    let setup = crate::storage::BudgetSetup {
        fixed_budget: fixed("storage_budget_mb")?,
        fixed_warn: fixed("storage_warn_mb")?,
        code_budget_mb: budget.map_or(StorageConfig::DEFAULT_BUDGET_MB, |b| b.0),
        code_warn_mb: budget.and_then(|b| b.1),
        code_budget_set: budget.is_some(),
    };
    // A budget and warn line that cannot hold together still stop the start.
    setup.validate_start()?;
    let app = match app_db {
        Some((handle, spec)) => {
            let path = loaded.state_dir.join(format!("{name}.db"));
            handle.install(&path, spec, kinds)?;
            dbs.push(handle.db()?.clone());
            Some(handle)
        }
        None if kinds.is_empty() => None,
        None => {
            return Err(Error::config(
                "App::storage_kind was called but the service has no app database",
                "call App::app_db first; a kind describes data in that file",
            ));
        }
    };
    if let Some(kit) = &kit_db {
        dbs.push(kit.clone());
    }
    let storage = Storage::new(setup, app, kit_db, hook);
    if let Err(e) = storage.check() {
        tracing::warn!(error = %e, "storage: the first budget check failed");
    }
    Ok(storage)
}
