//! The conformance helper for [`SyncSource`] (testing plan of
//! `docs/LOCAL_DB_DESIGN.md`): any adapter, the kit's [`SqliteChangeLog`]
//! or an app's own, must behave the same. The adapter's test implements
//! [`SourceHarness`] (how to record a change in its store) and calls
//! [`assert_conforms`].

use std::collections::BTreeSet;

use super::cursor::Cursor;
use super::feed::{Feed, Page};
use super::log::{SyncFuture, SyncSource};

/// How a test records changes in the adapter's own store. Each method
/// writes the item and its change the way the app's write path does.
pub trait SourceHarness {
    /// The source under test.
    fn source(&self) -> &dyn SyncSource;
    /// Item `key` written at `rev`, visible to `scope`, body an object.
    fn upsert<'a>(
        &'a self,
        coll: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()>;
    /// Item `key` deleted at `rev`.
    fn delete<'a>(
        &'a self,
        coll: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()>;
    /// A write that fails after recording its change (a crash before
    /// commit): neither the item nor the change may remain.
    fn aborted_upsert<'a>(
        &'a self,
        coll: &'a str,
        scope: &'a str,
        key: &'a str,
        rev: u64,
    ) -> SyncFuture<'a, ()>;
    /// What retention does: remove every tombstone of the collection and
    /// raise the floor past them.
    fn prune_tombstones<'a>(&'a self, coll: &'a str) -> SyncFuture<'a, ()>;
}

const C: &str = "conformance";
const ME: &str = "u1";
const SHARED: &str = "shared";

fn page(feed: Feed) -> Page {
    match feed {
        Feed::Page(p) => p,
        Feed::Resync { floor } => panic!("expected a page, got a resync at {floor:?}"),
    }
}

fn keys(p: &Page) -> Vec<&str> {
    p.upserts.iter().map(|u| u.key.as_str()).collect()
}

async fn pull(h: &dyn SourceHarness, scope: &str, since: Option<Cursor>, limit: usize) -> Feed {
    h.source()
        .changes_since(C, scope, since, limit)
        .await
        .expect("the source answers")
}

/// Run every rule against `h`; panics naming the rule that fails.
pub async fn assert_conforms(h: &dyn SourceHarness) {
    let start = page(pull(h, ME, None, 100).await);
    assert!(start.upserts.is_empty() && start.deletes.is_empty() && !start.more);
    for k in ["a", "b", "c"] {
        h.upsert(C, SHARED, k, 1).await.unwrap();
    }
    let all = page(pull(h, ME, None, 100).await);
    assert_eq!(keys(&all), ["a", "b", "c"], "seq order is commit order");
    let cursor = all.cursor;

    h.upsert(C, SHARED, "a", 2).await.unwrap();
    h.upsert(C, SHARED, "a", 3).await.unwrap();
    let again = page(pull(h, ME, Some(cursor), 100).await);
    assert_eq!(
        keys(&again),
        ["a"],
        "one entry per key, however often it changed"
    );
    assert_eq!(again.upserts[0].rev, 3, "the newest state");

    h.delete(C, SHARED, "b", 2).await.unwrap();
    let gone = page(pull(h, ME, Some(again.cursor), 100).await);
    assert_eq!(gone.deletes.len(), 1);
    assert_eq!(gone.deletes[0].key, "b");
    let fresh = page(pull(h, ME, None, 100).await);
    assert_eq!(
        keys(&fresh),
        ["c", "a"],
        "a read from the beginning: live items, no tombstones"
    );
    assert!(fresh.deletes.is_empty());

    h.aborted_upsert(C, SHARED, "ghost", 1).await.unwrap();
    let quiet = page(pull(h, ME, Some(gone.cursor), 100).await);
    assert!(
        quiet.upserts.is_empty() && quiet.deletes.is_empty(),
        "an aborted write leaves no change"
    );

    scope_rules(h).await;
    paging_rules(h).await;
    floor_rules(h).await;
}

async fn scope_rules(h: &dyn SourceHarness) {
    h.upsert(C, "u2", "theirs", 1).await.unwrap();
    let mine = page(pull(h, ME, None, 100).await);
    assert!(
        !keys(&mine).contains(&"theirs"),
        "another login's item is never served"
    );
    assert!(
        keys(&mine).contains(&"c"),
        "shared items are served to every login"
    );
    let theirs = page(pull(h, "u2", None, 100).await);
    assert!(keys(&theirs).contains(&"theirs") && keys(&theirs).contains(&"c"));
}

async fn paging_rules(h: &dyn SourceHarness) {
    let expected: BTreeSet<String> = page(pull(h, ME, None, 100).await)
        .upserts
        .into_iter()
        .map(|u| u.key)
        .collect();
    let (mut seen, mut since) = (BTreeSet::new(), None);
    for _ in 0..50 {
        let p = page(pull(h, ME, since, 1).await);
        assert!(
            p.upserts.len() + p.deletes.len() <= 1,
            "a page holds at most `limit` changes"
        );
        seen.extend(p.upserts.iter().map(|u| u.key.clone()));
        since = Some(p.cursor);
        if !p.more {
            break;
        }
    }
    assert_eq!(seen, expected, "pages of one cover everything exactly once");
}

async fn floor_rules(h: &dyn SourceHarness) {
    h.prune_tombstones(C).await.unwrap();
    let floor = h.source().floor(C).await.unwrap();
    assert!(
        floor > Cursor::START,
        "pruning a tombstone raises the floor"
    );
    match pull(h, ME, Some(Cursor::START), 100).await {
        Feed::Resync { .. } => {}
        other => panic!("a cursor below the floor must resync, got {other:?}"),
    }
    // The read from the beginning must hand out a cursor the next pull accepts.
    let (mut since, mut last) = (None, None);
    for _ in 0..50 {
        let p = page(pull(h, ME, since, 1).await);
        last = Some(p.cursor);
        since = Some(p.cursor);
        if !p.more {
            break;
        }
    }
    assert!(
        last.unwrap() >= floor,
        "the end of a read from the beginning is not below the floor"
    );
    page(pull(h, ME, last, 100).await);
}
