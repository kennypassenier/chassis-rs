# Storage on sqlite (3.11.0 design, draft)

Kenny, 2026-10-21 (homelab thread): the kit gets a sqlite storage layer now,
two files in the service's state dir (the kit's own data, the app's data),
a budget of about 50 MB that only warns, targeted delete controls on a kit
page "Storage", and a write pause for the backup. Automatic cleanup may
only ever touch the app file. This document is the design; the open
questions go to Kenny in one form before anything is built.

## Facts it builds on

- Today the kit keeps `clients.json.enc`, `sessions.json.enc` (or
  `sessions.open.json.enc`) and `passkeys.json.enc` under the state root
  (AR5, `shell/store.rs`): `{v, nonce, ciphertext}` with XChaCha20-Poly1305
  under `<P>_SECRET_KEY`, written temp + fsync + rename, each write under a
  `WriteTicket`; `rekey_dir` re-seals every `*.json.enc`.
- `shell/backup.rs`: a global gate (writer count, paused flag, deadline,
  `Mode::{Writes,Full}`); pausing waits up to 30 s for tickets, runs
  `App::on_backup_pause` hooks, answers; a hook error falls back to stopping
  the unit; a dead-man resumes at the `--for` deadline.
- kyu uses rusqlite 0.40.2 `bundled` (its ADR T2): WAL, `synchronous=FULL`,
  `busy_timeout` 5 s, one write connection plus a small read pool,
  `spawn_blocking`, `BEGIN IMMEDIATE`, `wal_checkpoint(TRUNCATE)`, numbered
  migrations. http-switchboard builds static musl; `bundled` compiles there
  (a C compiler is already in the image for `ring`).
- The homelab admin dashboard: 6 JSON stores, 730 KB live on CT 120; it
  migrates them into the app file in one transaction after 3.11.0.

## Design

1. **Crate:** rusqlite 0.40.2 `bundled` (same as kyu), behind a cargo
   feature `storage`, on by default. No SQLCipher (no musl story).
2. **Files:** `<name>.db` (app) and `<name>-kit.db` (kit). Cleanup, VACUUM
   and delete APIs take only an `AppDb` handle, which cannot be built for the
   kit file. Both files are listed in the backup controller's paths.
3. **Connections:** one writer behind a mutex plus 2 read-only readers;
   pragmas WAL, `synchronous=FULL`, `busy_timeout=5000`, `foreign_keys=ON`;
   every call under `spawn_blocking`; a write opens `BEGIN IMMEDIATE` and
   holds a `WriteTicket`, so the existing pause gate covers sqlite writes.
4. **App API (additive):** `App::app_db(AppDbSpec { migrations, import })`,
   `App::storage_budget`, `App::storage_kind(DataKind)`,
   `App::on_storage_warn`; `AppDb::{read, write, stats, vacuum_into}`.
   Migrations are a numbered list, each atomic; a newer database than the
   binary is refused. `DataKind::new(id, label)` with description, table,
   time column, declared filters (choice, flag, text), and an escape hatch
   for kinds that are not one table. Names are validated at start.
5. **Import hook:** runs once after migrations in ONE transaction; on error
   or a count mismatch it rolls back, the app keeps running on its old
   files, a problem is raised and it retries at the next start; on success
   the marker row is committed and the old files are renamed `*.migrated`.
6. **Budget:** default 50 MB, warn at 40 MB, overridable in code and by
   `<P>_STORAGE_BUDGET_MB` / `<P>_STORAGE_WARN_MB`. Size = page_count ×
   page_size + WAL, per file and summed. Checked at start, every 10 minutes
   and after each Storage action. Surfaces: a status-page problem, a Storage
   page banner, metrics, the app hook. WARN ONLY: the kit never refuses a
   write and never removes useful data. **Changeable on the Storage page**
   (Kenny, 2026-10-21 17:34: "kan die ook aangepast worden"): the budget and
   the warn line are kept as two rows (`storage_budget_mb`,
   `storage_warn_mb`) in `chassis_meta` of the app file (the kit file when
   there is no app file), set by `POST /api/kit/storage/budget`. Precedence,
   highest first: environment, flag or file setting; the page setting;
   `App::storage_budget`; the default (50 / 40, or 80 % of a budget at or
   under 40 MB). A value the configuration fixes is shown as fixed with its
   reason and refused by the API; "Reset to default" deletes the stored rows.
   Whole MB, budget 1 to 100 000, warn line at least 1 and below the budget
   (a 1 MB budget warns at 1 MB). A change is one audit line and the budget
   is checked again at once. Stored values that no longer fit (the budget
   was fixed lower since) are ignored with a log line, never a start error.
