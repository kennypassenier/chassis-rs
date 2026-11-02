//! Tests of the parts that need no database: cursors, declarations, page
//! limits, the retention window and the create rules.

use std::time::Duration;

use uuid::Uuid;

use super::*;

#[test]
fn a_cursor_survives_the_round_trip_and_a_stranger_is_refused() {
    for c in [Cursor::START, Cursor::at(77), Cursor::sweep_at(u64::MAX)] {
        assert_eq!(Cursor::decode(&c.encode()).unwrap(), c);
    }
    for bad in [
        "",
        "77",
        "c1-",
        "c1-zz",
        "c1-s",
        "c1-+5",
        "c2-5",
        "c1-11111111111111111",
    ] {
        assert!(Cursor::decode(bad).is_err(), "{bad}");
    }
}

#[test]
fn a_collection_is_validated_and_its_hash_follows_what_the_page_builds() {
    assert!(
        SyncCollection::new("dishes")
            .index("name")
            .validate()
            .is_ok()
    );
    for bad in ["", "Dishes", "1x", "a b", "dishes!", "a-b"] {
        assert!(SyncCollection::new(bad).validate().is_err(), "{bad}");
    }
    assert!(
        SyncCollection::new("d")
            .index("bad field")
            .validate()
            .is_err()
    );
    assert!(SyncCollection::new("d").page_limit(0).validate().is_err());
    assert!(
        SyncCollection::new("d")
            .routes("/x", "/x/1")
            .validate()
            .is_err()
    );
    let base = SyncCollection::new("d").index("a").schema_hash();
    assert_eq!(base, SyncCollection::new("d").index("a").schema_hash());
    assert_ne!(
        base,
        SyncCollection::new("d").index("a").index("b").schema_hash()
    );
    assert_eq!(
        base,
        SyncCollection::new("d")
            .index("a")
            .retain(Duration::from_secs(5))
            .schema_hash(),
        "retention is the server's business, not the page's"
    );
}

#[test]
fn page_limits_default_clamp_and_follow_the_collection() {
    let c = SyncCollection::new("d");
    assert_eq!(c.effective_limit(None), 500);
    assert_eq!(c.effective_limit(Some(0)), 1);
    assert_eq!(c.effective_limit(Some(99_999)), MAX_PAGE_LIMIT);
    assert_eq!(
        SyncCollection::new("d")
            .page_limit(40)
            .effective_limit(None),
        40
    );
}

#[test]
fn the_environment_wins_over_a_collection_and_the_default_is_thirty_days() {
    let c = SyncCollection::new("d").retain(Duration::from_secs(3600));
    let window = |plan: &RetentionPlan| plan.window_for("d");
    assert_eq!(
        window(&RetentionPlan::new(std::slice::from_ref(&c), None)),
        Duration::from_secs(3600)
    );
    assert_eq!(
        window(&RetentionPlan::new(&[c], Some(2))),
        Duration::from_secs(2 * 86_400)
    );
    assert_eq!(
        window(&RetentionPlan::new(&[SyncCollection::new("d")], None)),
        Duration::from_secs(30 * 86_400)
    );
}

#[test]
fn a_create_needs_a_uuid_and_refuses_a_held_key_unless_it_is_the_same_request() {
    let id = "3f2b8c1e-5a4d-4e0a-9b1c-2d7e6f8a9b0c";
    assert!(client_key(id).is_ok());
    assert!(client_key(&id.to_uppercase()).is_ok());
    for bad in [
        "",
        "dish-1",
        "3f2b8c1e5a4d4e0a9b1c2d7e6f8a9b0c",
        "{3f2b8c1e-5a4d-4e0a-9b1c-2d7e6f8a9b0c}",
    ] {
        assert!(client_key(bad).is_err(), "{bad}");
    }
    let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
    assert_eq!(
        check_create(false, Some(a), None),
        Ok(CreateVerdict::Create)
    );
    assert_eq!(check_create(false, None, None), Ok(CreateVerdict::Create));
    assert_eq!(
        check_create(true, Some(a), Some(a)),
        Ok(CreateVerdict::Replay)
    );
    assert_eq!(check_create(true, Some(a), Some(b)), Err(KeyExists));
    assert_eq!(check_create(true, None, Some(a)), Err(KeyExists));
    assert_eq!(check_create(true, Some(a), None), Err(KeyExists));
}
