//! The feed cursor. Opaque to the page: it keeps the string and sends it
//! back; the server encodes a sequence number of the change log in it.
//!
//! A cursor is either a normal position (everything above it is new) or a
//! **sweep** position, handed out between the pages of a read from the
//! beginning. A sweep lists live items only, so it must not be refused by
//! the retention floor: the page ignores deletions of a sweep anyway (it
//! drops what the sweep did not mention).

use crate::core::error::Error;

const PREFIX: &str = "c1-";
const SWEEP: &str = "s";

/// A position in a change log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Cursor {
    seq: u64,
    sweep: bool,
}

impl Cursor {
    /// Before the first change.
    pub const START: Cursor = Cursor {
        seq: 0,
        sweep: false,
    };

    /// The cursor at sequence number `seq`.
    pub fn at(seq: u64) -> Self {
        Cursor { seq, sweep: false }
    }

    /// A position inside a read from the beginning (live items only).
    pub fn sweep_at(seq: u64) -> Self {
        Cursor { seq, sweep: true }
    }

    /// The sequence number inside.
    pub fn seq(self) -> u64 {
        self.seq
    }

    /// Whether this position is inside a read from the beginning.
    pub fn is_sweep(self) -> bool {
        self.sweep
    }

    /// The string the page keeps (`c1-<hex>`, `c1-s<hex>` in a sweep).
    pub fn encode(self) -> String {
        let flag = if self.sweep { SWEEP } else { "" };
        format!("{PREFIX}{flag}{:x}", self.seq)
    }

    /// Read a cursor the page sent back; a string this server never made is
    /// a 400 in the kit's shape.
    pub fn decode(raw: &str) -> Result<Self, Error> {
        let body = raw.strip_prefix(PREFIX).unwrap_or("");
        let (sweep, hex) = match body.strip_prefix(SWEEP) {
            Some(rest) => (true, rest),
            None => (false, body),
        };
        u64::from_str_radix(hex, 16)
            .ok()
            .filter(|_| !hex.is_empty() && hex.len() <= 16 && !hex.starts_with('+'))
            .map(|seq| Cursor { seq, sweep })
            .ok_or_else(|| {
                Error::invalid(
                    format!("`{raw}` is not a cursor this server made"),
                    "send the cursor of the previous answer unchanged, or no `since` to start from the beginning",
                )
            })
    }
}
