//! Tests of the change log over a real (in-memory) app database.

use std::sync::Arc;

use serde_json::json;

use super::*;

#[test]
fn a_key_has_one_row_however_often_it_changes_and_a_delete_turns_it_into_a_tombstone() {
    let f = fixture();
    f.app
        .write_blocking(|tx| {
            for rev in 1..=3 {
                tx.sync_upsert("dishes", "k", rev)?;
            }
            tx.sync_delete("dishes", "k", 4)?;
            Ok(())
        })
        .unwrap();
    let (rows, deleted, rev, seq): (i64, i64, i64, i64) = f
        .app
        .read_blocking(|c| {
            Ok(c.query_row(
                "SELECT COUNT(*), MAX(deleted), MAX(rev), MAX(seq) FROM chassis_sync",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?)
        })
        .unwrap();
    assert_eq!((rows, deleted, rev, seq), (1, 1, 4, 4));
}

#[test]
fn the_counter_is_one_per_file_and_a_rolled_back_change_hands_nothing_out() {
    let f = fixture();
    let a = f
        .app
        .write_blocking(|tx| tx.sync_upsert("a", "k", 1))
        .unwrap();
    let b = f
        .app
        .write_blocking(|tx| tx.sync_upsert("b", "k", 1))
        .unwrap();
    assert_eq!((a, b), (1, 2), "one counter across collections");
    let failed = f.app.write_blocking(|tx| {
        tx.sync_upsert("a", "x", 1)?;
        Err::<(), _>(Error::internal("boom", "none"))
    });
    assert!(failed.is_err());
    assert_eq!(
        f.app
            .write_blocking(|tx| tx.sync_upsert("a", "y", 1))
            .unwrap(),
        3
    );
    assert!(
        f.app
            .write_blocking(|tx| tx.sync_upsert("a", "", 1))
            .is_err()
    );
    assert!(
        f.app
            .write_blocking(|tx| tx.sync_upsert("a", "k", u64::MAX))
            .is_err()
    );
}

#[tokio::test]
async fn an_old_cursor_is_a_resync_and_the_service_names_unknown_collections() {
    let f = fixture();
    f.delete("dishes", "shared", "gone", 2).await.unwrap();
    f.prune_tombstones("dishes").await.unwrap();
    let svc =
        SyncService::new(vec![SyncCollection::new("dishes")], Arc::new(f.log.clone())).unwrap();
    let old = Cursor::at(0).encode();
    assert!(matches!(
        svc.feed("dishes", "u1", Some(&old), None).await.unwrap(),
        Feed::Resync { .. }
    ));
    assert!(matches!(
        svc.feed("dishes", "u1", None, None).await.unwrap(),
        Feed::Page(_)
    ));
    assert!(svc.feed("nope", "u1", None, None).await.is_err());
    assert!(
        svc.feed("dishes", "u1", Some("garbage"), None)
            .await
            .is_err()
    );
}

#[test]
fn the_manifest_lists_every_collection_with_key_indexes_and_hash() {
    let f = fixture();
    let svc = SyncService::new(
        vec![
            SyncCollection::new("dishes")
                .key("id")
                .index("name")
                .shared()
                .routes("/d", "/d/:id"),
            SyncCollection::new("freezer"),
        ],
        Arc::new(f.log),
    )
    .unwrap();
    let m = svc.manifest();
    let first = &m["collections"][0];
    assert_eq!(first["name"], "dishes");
    assert_eq!(first["key"], "id");
    assert_eq!(first["indexes"], json!(["name"]));
    assert_eq!(first["routes"]["item"], "/d/:id");
    assert_eq!(first["keys"], "client");
    assert_eq!(first["schema"].as_str().unwrap().len(), 16);
    assert_eq!(m["collections"].as_array().unwrap().len(), 2);
    assert!(m["schema"].is_string());
    let dup = SyncService::new(
        vec![SyncCollection::new("a"), SyncCollection::new("a")],
        svc.inner_source_for_tests(),
    );
    assert!(dup.is_err());
}

#[test]
fn retention_removes_only_old_tombstones_and_raises_the_floor() {
    let f = fixture();
    f.app
        .write_blocking(|tx| {
            tx.sync_upsert("dishes", "live", 1)?;
            tx.sync_delete("dishes", "old", 2)?;
            tx.sync_delete("dishes", "recent", 2)?;
            tx.execute(
                "UPDATE chassis_sync SET changed_at = 1000 WHERE key IN ('live', 'old')",
                [],
            )?;
            Ok(())
        })
        .unwrap();
    let days = |c: SyncCollection, fixed| RetentionPlan::new(&[c], fixed);
    let plan = days(SyncCollection::new("dishes"), None);
    let now = crate::shell::time::now_epoch();
    assert_eq!(
        plan.run(&f.log, now).unwrap(),
        1,
        "only `old` is a tombstone past its window"
    );
    let left: i64 = f
        .app
        .read_blocking(|c| Ok(c.query_row("SELECT COUNT(*) FROM chassis_sync", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(left, 2, "the live row and the recent tombstone stay");
    let floor = f
        .app
        .read_blocking(|c| super::log::read_floor(c, "dishes"))
        .unwrap();
    assert_eq!(floor.seq(), 2, "the highest removed seq");
    assert_eq!(plan.run(&f.log, now).unwrap(), 0);
}

#[tokio::test]
async fn scope_filtering_serves_own_and_shared_rows_only() {
    let f = fixture();
    f.upsert("dishes", "shared", "s", 1).await.unwrap();
    f.upsert("dishes", "u1", "mine", 1).await.unwrap();
    f.upsert("dishes", "u2", "theirs", 1).await.unwrap();
    let Feed::Page(p) = f
        .log
        .changes_since("dishes", "u1", None, 100)
        .await
        .unwrap()
    else {
        panic!("a page");
    };
    let mut got: Vec<_> = p.upserts.iter().map(|u| u.key.as_str()).collect();
    got.sort_unstable();
    assert_eq!(got, ["mine", "s"]);
}
