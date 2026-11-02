//! The per-target memory of a failure and the backoff after a failed write.

use super::outbox_loop::WriteTrouble;
use super::*;

#[test]
fn a_failed_kit_target_does_not_take_the_primarys_retries_away() {
    let mut down = Down::default();
    down.set(Which::Kit, true);
    assert_eq!(down.retries(Which::Kit, 3), 0);
    assert_eq!(down.retries(Which::Primary, 3), 3);
    assert_eq!(down.retries(Which::Fallback, 3), 3);
    down.set(Which::Primary, true);
    down.set(Which::Kit, false);
    assert_eq!(down.retries(Which::Primary, 3), 0);
    assert_eq!(down.retries(Which::Kit, 3), 3);
}

#[test]
fn a_streak_of_failed_writes_is_reported_once_and_the_pause_grows() {
    let mut t = WriteTrouble::default();
    assert_eq!(t.note(), (true, 1));
    assert_eq!(t.note(), (false, 2));
    assert_eq!(t.note(), (false, 3));
    t.cleared();
    assert_eq!(t.note(), (true, 1), "a new streak is reported again");
}
