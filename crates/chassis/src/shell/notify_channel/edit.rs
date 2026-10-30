//! Changing the saved addresses from the dashboard page, within what the
//! configuration lets the page override.

use super::{Channel, Which};
use crate::core::error::Error;
use crate::core::notify_target::{Fixed, check_url};

impl Channel {
    fn refuse_locked(which: Which, f: &Fixed) -> Error {
        Error::invalid(
            format!("the {} address is fixed: {}", which.as_str(), f.reason()),
            "change it where it is set and restart the service; this page cannot override it",
        )
    }

    /// Save addresses from the page. `None` leaves a target as it is; an
    /// empty string saves "no target". An address the configuration fixes is
    /// refused unless it is exactly the fixed one.
    pub(crate) fn save(&self, primary: Option<&str>, fallback: Option<&str>) -> Result<(), Error> {
        if primary.is_none() && fallback.is_none() {
            return Err(Error::invalid(
                "nothing to change: give a primary address, a fallback address or reset",
                "send primary and/or fallback as text, or {\"reset\": true}",
            ));
        }
        let mut clean: [Option<String>; 2] = [None, None];
        for (which, given) in [(Which::Primary, primary), (Which::Fallback, fallback)] {
            let Some(text) = given else { continue };
            let text = text.trim();
            if let Some(f) = &self.inner.fixed[which.index()] {
                if f.value.trim() != text {
                    return Err(Self::refuse_locked(which, f));
                }
                continue;
            }
            clean[which.index()] = Some(if text.is_empty() {
                String::new()
            } else {
                check_url(text).map_err(|e| {
                    Error::invalid(
                        format!("the {} address: {}", which.as_str(), e.message),
                        e.remedy,
                    )
                })?
            });
        }
        let entries: Vec<(&str, &str)> = Which::BOTH
            .into_iter()
            .filter_map(|w| clean[w.index()].as_deref().map(|v| (w.key(), v)))
            .collect();
        self.inner.meta.store(&entries)?;
        self.after_change()
    }

    /// Delete the saved addresses: back to the code default, or none.
    pub(crate) fn reset(&self) -> Result<(), Error> {
        let keys: Vec<&str> = Which::BOTH
            .into_iter()
            .filter(|w| self.inner.fixed[w.index()].is_none())
            .map(Which::key)
            .collect();
        if keys.is_empty() {
            return Err(Error::invalid(
                "both addresses are fixed by configuration, so there is nothing saved to reset",
                "change them where they are set and restart the service",
            ));
        }
        self.inner.meta.forget(&keys)?;
        self.after_change()
    }

    /// A target changed: waiting messages need not wait out an old backoff.
    fn after_change(&self) -> Result<(), Error> {
        self.reload()?;
        self.inner.outbox.due_now()?;
        self.wake();
        Ok(())
    }
}
