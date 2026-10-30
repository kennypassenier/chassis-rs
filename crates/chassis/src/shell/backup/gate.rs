//! The process-wide gate behind the backup pause: the counters and wake-ups
//! every writer and the controller share. Its own module so the one piece of
//! global mutable state sits apart from the public ticket API and the
//! pause sequencing that use it.

use std::sync::{Condvar, LazyLock, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::{WriteTicket, seconds_left};
use crate::core::error::Error;

#[derive(Debug)]
pub(super) struct GateState {
    pub(super) writers: usize,
    pub(super) paused: bool,
    pub(super) full: bool,
    pub(super) until: Option<Instant>,
    /// Unix seconds the current pause began, for the metric and the
    /// status page.
    pub(super) since: u64,
    /// Bumped by every new pause, so a deadline timer of an earlier pause
    /// never ends a later one.
    pub(super) epoch: u64,
}

static STATE: Mutex<GateState> = Mutex::new(GateState {
    writers: 0,
    paused: false,
    full: false,
    until: None,
    since: 0,
    epoch: 0,
});
pub(super) static CHANGED: Condvar = Condvar::new();
pub(super) static NOTIFY: LazyLock<tokio::sync::Notify> = LazyLock::new(tokio::sync::Notify::new);

pub(super) fn state() -> MutexGuard<'static, GateState> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

pub(super) fn wake_all() {
    CHANGED.notify_all();
    NOTIFY.notify_waiters();
}

/// Run a blocking wait. Inside a multi-threaded tokio runtime the worker's
/// other tasks are handed to another thread first, so the wait stalls only
/// the caller.
pub(super) fn wait_off_the_runtime<T>(wait: impl FnOnce() -> T) -> T {
    match tokio::runtime::Handle::try_current() {
        Ok(h) if h.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread => {
            tokio::task::block_in_place(wait)
        }
        _ => wait(),
    }
}

/// The error a held write ends with when the pause outlasts its patience:
/// `Overloaded`, answered 503 with the seconds left as `Retry-After`.
pub(super) fn held_error() -> Error {
    let left = seconds_left().unwrap_or(1);
    Error::new(
        crate::core::error::Kind::Overloaded,
        "paused for a backup",
        format!("retry after {left} s"),
    )
}

/// A ticket right now, when no pause is in force.
pub(super) fn try_ticket() -> Option<WriteTicket> {
    let mut s = state();
    if s.paused {
        return None;
    }
    s.writers += 1;
    Some(WriteTicket(()))
}

/// Block this thread until the pause ends, then take a ticket. With a
/// `deadline` it gives up (`None`) when the pause outlasts it; without
/// one it waits as long as it takes.
pub(super) fn wait_for_ticket(deadline: Option<Instant>) -> Option<WriteTicket> {
    let mut s = state();
    while s.paused {
        let slice = match deadline {
            Some(deadline) => {
                let now = Instant::now();
                if now >= deadline {
                    return None;
                }
                (deadline - now).min(Duration::from_millis(200))
            }
            None => Duration::from_millis(200),
        };
        s = CHANGED
            .wait_timeout(s, slice)
            .unwrap_or_else(|e| e.into_inner())
            .0;
    }
    s.writers += 1;
    Some(WriteTicket(()))
}
