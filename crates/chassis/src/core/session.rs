//! Dashboard sessions (K8, AR6): what a logged-in browser holds, and how
//! long it lasts.
//!
//! The browser gets a random id in a cookie; the store keeps only its
//! SHA-256 (critic #11), so the sessions file is worthless to anyone who
//! reads it. A plain session lives `session_ttl` from its last use; a
//! "remember me" session lives `remember_me` from creation. Time comes in
//! as seconds since the epoch so this stays a pure module.

use serde::{Deserialize, Serialize};

use crate::core::crypto::sha256_hex;

pub const SESSIONS_FORMAT: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Session {
    /// SHA-256 hex of the cookie value.
    pub id_hash: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub remember: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionsFile {
    pub v: u32,
    pub sessions: Vec<Session>,
}

impl Default for SessionsFile {
    fn default() -> Self {
        Self {
            v: SESSIONS_FORMAT,
            sessions: Vec::new(),
        }
    }
}

impl SessionsFile {
    /// Create a session for `cookie_value`; returns the row.
    pub fn create(
        &mut self,
        cookie_value: &str,
        now: u64,
        ttl_secs: u64,
        remember: bool,
    ) -> &Session {
        self.sessions.push(Session {
            id_hash: sha256_hex(cookie_value.as_bytes()),
            created_at: now,
            expires_at: now + ttl_secs,
            remember,
        });
        self.sessions.last().expect("just pushed")
    }

    /// Is this cookie a live session? A plain session that is used gets
    /// its expiry pushed out (sliding); a remember-me session does not
    /// (its end is fixed at creation).
    pub fn touch(&mut self, cookie_value: &str, now: u64, ttl_secs: u64) -> bool {
        let hash = sha256_hex(cookie_value.as_bytes());
        match self.sessions.iter_mut().find(|s| s.id_hash == hash) {
            Some(s) if s.expires_at > now => {
                if !s.remember {
                    s.expires_at = now + ttl_secs;
                }
                true
            }
            _ => false,
        }
    }

    /// Logout: remove the row for this cookie.
    pub fn remove(&mut self, cookie_value: &str) -> bool {
        let hash = sha256_hex(cookie_value.as_bytes());
        let before = self.sessions.len();
        self.sessions.retain(|s| s.id_hash != hash);
        self.sessions.len() != before
    }

    /// Drop expired rows; called before every save so the file stays small.
    pub fn prune(&mut self, now: u64) {
        self.sessions.retain(|s| s.expires_at > now);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_sessions_slide_and_remember_me_sessions_do_not() {
        let mut f = SessionsFile::default();
        f.create("plain", 1_000, 100, false);
        f.create("kept", 1_000, 1_000, true);
        assert!(f.touch("plain", 1_050, 100));
        assert_eq!(f.sessions[0].expires_at, 1_150, "slid forward");
        assert!(f.touch("kept", 1_050, 100));
        assert_eq!(f.sessions[1].expires_at, 2_000, "fixed at creation");
        assert!(!f.touch("plain", 1_151, 100), "expired");
        assert!(!f.touch("unknown", 1_000, 100));
    }

    #[test]
    fn remove_and_prune_and_hashed_at_rest() {
        let mut f = SessionsFile::default();
        f.create("abc", 10, 5, false);
        assert!(!f.sessions.iter().any(|s| s.id_hash.contains("abc")));
        assert!(f.remove("abc"));
        assert!(!f.remove("abc"));
        f.create("x", 10, 5, false);
        f.prune(100);
        assert!(f.sessions.is_empty());
    }
}