7. **Pause:** an internal pause hook per file runs
   `wal_checkpoint(TRUNCATE)` after the tickets drained; busy for 5 s falls
   back to the unit stop (existing path). Resume needs nothing new.
   `backup_pause: chassis` in the homelab works as is.
8. **Storage page** (`/storage`, kit page): budget bar with the split per
   file (the kit file marked read-only), one row per kind (rows, bytes,
   oldest, newest), per kind "older than" plus the declared filters, a
   read-only preview (count, size, oldest/newest, a few sample rows), then a
   typed confirmation and a single-transaction delete that re-counts first.
   VACUUM of the app file on demand only, with the reclaimable size shown.
   Stable control ids for the homelab Live view (listed in DASHBOARD.md); JSON twins under
   `/api/kit/storage`.

## Decided (Kenny, 2026-10-21 06:58, form chassis-rs-3-11-0-opslag)

- kit-stores: **In 3.11.0.** Clients, sessions and passkeys move into
  `<name>-kit.db` at the first start, one transaction; on failure nothing is
  written and the app keeps the old files; on success the old files become
  `*.migrated`. Secrets stay sealed per field with the same key.
- auto-expired: **Only rows finished by their own definition** (expired
  sessions, ended snoozes) are removed automatically, daily, counted in the
  log. Everything else only through the Storage page with confirmation.
- app-encryption: **Not encrypted**, like the JSON today; secrets belong in
  the kit file.

Defaults (Kenny can still change them): warn at 40 of 50 MB; the budget
counts both files with the kit part shown; the typed confirmation is the
kind's name; feature `storage` on by default; service-prefixed file names;
a busy checkpoint falls back to the unit stop.

# Preferences in the database (3.12.0)

Kenny, 2026-10-21: **app state belongs in the database, not the browser,
unless the webapp truly needs it to work.** kp-themes stays a pure browser
package and is not responsible for anything outside the browser. And it must
stay easy to switch storage later: ports and adapters (arch-22).

## The port and its two adapters

`storage::PrefStore` is the port: `get`, `set`, `remove`, `list(prefix)`, all
async-friendly (boxed futures, so it is object-safe and adds no dependency)
and all taking a **scope**. Adapters:

| Adapter | Where | For |
|---|---|---|
| `SqlitePrefStore` | table `chassis_prefs` of the APP database (`<name>.db`) | production |
| `MemoryPrefStore` | a map in the process | tests of code that takes a `PrefStore` |

The table is created beside the app's own schema when the app database
opens (outside its numbered migrations, like `chassis_meta`; the `chassis_`
prefix is reserved to the kit so it cannot clash). It lives in the app file,
never the kit file: the Storage page's targeted delete reaches it, and the
kit file stays out of reach of every cleanup path. It is `STRICT, WITHOUT
ROWID`, primary key `(scope, key)`; a row is `value TEXT` and `updated_at`.
Another database later is one more `PrefStore` (`App::prefs_store` takes it).

`set` carries the quota (bytes and keys of one scope) because only the store
can check it in the same atomic step as the write.

## Scope: the login identity

The dashboard has one admin today, who signs in with the token or with a
passkey. **A preference belongs to the login identity, not to the device and
not to the passkey**, so it follows the admin from the phone to the PC. The
scope is `ADMIN_SCOPE` (`"admin"`) for every admin session, bearer included.
The port takes the scope as a plain string on every call and
`shell`-side code gets it from one function, `login_scope(&Caller)`; a future
multi-user kit returns the user's id there and nothing else changes: the
table, the port, the routes and the browser script already carry it.

