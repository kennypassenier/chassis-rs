//! K23's foreign git context: a repository that git itself points the child
//! processes at (as a hook would), which `chassis new` must not touch.

use std::path::{Path, PathBuf};
use std::process::Command;

/// A repository with one commit, standing in for the one being committed.
pub struct OuterRepo {
    pub path: PathBuf,
}

impl OuterRepo {
    /// `git init` plus one commit of `outer.txt`.
    pub fn create(parent: &Path) -> Self {
        let path = parent.join("outer");
        std::fs::create_dir_all(&path).unwrap();
        let repo = Self { path };
        repo.git(&["init", "-q"]);
        std::fs::write(repo.path.join("outer.txt"), "outer\n").unwrap();
        repo.git(&["add", "outer.txt"]);
        repo.git(&["commit", "-q", "-m", "outer"]);
        repo
    }

    /// Runs git in the outer repository and returns its trimmed stdout.
    pub fn git(&self, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@example.invalid"])
            .args(args)
            .current_dir(&self.path)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }
}
