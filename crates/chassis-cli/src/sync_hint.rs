//! The one line `chassis sync` adds when the project's kit version lags this
//! command (runner-3, kyu-runner 2026-09-10): the drift lines say what
//! differs, and the command that moves the version in one step already
//! exists, so the output names it instead of leaving the reader to find it.

use chassis::core::update::Version;

/// The `~` line naming `chassis upgrade`, when `recorded_tag` is older than
/// the version of this command. Nothing for an equal or newer tag (a project
/// ahead of the CLI needs a newer CLI, not an upgrade) or one that is not a
/// plain version.
pub(crate) fn upgrade_hint(recorded_tag: &str, cli_version: &str) -> Option<String> {
    let project = Version::parse(recorded_tag.trim_start_matches('v')).ok()?;
    let cli = Version::parse(cli_version).ok()?;
    (project < cli).then(|| {
        format!(
            "~ chassis_tag {recorded_tag} lags this chassis {cli_version} — run `chassis upgrade {cli_version}` \
             (moves .chassis.toml, both dependency lines and the lock file, then runs the gates)"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lagging_tag_names_the_upgrade_command() {
        let hint = upgrade_hint("v2.0.2", "4.5.1").expect("lags");
        assert!(hint.contains("`chassis upgrade 4.5.1`"), "{hint}");
        assert!(hint.contains("v2.0.2"), "{hint}");
    }

    #[test]
    fn an_equal_or_newer_tag_gets_no_hint() {
        assert_eq!(upgrade_hint("v4.5.1", "4.5.1"), None);
        assert_eq!(upgrade_hint("v4.6.0", "4.5.1"), None);
    }

    #[test]
    fn an_unreadable_tag_gets_no_hint() {
        assert_eq!(upgrade_hint("main", "4.5.1"), None);
        assert_eq!(upgrade_hint("v1.0.0-rc1", "4.5.1"), None);
    }
}
