//! Install a binary at any path, keeping the old one as `<path>.prev`, and
//! roll back (homelab-shared-2).
//!
//! The mechanism `Updater` always used (critic #1): hard-link the old binary
//! to `<path>.prev`, then ONE `rename(staging, path)`. `path` exists at every
//! instant and `.prev` is always the binary that was replaced. It lives here
//! so a project that installs other binaries (a host's native services, a
//! sibling tool) uses the same code as the kit's own self-update, and
//! `Updater` calls it rather than carrying a second copy.

use std::path::{Path, PathBuf};

use crate::core::error::Error;

/// `<path><suffix>` beside `path` (`bin` + `.prev` = `bin.prev`).
pub(crate) fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "binary".to_string());
    name.push_str(suffix);
    path.with_file_name(name)
}

/// Where the replaced binary of `path` is kept.
pub fn prev_path(path: &Path) -> PathBuf {
    with_suffix(path, ".prev")
}

pub(crate) fn fsync_dir(path: &Path) {
    if let Some(dir) = path.parent()
        && let Ok(d) = std::fs::File::open(dir)
    {
        let _ = d.sync_all();
    }
}

/// The remedy when `bin` cannot be hard-linked to `bin.prev`. Two causes
/// give the same EPERM: a directory the service user cannot write, and a
/// binary another user owns — Linux's `fs.protected_hardlinks` refuses a
/// hard link to a file the caller does not own, however writable the
/// directory is. kyu met the second on CT 109 (2026-09-20): a root-owned
/// binary in a kyu-owned directory, while the old text blamed the directory.
pub(crate) fn prev_link_remedy(binary: &Path) -> String {
    use std::os::unix::fs::MetadataExt;
    let owner = std::fs::metadata(binary)
        .map(|m| format!("uid {}:gid {}", m.uid(), m.gid()))
        .unwrap_or_else(|_| "an unknown owner".to_string());
    let dir = binary
        .parent()
        .map(|d| d.display().to_string())
        .unwrap_or_else(|| ".".to_string());
    format!(
        "the binary is owned by {owner}; the service user must own it (install it with `install -o <user> -g <group>`), \
         because Linux refuses a hard link to a file another user owns; and it needs write access to {dir} \
         (ReadWritePaths in the unit), not only to the binary"
    )
}

/// Replace `target` with the already-written `staged` file (same
/// directory, so the rename never crosses a filesystem). The old `target`,
/// if any, stays as `target.prev`; the new file takes the old one's mode.
/// The staged file is consumed on success and removed on failure.
pub(crate) fn install_staged(staged: &Path, target: &Path) -> Result<(), Error> {
    let prev = prev_path(target);
    let fail = |e: Error| {
        let _ = std::fs::remove_file(staged);
        e
    };
    if let Ok(meta) = std::fs::metadata(target) {
        let _ = std::fs::set_permissions(staged, meta.permissions());
        let _ = std::fs::remove_file(&prev);
        std::fs::hard_link(target, &prev).map_err(|e| {
            fail(Error::config(
                format!("cannot keep the previous binary at {}: {e}", prev.display()),
                prev_link_remedy(target),
            ))
        })?;
    }
    std::fs::rename(staged, target).map_err(|e| {
        let _ = std::fs::remove_file(&prev);
        fail(Error::config(
            format!("cannot install the new binary at {}: {e}", target.display()),
            "nothing changed; check the directory's permissions",
        ))
    })?;
    fsync_dir(target);
    Ok(())
}

