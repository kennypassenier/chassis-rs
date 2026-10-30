//! What an `AppDb` reports about itself: the import state, the problems found
//! at open and the data kinds it declared.

use super::{AppDb, ImportState, StorageProblem};
use crate::storage::kinds::DataKind;

impl AppDb {
    /// How the one-time import stands.
    pub fn import_state(&self) -> ImportState {
        self.shared.import.lock().expect("import lock").clone()
    }

    /// Problems found while opening (a failed import, a failed rename).
    pub fn problems(&self) -> Vec<StorageProblem> {
        self.shared.problems.lock().expect("problems lock").clone()
    }

    pub fn kinds(&self) -> &[DataKind] {
        self.shared.kinds.get().map_or(&[], Vec::as_slice)
    }
}
