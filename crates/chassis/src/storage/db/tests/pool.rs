//! Tests of the connections: pragmas on the writer and readers, the
//! checkpoint and the read-only pool.

use super::*;

#[test]
fn pragmas_are_set_on_the_writer_and_the_readers() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
    let (mode, sync, fk, busy): (String, i64, i64, i64) = db
        .write_blocking(|tx| {
            Ok((
                tx.query_row("PRAGMA journal_mode", [], |r| r.get(0))?,
                tx.query_row("PRAGMA synchronous", [], |r| r.get(0))?,
                tx.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?,
                tx.query_row("PRAGMA busy_timeout", [], |r| r.get(0))?,
            ))
        })
        .unwrap();
    assert_eq!(mode, "wal");
    assert_eq!(sync, 2, "FULL");
    assert_eq!(fk, 1);
    assert_eq!(busy, 5000);
    let (rsync, rfk, rbusy): (i64, i64, i64) = db
        .read_blocking(|c| {
            Ok((
                c.query_row("PRAGMA synchronous", [], |r| r.get(0))?,
                c.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?,
                c.query_row("PRAGMA busy_timeout", [], |r| r.get(0))?,
            ))
        })
        .unwrap();
    assert_eq!((rsync, rfk, rbusy), (2, 1, 5000));
    assert_eq!(db.schema_version(), 2);
}

/// Kenny, 2026-10-30: the Storage page showed about 4 MB of "pending
/// writes" next to a 40 KB kit file. A checkpoint folds the log in and
/// leaves nothing behind, and the log never grows past its limit.
#[test]
fn a_checkpoint_empties_the_log_and_the_log_has_a_limit() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
    for i in 0..200 {
        db.write_blocking(|tx| {
            Ok(tx.execute("INSERT INTO t (v) VALUES (?1)", [format!("{i:0>2000}")])?)
        })
        .unwrap();
    }
    assert!(db.sizes().unwrap().wal_bytes > 0);
    db.checkpoint().unwrap();
    assert_eq!(db.sizes().unwrap().wal_bytes, 0);
    let limit: i64 = db
        .write_blocking(|tx| Ok(tx.query_row("PRAGMA journal_size_limit", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(limit, WAL_SIZE_LIMIT);
}

#[test]
fn a_reader_cannot_write() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
    let err = db
        .read_blocking(|c| Ok(c.execute("INSERT INTO t (v) VALUES ('x')", [])?))
        .unwrap_err();
    assert!(
        err.message.contains("readonly") || err.message.contains("read-only"),
        "{err}"
    );
}
