//! The kit's own stores at mount time: the kit database with the one-time
//! move of the old sealed files, the client store and the session store.

use std::sync::Arc;

use super::door::Door;
use super::{MountExtra, passkeys_wanted};
use crate::app::AppSpec;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;
use crate::shell::store::{
    ClientStore, EncryptedFile, FileClientStore, MemoryClientStore, SessionStore,
};

/// What `open` hands the rest of the mount.
#[cfg_attr(not(feature = "passkeys"), allow(dead_code))]
pub(super) struct KitStores {
    pub(super) kit: crate::storage::KitDb,
    /// The kit database took the old files; false means the old files stay
    /// in use (and a problem is on the status page).
    pub(super) use_db: bool,
    pub(super) clients: Arc<dyn ClientStore>,
    pub(super) sessions: Arc<SessionStore>,
}

/// Open the kit database and the two stores on top of it (or on the old
/// files when the move failed).
pub(super) fn open(
    spec: &AppSpec,
    loaded: &Loaded,
    door: &Door,
    client_store: Option<Arc<dyn ClientStore>>,
    extra: &MountExtra,
) -> Result<KitStores, Error> {
    let open = door.open;
    let seal_key = &door.seal_key;
    // 3.11.0: the kit's own stores live in `<name>-kit.db`, secrets sealed
    // per field with the same key. The old sealed JSON files move in once,
    // in one transaction; if that fails nothing is written and the kit runs
    // on the old files (with a problem on the status page) until it works.
    let kit_handle = match extra.storage.as_ref().and_then(|s| s.kit_db().cloned()) {
        Some(db) => db,
        None => crate::storage::Db::open(
            &loaded
                .state_dir
                .join(crate::storage::kit_file_name(spec.name)),
            &crate::storage::kit_migrations(),
        )?,
    };
    let kit = crate::storage::KitDb::new(kit_handle, seal_key.clone());
    // Open: a file name nothing ever writes (no login, no session), so a
    // sealed sessions file from a closed run is neither read nor touched.
    let sessions_file = if open {
        "sessions.open.json.enc"
    } else {
        "sessions.json.enc"
    };
    let kit_import = kit.import_legacy(&crate::storage::ImportPlan {
        state_dir: loaded.state_dir.clone(),
        clients: client_store.is_none() && !open,
        sessions_file,
        passkeys: passkeys_wanted(open, &extra.disabled),
    });
    let use_db = match kit_import {
        Ok(_) => true,
        Err(e) => {
            tracing::error!(error = %e, "the kit stores could not move into the kit database; nothing was written and the old files stay in use, the move is retried at the next start");
            if let Some(st) = &extra.storage {
                st.add_problem(crate::storage::StorageProblem {
                    what: "the clients, sessions and passkeys could not move into the kit database"
                        .into(),
                    why: format!(
                        "{}. Nothing was written; the service keeps using its old files",
                        e.message
                    ),
                    remedy: format!("{}; the move is retried at the next start", e.remedy),
                });
            }
            false
        }
    };
    if let Some(st) = &extra.storage {
        let prune_kit = kit.clone();
        st.set_kit_prune(Arc::new(move || {
            prune_kit.prune_expired_sessions(crate::shell::time::now_epoch())
        }));
    }

    let clients: Arc<dyn ClientStore> = match (client_store, open) {
        (_, true) => Arc::new(MemoryClientStore::default()),
        (Some(s), false) => s,
        (None, false) if use_db => Arc::new(crate::shell::store::DbClientStore::open(kit.clone())?),
        (None, false) => Arc::new(FileClientStore::open(EncryptedFile::new(
            loaded.state_dir.join("clients.json.enc"),
            seal_key.clone(),
            "clients store",
        ))?),
    };
    let sessions = Arc::new(if use_db {
        SessionStore::open_db(kit.clone())?
    } else {
        SessionStore::open(EncryptedFile::new(
            loaded.state_dir.join(sessions_file),
            seal_key.clone(),
            "sessions store",
        ))?
    });
    Ok(KitStores {
        kit,
        use_db,
        clients,
        sessions,
    })
}
