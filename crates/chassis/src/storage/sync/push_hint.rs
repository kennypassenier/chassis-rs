//! The `sync` hint over Web Push (decision 6): a notification the app sends
//! anyway can carry the names of the collections that changed; the worker
//! then tells its open windows to pull at once. A push cannot wake a page
//! silently, so the notification is always shown. No window open: nothing
//! happens and the next start pulls anyway.

use crate::core::error::Error;
use crate::push::{Push, PushHandle, PushReport};

/// Send `notification` with `{"sync": [..]}` in its data (an empty list means
/// every collection). Same errors and report as `PushHandle::send`.
pub async fn publish_sync_push(
    push: &PushHandle,
    notification: Push,
    collections: &[&str],
) -> Result<PushReport, Error> {
    push.send(notification.sync(collections)).await
}
