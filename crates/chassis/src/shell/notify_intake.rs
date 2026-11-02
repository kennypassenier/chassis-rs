//! The door between `Notifier::emit` and the outbox (3.15.0).
//!
//! `emit` runs in request handlers and background tasks, often before the
//! kit database is open and never allowed to wait on it. So an event goes
//! into a bounded in-memory hand-off, and one task (see `notify_channel`)
//! writes it to the outbox in order. Before the channel exists the door
//! keeps a few events (`service.started` is the usual one) and gives them to
//! the channel the moment it connects.

// Without the dashboard nothing connects to the door; events are only logged.
#![cfg_attr(not(feature = "dashboard"), allow(dead_code))]

use std::sync::Mutex;

use tokio::sync::mpsc;

use crate::core::notify::Event;
use crate::core::notify_link::Link;
use crate::core::notify_target::Dedup;

/// An event on its way to the outbox, with its optional damping key.
pub(crate) struct Queued {
    pub event: Event,
    pub dedup: Option<Dedup>,
    /// The optional title and link, merged into the body when it is written.
    pub link: Option<Link>,
}

/// Events kept for a channel that has not started yet.
const KEPT_BEFORE_START: usize = 64;

/// What the hand-off holds between `emit` and the writer task.
pub(crate) const HAND_OFF: usize = 1024;

enum State {
    /// The channel has not connected yet.
    Waiting(Vec<Queued>),
    /// Connected: events go to the writer task.
    Live(mpsc::Sender<Queued>),
}

pub(crate) struct Intake {
    state: Mutex<State>,
}

impl Default for Intake {
    fn default() -> Self {
        Intake {
            state: Mutex::new(State::Waiting(Vec::new())),
        }
    }
}

impl Intake {
    /// Hand one event over. Never blocks; a full hand-off drops the event
    /// with a warning (it is in the log, like every event).
    pub(crate) fn offer(&self, event: Queued) {
        let mut state = self.state.lock().expect("intake lock");
        match &mut *state {
            State::Waiting(kept) => {
                if kept.len() < KEPT_BEFORE_START {
                    kept.push(event);
                }
            }
            State::Live(tx) => {
                if let Err(e) = tx.try_send(event) {
                    tracing::warn!(error = %e, "notification hand-off full; event not queued for the targets (it is in the log)");
                }
            }
        }
    }

    /// The channel is up: give it what was kept, then every later event.
    pub(crate) fn connect(&self, tx: mpsc::Sender<Queued>) {
        let mut state = self.state.lock().expect("intake lock");
        if let State::Waiting(kept) = std::mem::replace(&mut *state, State::Live(tx.clone())) {
            for event in kept {
                let _ = tx.try_send(event);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(kind: &str) -> Queued {
        Queued {
            dedup: None,
            link: None,
            event: Event {
                service: "svc".into(),
                kind: kind.into(),
                at: "2026-10-30T10:00:00Z".into(),
                version: "1.0.0".into(),
                detail: String::new(),
            },
        }
    }

    #[test]
    fn events_before_the_channel_are_kept_and_arrive_first() {
        let intake = Intake::default();
        intake.offer(event("service.started"));
        let (tx, mut rx) = mpsc::channel(8);
        intake.connect(tx);
        intake.offer(event("update.ok"));
        assert_eq!(rx.try_recv().unwrap().event.kind, "service.started");
        assert_eq!(rx.try_recv().unwrap().event.kind, "update.ok");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn what_is_kept_before_start_is_bounded() {
        let intake = Intake::default();
        for i in 0..(KEPT_BEFORE_START + 10) {
            intake.offer(event(&format!("e{i}")));
        }
        let (tx, mut rx) = mpsc::channel(256);
        intake.connect(tx);
        let mut n = 0;
        while rx.try_recv().is_ok() {
            n += 1;
        }
        assert_eq!(n, KEPT_BEFORE_START);
    }
}
