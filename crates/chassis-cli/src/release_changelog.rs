//! The changelog half of a release: the dated heading, the Migration check
//! that gates a major bump, and today's date without a date crate. Its own
//! module because none of it needs a project, a process or the network.

use chassis::Error;

/// K25 / H3: a major bump ships with a migration note under Unreleased.
pub(crate) fn check_major_has_migration(
    changelog: &str,
    current: chassis::core::update::Version,
    next: chassis::core::update::Version,
) -> Result<(), Error> {
    if next.major > current.major && !changelog.contains("Migration") {
        return Err(Error::invalid(
            format!(
                "{next} is a major bump over {current} but CHANGELOG.md has no Migration section"
            ),
            "add `### Migration` under [Unreleased] saying what an operator or consumer must change, then release again",
        ));
    }
    Ok(())
}

pub(crate) fn release_changelog(changelog: &str, version: &str, date: &str) -> String {
    let heading = format!("## [{version}] - {date}");
    if changelog.contains("## [Unreleased]") {
        changelog.replacen(
            "## [Unreleased]",
            &format!("## [Unreleased]\n\n{heading}"),
            1,
        )
    } else {
        format!("{changelog}\n{heading}\n")
    }
}

pub(crate) fn today() -> String {
    chrono_free_today()
}

/// The date without pulling chrono into the CLI: the epoch arithmetic
/// is enough for a changelog heading.
pub(crate) fn chrono_free_today() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    // Civil-from-days (Howard Hinnant), valid for the range we care about.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}