/// Install `bytes` at `target` atomically. The old binary is kept as
/// `<target>.prev` and the new one has the old one's mode (0755 when there
/// was none). The file and its directory are fsynced, so a power cut leaves
/// either the old binary or the new one. A second install replaces `.prev`
/// with the binary it just replaced.
pub fn install_binary(target: &Path, bytes: &[u8]) -> Result<(), Error> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    let staging = with_suffix(target, ".new");
    let io = |what: &str, e: std::io::Error| {
        let _ = std::fs::remove_file(&staging);
        Error::config(
            format!("cannot {what} {}: {e}", staging.display()),
            "check free space and that the directory is writable for this user",
        )
    };
    let mut f = std::fs::File::create(&staging).map_err(|e| io("create", e))?;
    f.write_all(bytes).map_err(|e| io("write", e))?;
    f.set_permissions(std::fs::Permissions::from_mode(0o755))
        .map_err(|e| io("mark executable", e))?;
    f.sync_all().map_err(|e| io("sync", e))?;
    drop(f);
    install_staged(&staging, target)
}

/// Put `prev` back as `target` (one rename), for a caller that recorded
/// where the previous binary is.
pub(crate) fn restore_from(prev: &Path, target: &Path) -> Result<(), Error> {
    std::fs::rename(prev, target).map_err(|e| {
        Error::config(
            format!(
                "cannot restore {} over {}: {e}",
                prev.display(),
                target.display()
            ),
            "there is no previous binary to go back to; install the version you want with install_binary",
        )
    })?;
    fsync_dir(target);
    Ok(())
}

/// Roll back: `<target>.prev` becomes `target` again. The binary that was
/// rolled back from is gone afterwards, and so is `.prev`; a second rollback
/// therefore fails with a remedy instead of flipping back.
pub fn rollback_binary(target: &Path) -> Result<(), Error> {
    restore_from(&prev_path(target), target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn mode(p: &Path) -> u32 {
        std::fs::metadata(p).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn install_keeps_the_old_binary_as_prev_and_keeps_the_mode() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("svc");
        std::fs::write(&bin, b"v1").unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o750)).unwrap();
        install_binary(&bin, b"v2").unwrap();
        assert_eq!(std::fs::read(&bin).unwrap(), b"v2");
        assert_eq!(std::fs::read(prev_path(&bin)).unwrap(), b"v1");
        assert_eq!(mode(&bin), 0o750, "the old mode is kept");
        assert!(!with_suffix(&bin, ".new").exists(), "no staging left");
    }

    #[test]
    fn a_first_install_has_no_prev_and_is_executable() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("fresh");
        install_binary(&bin, b"v1").unwrap();
        assert_eq!(std::fs::read(&bin).unwrap(), b"v1");
        assert_eq!(mode(&bin), 0o755);
        assert!(!prev_path(&bin).exists());
    }

    #[test]
    fn installing_twice_keeps_only_the_binary_just_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("svc");
        std::fs::write(&bin, b"v1").unwrap();
        install_binary(&bin, b"v2").unwrap();
        install_binary(&bin, b"v3").unwrap();
        assert_eq!(std::fs::read(&bin).unwrap(), b"v3");
        assert_eq!(std::fs::read(prev_path(&bin)).unwrap(), b"v2");
    }

    #[test]
    fn rollback_restores_prev_and_a_second_one_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("svc");
        std::fs::write(&bin, b"v1").unwrap();
        install_binary(&bin, b"v2").unwrap();
        rollback_binary(&bin).unwrap();
        assert_eq!(std::fs::read(&bin).unwrap(), b"v1");
        assert!(!prev_path(&bin).exists());
        let err = rollback_binary(&bin).unwrap_err();
        assert!(err.message.contains("cannot restore"), "{err}");
        assert_eq!(std::fs::read(&bin).unwrap(), b"v1", "untouched");
    }

    #[test]
    fn rollback_without_a_prev_fails_with_a_remedy_and_changes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("svc");
        std::fs::write(&bin, b"only").unwrap();
        let err = rollback_binary(&bin).unwrap_err();
        assert!(!err.remedy.is_empty());
        assert_eq!(std::fs::read(&bin).unwrap(), b"only");
    }

    #[test]
    fn a_failed_install_leaves_the_binary_and_no_staging() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("missing-dir").join("svc");
        assert!(install_binary(&bin, b"x").is_err());
        assert!(!with_suffix(&bin, ".new").exists());
    }
}
