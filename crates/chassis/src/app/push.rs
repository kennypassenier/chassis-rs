//! Web Push on `App`: the handle the project sends with.

use super::App;

impl App {
    /// The handle to send Web Push with (habits-push-1): `app.push().send(
    /// Push::new("Water drinken").body("...").url("/habits/water"))`. A cheap
    /// clone, valid right after `from_args`, so handlers and background tasks
    /// can be given one; it becomes usable once `start` has mounted the
    /// dashboard. Separate from [`App::notifier`]: that one sends service
    /// events to a hub, this one talks to subscribed browsers.
    pub fn push(&self) -> crate::push::PushHandle {
        self.push.clone()
    }
}
