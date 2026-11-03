//! The file's epoch: cursors carry it, a restored copy is a new epoch, and a
//! cursor of another epoch (or none) is a resync.

use super::*;
use crate::storage::sync::epoch;

#[test]
fn a_cursor_with_an_epoch_round_trips_and_the_first_form_still_reads() {
    for c in [
        Cursor::at(5).in_epoch(0xabc),
        Cursor::sweep_at(9).in_epoch(u64::MAX),
    ] {
        assert_eq!(Cursor::decode(&c.encode()).unwrap(), c);
        assert!(c.encode().starts_with("c2-"));
    }
    let old = Cursor::decode("c1-1f").unwrap();
    assert_eq!((old.seq(), old.epoch()), (31, 0));
    assert_eq!(Cursor::at(31).encode(), "c1-1f", "no epoch: the first form");
    for bad in [
        "c2-",
        "c2-zz-1",
        "c2-0000000000000000-1",
        "c2-00000000000000ab-1",
        "c2-00000000000000ab",
        "c2-00000000000000ab-",
    ] {
        assert!(Cursor::decode(bad).is_err(), "{bad}");
    }
}

#[test]
fn foreign_means_another_epoch_or_none_where_the_file_has_one() {
    let floor = Cursor::START.in_epoch(7);
    assert!(Cursor::at(1).is_foreign_to(floor), "no epoch: not trusted");
    assert!(Cursor::at(1).in_epoch(8).is_foreign_to(floor));
    assert!(!Cursor::at(1).in_epoch(7).is_foreign_to(floor));
    assert!(
        !Cursor::at(1).is_foreign_to(Cursor::START),
        "a source without epochs never refuses"
    );
}

#[tokio::test]
async fn a_renewed_epoch_turns_every_earlier_cursor_into_a_resync() {
    let f = fixture();
    f.upsert("dishes", "shared", "a", 1).await.unwrap();
    let svc =
        SyncService::new(vec![SyncCollection::new("dishes")], Arc::new(f.log.clone())).unwrap();
    let Feed::Page(first) = svc.feed("dishes", "u1", None, None).await.unwrap() else {
        panic!("a page")
    };
    assert_ne!(first.cursor.epoch(), 0, "the page hands out the epoch");
    let kept = first.cursor.encode();
    assert!(matches!(
        svc.feed("dishes", "u1", Some(&kept), None).await.unwrap(),
        Feed::Page(_)
    ));
    f.app
        .write_blocking(|tx| epoch::renew(tx).map(|_| ()))
        .unwrap();
    for since in [
        kept,
        Cursor::at(1).encode(),
        Cursor::sweep_at(1).in_epoch(first.cursor.epoch()).encode(),
    ] {
        assert!(
            matches!(
                svc.feed("dishes", "u1", Some(&since), None).await.unwrap(),
                Feed::Resync { .. }
            ),
            "{since}"
        );
    }
    let Feed::Page(fresh) = svc.feed("dishes", "u1", None, None).await.unwrap() else {
        panic!("a read from the beginning is always served")
    };
    assert_ne!(fresh.cursor.epoch(), first.cursor.epoch());
}

#[test]
fn a_copy_the_kit_makes_carries_its_own_epoch() {
    let dir = tempfile::tempdir().unwrap();
    let app = AppDb::open(&dir.path().join("app.db"), AppDbSpec::new(vec![]), vec![]).unwrap();
    let live = app.read_blocking(epoch::read).unwrap();
    assert_ne!(live, 0);
    let copy = dir.path().join("copy.db");
    app.vacuum_into(&copy).unwrap();
    let c = rusqlite::Connection::open(&copy).unwrap();
    let copied = epoch::read(&c).unwrap();
    assert!(
        copied != 0 && copied != live,
        "restoring the copy is a new epoch"
    );
    assert_eq!(
        app.read_blocking(epoch::read).unwrap(),
        live,
        "the live file is untouched"
    );
}

#[test]
fn a_file_that_is_not_the_one_the_epoch_was_made_for_gets_a_new_epoch() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.db");
    let epoch_at_open = |p: &std::path::Path| {
        let app = AppDb::open(p, AppDbSpec::new(vec![]), vec![]).unwrap();
        app.read_blocking(epoch::read).unwrap()
    };
    let first = epoch_at_open(&path);
    assert_eq!(
        epoch_at_open(&path),
        first,
        "the same file keeps its epoch across starts"
    );
    // A backup tool restores by writing a new file under the old name.
    let restored = dir.path().join("restored.db");
    std::fs::copy(&path, &restored).unwrap();
    std::fs::remove_file(&path).unwrap();
    std::fs::rename(&restored, &path).unwrap();
    assert_ne!(epoch_at_open(&path), first, "a different file: a new epoch");
}
