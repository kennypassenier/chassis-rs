//! The feed cursor. Opaque to the page: it keeps the string and sends it
//! back; the server encodes a sequence number of the change log in it.
//!
//! A cursor is either a normal position (everything above it is new) or a
//! **sweep** position, handed out between the pages of a read from the
//! beginning. A sweep lists live items only, so it must not be refused by
//! the retention floor: the page ignores deletions of a sweep anyway (it
//! drops what the sweep did not mention).
//!
//! A cursor of the app database also carries the **epoch** of the file it
//! came from (`c2-<epoch>-...`, see [`epoch`](super::epoch)). A cursor of
//! another epoch, or one without an epoch where the file has one, is a
//! resync: the file was restored from a copy, and its counter says nothing
//! about what that device has seen.

use crate::core::error::Error;

/// The first form (4.5): position only, no epoch. Still read, never written
/// by a source that has an epoch.
const PREFIX_V1: &str = "c1-";
/// The form with the epoch: `c2-<16 hex epoch>-[s]<hex seq>`.
const PREFIX_V2: &str = "c2-";
const SWEEP: &str = "s";

/// A position in a change log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct Cursor {
    seq: u64,
    sweep: bool,
    /// The file's epoch; 0 = none (a source without one, or a cursor of the
    /// first form). Last, so the derived order is by position first.
    epoch: u64,
}

impl Cursor {
    /// Before the first change.
    pub const START: Cursor = Cursor {
        seq: 0,
        sweep: false,
        epoch: 0,
    };

    /// The cursor at sequence number `seq`.
    pub fn at(seq: u64) -> Self {
        Cursor {
            seq,
            sweep: false,
            epoch: 0,
        }
    }

    /// A position inside a read from the beginning (live items only).
    pub fn sweep_at(seq: u64) -> Self {
        Cursor {
            seq,
            sweep: true,
            epoch: 0,
        }
    }

    /// The same position, stamped with the epoch of the file it belongs to.
    pub fn in_epoch(self, epoch: u64) -> Self {
        Cursor { epoch, ..self }
    }

    /// The epoch inside; 0 when there is none.
    pub fn epoch(self) -> u64 {
        self.epoch
    }

    /// Whether this cursor cannot be trusted against `current` (the floor
    /// the source reports, which carries the file's epoch): the file has an
    /// epoch and this cursor is from another one, or from none. A source
    /// without epochs (`current.epoch() == 0`) never refuses.
    pub fn is_foreign_to(self, current: Cursor) -> bool {
        current.epoch != 0 && self.epoch != current.epoch
    }

    /// The sequence number inside.
    pub fn seq(self) -> u64 {
        self.seq
    }

    /// Whether this position is inside a read from the beginning.
    pub fn is_sweep(self) -> bool {
        self.sweep
    }

    /// The string the page keeps: `c2-<epoch>-<hex>` (`c2-<epoch>-s<hex>` in
    /// a sweep), or `c1-<hex>` for a position without an epoch.
    pub fn encode(self) -> String {
        let flag = if self.sweep { SWEEP } else { "" };
        if self.epoch == 0 {
            return format!("{PREFIX_V1}{flag}{:x}", self.seq);
        }
        format!("{PREFIX_V2}{:016x}-{flag}{:x}", self.epoch, self.seq)
    }

    /// Read a cursor the page sent back; a string this server never made is
    /// a 400 in the kit's shape.
    pub fn decode(raw: &str) -> Result<Self, Error> {
        let bad = || {
            Error::invalid(
                format!("`{raw}` is not a cursor this server made"),
                "send the cursor of the previous answer unchanged, or no `since` to start from the beginning",
            )
        };
        let (epoch, body) = match (raw.strip_prefix(PREFIX_V2), raw.strip_prefix(PREFIX_V1)) {
            (Some(rest), _) => split_epoch(rest).ok_or_else(bad)?,
            (None, Some(rest)) => (0, rest),
            (None, None) => return Err(bad()),
        };
        let (sweep, hex) = match body.strip_prefix(SWEEP) {
            Some(rest) => (true, rest),
            None => (false, body),
        };
        u64::from_str_radix(hex, 16)
            .ok()
            .filter(|_| !hex.is_empty() && hex.len() <= 16 && !hex.starts_with('+'))
            .map(|seq| Cursor { seq, sweep, epoch })
            .ok_or_else(bad)
    }
}

/// `<16 hex>-<rest>` of a `c2-` cursor; the epoch is never 0 there.
fn split_epoch(rest: &str) -> Option<(u64, &str)> {
    let (epoch, body) = rest.split_once('-')?;
    let valid = epoch.len() == 16 && epoch.bytes().all(|b| b.is_ascii_hexdigit());
    let epoch = u64::from_str_radix(epoch, 16)
        .ok()
        .filter(|e| valid && *e != 0)?;
    Some((epoch, body))
}
