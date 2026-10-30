//! What the inbox's handlers, dashboard sections and metrics share: the
//! in-memory message list and the state the intake handler runs on.

use std::sync::{Arc, Mutex};

use chassis::shell::metrics::{Counter, Gauge};
use chassis::shell::notify::Notifier;

/// Messages received so far, newest last. In memory: the example proves
/// the kit, not a database.
pub(crate) type Messages = Arc<Mutex<Vec<serde_json::Value>>>;

#[derive(Clone)]
pub(crate) struct Inbox {
    pub(crate) messages: Messages,
    pub(crate) notifier: Notifier,
    /// The project's own series, registered with the kit's `/metrics` in
    /// `main`. A counter for what happened and a gauge for what is: the two
    /// shapes Prometheus expects, and the reason the kit ships both.
    pub(crate) received: Counter,
    pub(crate) stored: Gauge,
}
