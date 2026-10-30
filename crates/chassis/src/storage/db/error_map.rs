//! How a raw sqlite error becomes the kit's [`Error`]: a busy or locked file
//! is a retryable overload, anything else a dependency fault with a remedy.
//! Its own module because it is the one place that classifies sqlite codes.

use rusqlite::ErrorCode;

use crate::core::error::{Error, Kind};

impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        let busy = matches!(
            e.sqlite_error_code(),
            Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked)
        );
        if busy {
            return Error::new(
                Kind::Overloaded,
                format!("the database is busy: {e}"),
                "retry in a moment; another process holds the file (a backup tool, a second instance)",
            );
        }
        let full = matches!(e.sqlite_error_code(), Some(ErrorCode::DiskFull));
        Error::dependency(
            format!("database error: {e}"),
            if full {
                "the disk is full; free space under the state directory"
            } else {
                "check free space and that the state directory is writable by the service user; if it persists, restore the file from the last backup or pre-update copy"
            },
        )
    }
}
