//! Tests of the durable outbox: ordering across a reopen, the cap, retry
//! times and the dedup key.

use super::*;

fn open(dir: &std::path::Path) -> Db {
    Db::open(&dir.join("svc-kit.db"), &crate::storage::kit_migrations()).unwrap()
}

#[test]
fn waiting_messages_survive_a_reopen_in_order() {
    let dir = tempfile::tempdir().unwrap();
    {
        let outbox = Outbox::new(open(dir.path()), 100);
        for i in 0..3 {
            outbox
                .enqueue("service.started", &format!("body {i}"), None, 1000 + i)
                .unwrap();
        }
        assert_eq!(outbox.counts().unwrap().waiting, 3);
    }
    // A new process: a new handle on the same file.
    let outbox = Outbox::new(open(dir.path()), 100);
    let counts = outbox.counts().unwrap();
    assert_eq!((counts.waiting, counts.oldest_at), (3, Some(1000)));
    let first = outbox.next_due(5000).unwrap().unwrap();
    assert_eq!((first.body.as_str(), first.attempts), ("body 0", 0));
    outbox.delivered(first.id).unwrap();
    assert_eq!(outbox.next_due(5000).unwrap().unwrap().body, "body 1");
    assert_eq!(
        outbox.counts().unwrap().waiting,
        2,
        "a delivered row is deleted, not marked"
    );
}

#[test]
fn past_the_cap_the_oldest_are_dropped_and_counted() {
    let dir = tempfile::tempdir().unwrap();
    let outbox = Outbox::new(open(dir.path()), 3);
    let mut dropped = 0;
    for i in 0..5 {
        dropped += outbox.enqueue("k", &format!("m{i}"), None, 10 + i).unwrap();
    }
    assert_eq!(dropped, 2);
    assert_eq!(outbox.counts().unwrap().waiting, 3);
    // m0 and m1 are gone; the newest three remain, oldest first.
    let mut seen = Vec::new();
    while let Some(m) = outbox.next_due(100).unwrap() {
        seen.push(m.body.clone());
        outbox.delivered(m.id).unwrap();
    }
    assert_eq!(seen, ["m2", "m3", "m4"]);
}

#[test]
fn a_failed_message_waits_for_its_retry_time_and_counts_the_attempt() {
    let dir = tempfile::tempdir().unwrap();
    let outbox = Outbox::new(open(dir.path()), 10);
    outbox.enqueue("k", "a", None, 1).unwrap();
    outbox.enqueue("k", "b", None, 2).unwrap();
    let a = outbox.next_due(10).unwrap().unwrap();
    outbox.failed(a.id, 500).unwrap();
    // "a" is not due before 500, so "b" is next.
    assert_eq!(outbox.next_due(100).unwrap().unwrap().body, "b");
    assert_eq!(outbox.earliest_retry().unwrap(), Some(0));
    let again = outbox.next_due(500).unwrap().unwrap();
    assert_eq!((again.body.as_str(), again.attempts), ("a", 1));
    outbox.due_now().unwrap();
    assert_eq!(outbox.next_due(0).unwrap().unwrap().body, "a");
}

#[test]
fn the_dedup_key_survives_the_outbox_reopening() {
    let dir = tempfile::tempdir().unwrap();
    {
        let outbox = Outbox::new(open(dir.path()), 10);
        outbox
            .enqueue(
                "backup.failed",
                "a",
                Some(("backup|disk vol", Some("6h"))),
                1,
            )
            .unwrap();
        outbox.enqueue("plain", "b", None, 2).unwrap();
    }
    let outbox = Outbox::new(open(dir.path()), 10);
    let a = outbox.next_due(10).unwrap().unwrap();
    assert_eq!(a.dedup_key.as_deref(), Some("backup|disk vol"));
    assert_eq!(a.dedup_window.as_deref(), Some("6h"));
    outbox.delivered(a.id).unwrap();
    let b = outbox.next_due(10).unwrap().unwrap();
    assert_eq!((b.dedup_key, b.dedup_window), (None, None));
}
