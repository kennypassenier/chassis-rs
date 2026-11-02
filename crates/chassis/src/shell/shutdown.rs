//! The start of a stop, as a handle a handler can wait on.
//!
//! `axum`'s graceful shutdown waits for every in-flight request, so a handler
//! that parks for minutes (a long poll, a stream) holds a restart for the whole
//! drain budget. The kit fires this signal at the START of the drain; such a
//! handler selects on it and returns early.

use tokio::sync::watch;

/// A cheap, cloneable handle that resolves once the service begins to stop.
#[derive(Clone, Debug)]
pub struct ShutdownSignal {
    rx: watch::Receiver<bool>,
}

/// The sending half, kept by the app and then by `Running`.
#[derive(Debug)]
pub(crate) struct ShutdownTrigger {
    tx: watch::Sender<bool>,
}

impl ShutdownTrigger {
    pub(crate) fn new() -> (Self, ShutdownSignal) {
        let (tx, rx) = watch::channel(false);
        (Self { tx }, ShutdownSignal { rx })
    }

    /// Another handle on the same signal.
    pub(crate) fn signal(&self) -> ShutdownSignal {
        ShutdownSignal {
            rx: self.tx.subscribe(),
        }
    }

    /// Begin the drain: every waiting handle resolves.
    pub(crate) fn fire(&self) {
        self.tx.send_replace(true);
    }
}

impl ShutdownSignal {
    /// Whether the service has begun to stop.
    pub fn is_shutting_down(&self) -> bool {
        *self.rx.borrow() || self.rx.has_changed().is_err()
    }

    /// Resolves when the service begins to stop; at once if it already has.
    /// Also resolves if the service was dropped without a clean stop, so a
    /// handler never waits on a signal that can no longer fire.
    ///
    /// ```text
    /// let stop = app.shutdown_signal();
    /// // in a long-poll handler:
    /// tokio::select! {
    ///     msg = queue.next() => reply(msg),
    ///     () = stop.wait() => reply_empty(),
    /// }
    /// ```
    pub async fn wait(&self) {
        let mut rx = self.rx.clone();
        // `Err` means the sender is gone: nothing will fire it any more.
        let _ = rx.wait_for(|fired| *fired).await;
    }
}
