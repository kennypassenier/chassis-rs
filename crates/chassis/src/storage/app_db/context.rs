//! Helpers on [`ImportContext`] for the common case of an import hook: the
//! old data is a JSON file in the state directory. Its own module so the
//! hook's vocabulary sits apart from the transaction machinery in `import`.

use std::path::PathBuf;

use serde::de::DeserializeOwned;

use super::ImportContext;
use crate::core::error::Error;

impl ImportContext {
    /// A context for `state_dir`, so a project can unit-test its import
    /// hook with the context the kit would hand it (the struct is
    /// `non_exhaustive`, so a literal does not compile outside the kit).
    pub fn new(state_dir: impl Into<PathBuf>) -> Self {
        ImportContext {
            state_dir: state_dir.into(),
        }
    }

    /// Where an old file of the state directory lives (`<state_dir>/<name>`).
    /// Put it in [`ImportReport`](super::ImportReport)'s `files` so it is
    /// renamed `*.migrated` after the commit.
    pub fn json_path(&self, file_name: &str) -> PathBuf {
        self.state_dir.join(file_name)
    }

    /// Parse the JSON file `file_name` of the state directory. `Ok(None)`
    /// when the file is absent (a fresh install, or an import that already
    /// ran). A file that cannot be read or does not parse is an error naming
    /// the file, never an empty default: the import rolls back and the old
    /// file keeps being the truth until it is fixed.
    pub fn read_json<T: DeserializeOwned>(&self, file_name: &str) -> Result<Option<T>, Error> {
        let path = self.json_path(file_name);
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(Error::config(
                    format!("cannot read {}: {e}", path.display()),
                    "make the file readable for the service user; the import is retried at the next start",
                ));
            }
        };
        serde_json::from_slice(&bytes).map(Some).map_err(|e| {
            Error::config(
                format!("{} is not the JSON this import expects: {e}", path.display()),
                "fix or restore the file from the last backup; nothing was imported and the import is retried at the next start",
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(dir: &std::path::Path) -> ImportContext {
        ImportContext {
            state_dir: dir.to_path_buf(),
        }
    }

    #[test]
    fn new_is_the_context_the_kit_builds() {
        let c = ImportContext::new("/var/lib/x");
        assert_eq!(c.state_dir, std::path::PathBuf::from("/var/lib/x"));
        assert_eq!(
            c.json_path("a.json"),
            std::path::PathBuf::from("/var/lib/x/a.json")
        );
    }

    #[test]
    fn an_absent_file_is_none_and_a_good_one_parses() {
        let dir = tempfile::tempdir().unwrap();
        let c = ctx(dir.path());
        assert_eq!(c.read_json::<Vec<u32>>("n.json").unwrap(), None);
        std::fs::write(dir.path().join("n.json"), b"[1,2]").unwrap();
        assert_eq!(c.read_json::<Vec<u32>>("n.json").unwrap(), Some(vec![1, 2]));
        assert_eq!(c.json_path("n.json"), dir.path().join("n.json"));
    }

    #[test]
    fn a_broken_file_is_an_error_naming_it() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("n.json"), b"{nope").unwrap();
        let err = ctx(dir.path()).read_json::<Vec<u32>>("n.json").unwrap_err();
        assert!(err.message.contains("n.json"), "{}", err.message);
    }
}
