//! The example's tables and the two kinds of data the Storage page shows. Its
//! own module because the seed SQL is as long as everything else here.

use chassis::App;
use chassis::storage::{AppDbSpec, DataKind, Filter, Migration, TimeFormat};

/// The example's tables, with a seed of made-up history: 4 000 delivery
/// attempts over the last 120 days and 40 reminders over the last 60.
const SCHEMA: &str = "
CREATE TABLE deliveries (
    id INTEGER PRIMARY KEY,
    delivered_at INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    topic TEXT NOT NULL,
    note TEXT NOT NULL
) STRICT;
CREATE TABLE reminders (
    id INTEGER PRIMARY KEY,
    due_at TEXT NOT NULL,
    done INTEGER NOT NULL,
    note TEXT NOT NULL
) STRICT;
WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 3999)
INSERT INTO deliveries (delivered_at, outcome, topic, note)
SELECT CAST(strftime('%s', 'now') AS INTEGER) - i * 2600,
       CASE WHEN i % 11 = 0 THEN 'failed' WHEN i % 5 = 0 THEN 'retried' ELSE 'delivered' END,
       CASE i % 4 WHEN 0 THEN 'alerts' WHEN 1 THEN 'backups' WHEN 2 THEN 'updates' ELSE 'garden' END,
       'Webhook answered after ' || (i % 900) || ' ms; payload of ' || (200 + i % 700) || ' bytes'
FROM n;
WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 39)
INSERT INTO reminders (due_at, done, note)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || (i * 36) || ' hours'),
       CASE WHEN i % 3 = 0 THEN 0 ELSE 1 END,
       'Look at message #' || (1000 + i)
FROM n;
";

/// 3.11.0: the app's own database and two kinds of data for the Storage
/// page. Seeded once with a few months of made-up history, so the page
/// has something to preview and clean up (an example, not a database).
pub(crate) fn declare(app: &mut App) {
    app.app_db(AppDbSpec::new(vec![Migration::sql(SCHEMA)]))
        .expect("the app database is declared once");
    app.storage_kind(
        DataKind::new("deliveries", "Delivery log")
            .description("Every attempt to hand a message to a webhook, with how it ended.")
            .table("deliveries")
            .time_column("delivered_at", TimeFormat::UnixSeconds)
            .unit("attempts")
            .filter(Filter::choice(
                "outcome",
                "Outcome",
                "outcome",
                ["delivered", "retried", "failed"],
            ))
            .filter(Filter::text("topic", "Topic contains", "topic")),
    );
    app.storage_kind(
        DataKind::new("reminders", "Reminders")
            .description("Follow-ups someone set on a message.")
            .table("reminders")
            .time_column("due_at", TimeFormat::Rfc3339)
            .filter(Filter::flag("done", "Only finished reminders", "done"))
            .finished_by_definition("done <> 0 AND due_at < :now_rfc3339"),
    );
}
