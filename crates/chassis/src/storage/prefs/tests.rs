//! Tests of both preference adapters through the one [`PrefStore`] contract.

use super::*;
use std::sync::Arc;

/// The port behaves the same behind both adapters: scopes apart, a
/// prefix listing, the quota enforced in the store's own step.
async fn port_contract(store: Arc<dyn PrefStore>) {
    let q = Quota {
        max_scope_bytes: 40,
        max_keys: 3,
    };
    assert_eq!(store.get("admin", "a").await.unwrap(), None);
    assert_eq!(
        store.set("admin", "a", "1", q).await.unwrap(),
        SetOutcome::Stored
    );
    store.set("admin", "ab", "2", q).await.unwrap();
    store.set("other", "a", "x", q).await.unwrap();
    assert_eq!(store.get("admin", "a").await.unwrap().as_deref(), Some("1"));
    assert_eq!(store.get("other", "a").await.unwrap().as_deref(), Some("x"));
    // Overwrite keeps one row.
    store.set("admin", "a", "11", q).await.unwrap();
    let all = store.list("admin", "").await.unwrap();
    assert_eq!(
        all,
        vec![("a".into(), "11".into()), ("ab".into(), "2".into())]
    );
    assert_eq!(store.list("admin", "ab").await.unwrap().len(), 1);
    // `%` and `_` in a prefix mean themselves.
    store.set("admin", "p_q", "1", q).await.unwrap();
    assert_eq!(store.list("admin", "p_").await.unwrap().len(), 1);
    assert_eq!(store.list("admin", "p%").await.unwrap().len(), 0);
    // Key count: three held, a fourth is refused, the scope of another
    // login is unaffected.
    assert!(matches!(
        store.set("admin", "d", "1", q).await.unwrap(),
        SetOutcome::ScopeFull { keys: 3, .. }
    ));
    store.set("other", "b", "1", q).await.unwrap();
    // Bytes: replacing a value counts the room it frees.
    let q2 = Quota {
        max_scope_bytes: 8,
        max_keys: 9,
    };
    assert!(matches!(
        store.set("tiny", "k", "123456789", q2).await.unwrap(),
        SetOutcome::ScopeFull { .. }
    ));
    store.set("tiny", "k", "1234567", q2).await.unwrap();
    store.set("tiny", "k", "123456", q2).await.unwrap();
    assert!(store.remove("admin", "a").await.unwrap());
    assert!(!store.remove("admin", "a").await.unwrap());
    assert_eq!(store.get("admin", "a").await.unwrap(), None);
}

#[tokio::test]
async fn both_adapters_keep_the_port_contract() {
    port_contract(Arc::new(MemoryPrefStore::new())).await;
    let db = AppDb::open_in_memory(super::super::AppDbSpec::new(Vec::new()), Vec::new()).unwrap();
    port_contract(Arc::new(SqlitePrefStore::new(db))).await;
}

/// Multi-byte keys and values count in bytes in both adapters.
#[tokio::test]
async fn the_quota_counts_bytes_not_characters() {
    let q = Quota {
        max_scope_bytes: 8,
        max_keys: 9,
    };
    let db = AppDb::open_in_memory(super::super::AppDbSpec::new(Vec::new()), Vec::new()).unwrap();
    let sqlite = SqlitePrefStore::new(db);
    let mem = MemoryPrefStore::new();
    // "é" is 2 bytes: key a (1) + value of 3 chars (6 bytes) = 7 fits; 4 chars = 9 does not.
    for store in [&sqlite as &dyn PrefStore, &mem] {
        assert_eq!(
            store.set("s", "a", "ééé", q).await.unwrap(),
            SetOutcome::Stored
        );
        assert!(matches!(
            store.set("s", "a", "éééé", q).await.unwrap(),
            SetOutcome::ScopeFull { .. }
        ));
    }
}
