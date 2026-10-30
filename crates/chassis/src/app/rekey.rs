//! The `rekey` subcommand: re-encrypt every store from
//! `<P>_OLD_SECRET_KEY` to `<P>_SECRET_KEY` (K8, critic #11). Its own module
//! because it is the one control command with several steps of its own.

use std::process::ExitCode;

use super::App;
use crate::core::crypto::Key;
use crate::core::error::Error;
use crate::shell::config_load::Loaded;

impl App {
    /// Re-seal the store files (and the kit database's sealed fields) under
    /// the new key, then say what was done.
    pub(super) fn control_rekey(&self) -> Result<Option<ExitCode>, Error> {
        let loaded = self.loaded.as_ref().expect("loaded");
        let prefix = self.spec.prefix();
        let new_key = new_secret_key(loaded, &prefix)?;
        let old_env = format!("{prefix}_OLD_SECRET_KEY");
        let old_key = old_secret_key(&prefix, &old_env)?;
        let done = crate::shell::store::rekey_dir(&loaded.state_dir, &old_key, &new_key)?;
        let fields = self.rekey_kit_fields(loaded, &old_key, &new_key)?;
        let db_note = fields.map_or_else(String::new, |n| {
            format!(" and {n} sealed field(s) in {}-kit.db", self.spec.name)
        });
        println!(
            "{}: {} store file(s){db_note} in {} now sealed under {prefix}_SECRET_KEY; unset {old_env} and start the service",
            self.spec.name,
            done,
            loaded.state_dir.display()
        );
        Ok(Some(ExitCode::SUCCESS))
    }

    /// 3.11.0: the sealed fields of the kit database too, in one
    /// transaction; a service that never ran 3.11 has no such file.
    #[cfg(all(feature = "storage", feature = "dashboard"))]
    fn rekey_kit_fields(
        &self,
        loaded: &Loaded,
        old_key: &Key,
        new_key: &Key,
    ) -> Result<Option<usize>, Error> {
        let kit = loaded
            .state_dir
            .join(crate::storage::kit_file_name(self.spec.name));
        Ok(if kit.exists() {
            Some(crate::storage::rekey_kit_file(&kit, old_key, new_key)?)
        } else {
            None
        })
    }

    /// Without the kit database there are no sealed fields to re-seal.
    #[cfg(not(all(feature = "storage", feature = "dashboard")))]
    fn rekey_kit_fields(
        &self,
        _loaded: &Loaded,
        _old_key: &Key,
        _new_key: &Key,
    ) -> Result<Option<usize>, Error> {
        Ok(None)
    }
}

/// The NEW key, from `<P>_SECRET_KEY` (with the dashboard, validated the
/// way the login validates it).
#[cfg(feature = "dashboard")]
fn new_secret_key(loaded: &Loaded, prefix: &str) -> Result<Key, Error> {
    let secrets = crate::shell::auth::Secrets::parse(
        prefix,
        loaded.get("token"),
        loaded.get("secret_key"),
    )?
    .ok_or_else(|| {
        Error::config(
            format!("rekey needs the NEW key in {prefix}_SECRET_KEY (with {prefix}_TOKEN)"),
            "export the new pair, the previous key as {prefix}_OLD_SECRET_KEY, then run rekey again",
        )
    })?;
    Ok(secrets.key.clone())
}

/// The NEW key, from `<P>_SECRET_KEY`.
#[cfg(not(feature = "dashboard"))]
fn new_secret_key(loaded: &Loaded, prefix: &str) -> Result<Key, Error> {
    let mut candidate = [0u8; 32];
    getrandom::fill(&mut candidate)
        .map_err(|e| Error::internal(format!("random: {e}"), "report this"))?;
    let env = format!("{prefix}_SECRET_KEY");
    let raw = loaded
        .get("secret_key")
        .ok_or_else(|| Error::config(format!("{env} is not set"), "export the new key first"))?;
    Key::parse_hex(&env, raw, &hex::encode(candidate))
}

/// The previous key, from the environment variable `old_env` (never from
/// the config file: it must not outlive the rekey).
fn old_secret_key(prefix: &str, old_env: &str) -> Result<Key, Error> {
    let old_raw = std::env::var(old_env).map_err(|_| {
        Error::config(
            format!("{old_env} is not set"),
            format!("export the previous secret key as {old_env} and the new one as {prefix}_SECRET_KEY, stop the service, then run rekey"),
        )
    })?;
    let mut candidate = [0u8; 32];
    getrandom::fill(&mut candidate)
        .map_err(|e| Error::internal(format!("random: {e}"), "report this"))?;
    Key::parse_hex(old_env, &old_raw, &hex::encode(candidate))
}
