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
