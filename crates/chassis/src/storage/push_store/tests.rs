//! The subscription table: renewing in place, the cap, outcomes and the VAPID row.

use super::*;

fn store(cap: usize) -> (tempfile::TempDir, PushStore) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(
        &dir.path().join("svc-kit.db"),
        &crate::storage::kit_migrations(),
    )
    .unwrap();
    (dir, PushStore::new(db, cap))
}

#[test]
fn a_subscription_is_stored_once_and_renewed_in_place() {
    let (_dir, s) = store(5);
    assert_eq!(
        s.upsert("https://p.example/1", "k1", "a1", 100).unwrap(),
        Upsert::Created
    );
    s.record_error("https://p.example/1", "it answered HTTP 500", 150)
        .unwrap();
    assert_eq!(
        s.upsert("https://p.example/1", "k2", "a2", 200).unwrap(),
        Upsert::Renewed
    );
    let all = s.all().unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].p256dh, "k2");
    assert_eq!(all[0].auth, "a2");
    assert_eq!(all[0].created_at, 100, "renewing keeps the first-seen time");
    assert_eq!(
        all[0].last_error, None,
        "a fresh subscription clears the old error"
    );
}

#[test]
fn the_cap_refuses_a_new_endpoint_but_not_a_renewal() {
    let (_dir, s) = store(2);
    s.upsert("https://p.example/1", "k", "a", 1).unwrap();
    s.upsert("https://p.example/2", "k", "a", 2).unwrap();
    let err = s.upsert("https://p.example/3", "k", "a", 3).unwrap_err();
    assert!(err.message.contains("limit is 2"), "{}", err.message);
    assert!(err.remedy.contains("push_max_subscriptions"));
    assert_eq!(
        s.upsert("https://p.example/2", "k9", "a", 4).unwrap(),
        Upsert::Renewed
    );
    assert_eq!(s.all().unwrap().len(), 2);
}

#[test]
fn removing_reports_whether_a_row_existed_and_outcomes_are_recorded() {
    let (_dir, s) = store(5);
    s.upsert("https://p.example/1", "k", "a", 1).unwrap();
    s.record_error("https://p.example/1", "it did not answer in time", 5)
        .unwrap();
    assert_eq!(
        s.all().unwrap()[0].last_error.as_deref(),
        Some("it did not answer in time")
    );
    s.record_success("https://p.example/1", 9).unwrap();
    let row = &s.all().unwrap()[0];
    assert_eq!(
        (row.last_success_at, row.last_error.as_deref()),
        (Some(9), None)
    );
    assert!(s.remove("https://p.example/1").unwrap());
    assert!(!s.remove("https://p.example/1").unwrap());
    assert!(s.all().unwrap().is_empty());
}

#[test]
fn the_first_vapid_row_wins() {
    let (_dir, s) = store(5);
    assert_eq!(s.vapid_sealed().unwrap(), None);
    assert_eq!(s.set_vapid_sealed("first").unwrap(), "first");
    assert_eq!(s.set_vapid_sealed("second").unwrap(), "first");
    assert_eq!(s.vapid_sealed().unwrap().as_deref(), Some("first"));
}
