//! The clock, in one place (AR1): the shell reads it, the core receives
//! plain values.

/// Now, as RFC 3339 with second precision in UTC: `2026-09-05T07:00:00Z`.
pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Now, as whole seconds since the Unix epoch.
pub fn now_epoch() -> u64 {
    chrono::Utc::now().timestamp().max(0) as u64
}

/// `n` random bytes as lowercase hex (tokens, session ids, client ids).
pub fn random_hex(n: usize) -> Result<String, crate::core::error::Error> {
    let mut buf = vec![0u8; n];
    getrandom::fill(&mut buf).map_err(|e| {
        crate::core::error::Error::internal(format!("random source: {e}"), "report this")
    })?;
    Ok(hex::encode(buf))
}

/// The reveal window (K12), read from the resolved knobs; the default is
/// validated with the rest, so a bad value never reaches here.
pub fn reveal_seconds(loaded: &crate::shell::config_load::Loaded) -> u64 {
    loaded
        .get("reveal_seconds")
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(10)
}

#[cfg(test)]
mod tests {
    #[test]
    fn formats_and_lengths() {
        let t = super::now_rfc3339();
        assert!(t.ends_with('Z') && t.len() == 20, "{t}");
        assert!(super::now_epoch() > 1_700_000_000);
        assert_eq!(super::random_hex(32).unwrap().len(), 64);
    }
}

/// A timestamp on a page is read by a person (feat-ui-1).
///
/// Everything the kit stores is RFC 3339 — `2026-09-10T02:16:47Z` — which is
/// right for a machine and wrong for a reader. Kenny, looking at a live
/// dashboard on 2026-09-10: "niet bepaald iets dat een mens wilt lezen".
///
/// So a template keeps the exact value in `<time datetime="…">` and renders
/// THIS as the text. `chassis.js` then replaces that text with the viewer's
/// own locale, which is the only place the locale is known. Without
/// JavaScript the reader still gets a date and a time that are not run
/// together, which is the half of the complaint a server can fix.
///
/// Anything this cannot read is returned unchanged: a mangled timestamp is
/// worse than an ugly one, and a silent substitution is what standing rule 12
/// forbids.
pub fn human_time(value: &str) -> String {
    let Some((date, rest)) = value.split_once('T') else {
        return value.to_string();
    };
    if date.len() != 10 || rest.len() < 5 {
        return value.to_string();
    }
    let time = &rest[..5];
    let date_ok = date.chars().all(|c| c.is_ascii_digit() || c == '-');
    let time_ok = time.chars().all(|c| c.is_ascii_digit() || c == ':');
    if !date_ok || !time_ok {
        return value.to_string();
    }
    format!("{date} {time}")
}

#[cfg(test)]
mod human_time_tests {
    use super::human_time;

    #[test]
    fn feat_ui_1_an_rfc3339_timestamp_becomes_a_date_and_a_time() {
        assert_eq!(human_time("2026-09-10T02:16:47Z"), "2026-09-10 02:16");
        assert_eq!(
            human_time("2026-09-10T02:16:47.123456Z"),
            "2026-09-10 02:16"
        );
        assert_eq!(human_time("2026-09-10T02:16:47+02:00"), "2026-09-10 02:16");
    }

    #[test]
    fn feat_ui_1_what_it_cannot_read_it_leaves_alone() {
        // A silent substitution is worse than an ugly timestamp (rule 12).
        for odd in [
            "",
            "never",
            "2026-09-10",
            "yesterdayThh",
            "2026-9-10T02:16:47Z",
        ] {
            assert_eq!(human_time(odd), odd, "left alone: {odd}");
        }
    }
}
