//! The dry run's undo: snapshot the files a release bumps and put them back
//! byte for byte on drop. Its own module because the guarantee (success or
//! not, the tree is as found) is separate from the order of the release steps.

use std::path::{Path, PathBuf};

/// A dry run's promise to leave the tree as it found it: the bumped files
/// are put back byte for byte when the release returns, success or not.
pub(crate) struct Restore {
    files: Vec<(PathBuf, Option<Vec<u8>>)>,
}

impl Restore {
    pub(crate) fn snapshot(paths: &[&Path]) -> Self {
        Self {
            files: paths
                .iter()
                .map(|p| (p.to_path_buf(), std::fs::read(p).ok()))
                .collect(),
        }
    }
}

impl Drop for Restore {
    fn drop(&mut self) {
        for (path, bytes) in &self.files {
            let _ = match bytes {
                Some(b) => std::fs::write(path, b),
                None => std::fs::remove_file(path),
            };
        }
    }
}
