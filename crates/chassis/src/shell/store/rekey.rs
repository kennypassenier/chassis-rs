//! `rekey`: re-sealing every store under a new key. Its own module because
//! it is a one-off maintenance walk, unrelated to normal reads and writes.

use std::path::Path;

use super::EncryptedFile;
use crate::core::crypto::Key;
use crate::core::error::Error;

/// Body of [`super::rekey_dir`].
pub(super) fn run(dir: &Path, old: &Key, new: &Key) -> Result<usize, Error> {
    let entries = std::fs::read_dir(dir).map_err(|e| {
        Error::config(
            format!("cannot read the state directory {}: {e}", dir.display()),
            "check the path and its permissions",
        )
    })?;
    let mut done = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.ends_with(".json.enc") {
            continue;
        }
        let with_new = EncryptedFile::new(path.clone(), new.clone(), "store");
        if with_new.load::<serde_json::Value>().is_ok() {
            continue; // already under the new key
        }
        let with_old = EncryptedFile::new(path.clone(), old.clone(), "store");
        let value: serde_json::Value = with_old
            .load()
            .map_err(|e| {
                Error::config(
                    format!("{name} opens with neither the old nor the new key: {}", e.message),
                    "the OLD_SECRET_KEY is not the key this file was sealed with; find the key that wrote it (the environment file before the rotation)",
                )
            })?
            .unwrap_or(serde_json::Value::Null);
        with_new.save(&value)?;
        done += 1;
    }
    Ok(done)
}
