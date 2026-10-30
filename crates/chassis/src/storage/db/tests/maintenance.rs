//! Tests of `VACUUM INTO`, the sizes and the reclaimable pages.

use super::*;

#[test]
fn vacuum_into_makes_a_sound_copy_and_refuses_to_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
    db.write_blocking(|tx| Ok(tx.execute("INSERT INTO t (v) VALUES ('kept')", [])?))
        .unwrap();
    let dest = dir.path().join("copy.db");
    db.vacuum_into(&dest).unwrap();
    let copy = Db::open(&dest, &two()).unwrap();
    let v: String = copy
        .read_blocking(|c| Ok(c.query_row("SELECT v FROM t", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(v, "kept");
    assert!(
        db.vacuum_into(&dest)
            .unwrap_err()
            .message
            .contains("already exists")
    );
}

#[test]
fn sizes_count_pages_and_the_log_and_reclaimable_pages() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(&dir.path().join("a.db"), &two()).unwrap();
    db.write_blocking(|tx| {
        for i in 0..200 {
            tx.execute("INSERT INTO t (v) VALUES (?1)", [format!("{i:0>200}")])?;
        }
        Ok(())
    })
    .unwrap();
    let before = db.sizes().unwrap();
    assert!(before.db_bytes > 0 && before.total() >= before.db_bytes);
    db.write_blocking(|tx| Ok(tx.execute("DELETE FROM t", [])?))
        .unwrap();
    db.checkpoint().unwrap();
    let after = db.sizes().unwrap();
    assert_eq!(after.wal_bytes, 0, "checkpoint(TRUNCATE) empties the log");
    assert!(
        after.reclaimable_bytes > 0,
        "deleted pages wait on the freelist"
    );
    db.vacuum_blocking().unwrap();
    assert_eq!(db.sizes().unwrap().reclaimable_bytes, 0);
}
