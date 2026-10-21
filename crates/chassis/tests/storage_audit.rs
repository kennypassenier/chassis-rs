//! A delete from the Storage page leaves exactly one audit line (3.11.0).
//! Its own test binary: the line is captured by a process-wide subscriber
//! installed before anything logs, which a unit test among others cannot
//! rely on (tracing caches each call site's interest).
#![cfg(feature = "storage")]

use std::sync::{Arc, Mutex};

use chassis::storage::{AppDb, AppDbSpec, DataKind, Migration, Selector, TimeFormat};

#[derive(Clone, Default)]
struct Capture(Arc<Mutex<Vec<u8>>>);

impl std::io::Write for Capture {
    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(b);
        Ok(b.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Capture {
    type Writer = Capture;
    fn make_writer(&'a self) -> Capture {
        self.clone()
    }
}

#[test]
fn a_delete_writes_one_audit_line_with_the_kind_the_selection_and_the_count() {
    let cap = Capture::default();
    tracing::subscriber::set_global_default(
        tracing_subscriber::fmt()
            .with_writer(cap.clone())
            .with_ansi(false)
            .finish(),
    )
    .unwrap();
    let app = AppDb::open_in_memory(
        AppDbSpec::new(vec![Migration::sql(
            "CREATE TABLE events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL) STRICT;",
        )]),
        vec![
            DataKind::new("events", "Events")
                .table("events")
                .time_column("at", TimeFormat::UnixSeconds),
        ],
    )
    .unwrap();
    app.write_blocking(|tx| {
        // Three rows far in the past, two from now.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        for at in [1, 2, 3, now, now] {
            tx.execute("INSERT INTO events (at) VALUES (?1)", [at])?;
        }
        Ok(())
    })
    .unwrap();
    let sel = Selector::all().older_than(86_400);
    let preview = app.preview("events", &sel).unwrap();
    assert_eq!(preview.stats.rows, 3);
    cap.0.lock().unwrap().clear();
    let done = app
        .delete("events", &sel, &preview.token, "events")
        .unwrap();
    assert_eq!(done.deleted, 3);
    let log = String::from_utf8(cap.0.lock().unwrap().clone()).unwrap();
    let audit: Vec<&str> = log.lines().filter(|l| l.contains("audit=true")).collect();
    assert_eq!(audit.len(), 1, "exactly one audit line: {log}");
    assert!(
        audit[0].contains("kind=\"events\"") || audit[0].contains("kind=events"),
        "{}",
        audit[0]
    );
    assert!(audit[0].contains("deleted=3"), "{}", audit[0]);
    assert!(
        audit[0].contains("cutoff_secs"),
        "the selection is in the line: {}",
        audit[0]
    );
    assert!(audit[0].contains("remaining=2"), "{}", audit[0]);
}
