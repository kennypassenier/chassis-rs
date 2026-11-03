# Local database per web app (feat-localdb-1, design, draft)

Kenny, 2026-11-02, choice "Echte lokale database": "Bij dit soort pwa's wil ik
dat we vele dingen kunnen offline opslaan, in een eigen database. dat kan dan
syncen met de server app". Standing rule: **the server is always the master
and always right** (the three rules of OFFLINE_DESIGN.md hold unchanged).
Design only; nothing is built before Kenny answers the open questions.

## In short (for Kenny)

- Each web app gets its own small database in the browser, one shelf per kind
  of thing (dishes, ingredients, freezer). Screens read from that shelf, so
  they work the same with or without a connection, and they can search and
  sort locally.
- The shelves fill themselves: the app asks the server "what changed since
  last time?" at start, when the connection returns, every few minutes and
  when the server hints that something changed. Only the changes travel.
- The server stays the boss. What it says replaces the local copy; what it
  deleted disappears locally; an edit it refuses goes to the failed list and
  you decide, exactly as today.
- Changes made offline wait in the same queue as today and are sent in order.
  New things made offline get their final id on the device, so nothing has
  to be renamed later.
- "Keep everything" / "per item", the 50 MB cap and the logout warning stay
  as they are. Logging out empties the local database.
- Today's chassisData keeps working next to it; apps move screen by screen.
  Kitchen goes first.

## Terms

- **Collection**: one kind of item the app syncs (`dishes`). Every item has a
  key (a string, a UUID for new items) and a revision (`u64`, the kit's rev).
- **Feed**: the server's list of changes of one collection after a cursor.
- **Tombstone**: the record that an item was deleted, kept for a while so
  devices learn about the deletion.

## Decisions

### 1. Collections are declared once, in Rust

`SyncCollection::new("dishes").key("id").rev("rev").index("name")
.index("category")` on the server. The kit serves the declarations as
`GET /api/sync` (name, key field, rev field, indexes, a schema hash); the page
builds its IndexedDB stores from that answer. Reason: one place to declare,
nothing a person has to keep in step between Rust and JS (the "no
hand-maintained files" rule). Indexes are only for local queries; the server
ignores them. Names are validated at start like `DataKind` names.

### 2. The sync protocol: one changes feed per collection

`GET /api/sync/<collection>?since=<cursor>&limit=<n>` answers

```json
{ "upserts": [{ "key": "…", "rev": 7, "data": { … } }],
  "deletes": [{ "key": "…", "rev": 8 }],
  "cursor": "…", "more": false }
```

- The cursor is opaque to the page (the server encodes a sequence number).
  No `since` means "from the beginning": every live item, no tombstones.
- Pages hold at most `limit` changes (default 500, max 2000, configurable per
  collection); `more: true` means ask again at once with the new cursor.
- Each key appears at most once per answer, with its newest state: the feed
  sends the current item, never the history. Reason: the server is the
  master, so only its latest word matters, and pages stay small.
- A cursor older than the retention window answers **410** in the kit's error
  shape with `code: "resync"`. The page then does a full resync (see 6).
- The feed is behind the app's login (the same cookie, `dashboard_routes`
  style); answers are `Cache-Control: no-store` so the worker never caches
  them (`fix-swcache-1` stands).

### 3. Server side: one port, two adapters

The port is `SyncSource`: `changes_since(collection, scope, cursor, limit)` and
`floor(collection)` (the oldest cursor still served). Reason: arch-22 ports and
adapters, and the apps store data differently today.

- **`SqliteChangeLog`** (default, for apps on the app database, STORAGE_DESIGN
  section 4): a kit table `chassis_sync` in the APP file, one row per
  `(collection, scope, key)` with `seq`, `rev`, `deleted`, `changed_at`. The app
  calls `tx.sync_upsert("dishes", key, rev)` or `tx.sync_delete(…)` inside the
  same `AppDb::write` transaction as its own change. Each call takes the next
  value of a per-file counter in `chassis_meta` and replaces the row for that
  key, so the table is "a seq column plus tombstones" in one place and never
  grows past one row per item ever seen. The feed reads rows with
  `seq > cursor` in seq order and asks the app's `SyncLoad` adapter for the
  current bodies of the upserted keys (the log stores no copies of the data).
  Reason: written in the same transaction, a change can never be missed or
  reported without having happened; the single writer (`BEGIN IMMEDIATE`)
  makes `seq` commit in order, so a cursor never skips a late commit.
- **App adapter**: an app that does not keep its data in the app database
  implements `SyncSource` itself, under the same rules (a monotonic counter
  and tombstones written atomically with the data). No app needs one now
  (every app keeps its data in its app database). The kit ships a conformance test helper for the port.

Alternative considered and rejected as the default: every app answers
"changes since" from its own `rev` columns. A per-item rev is not a global
order and cannot express deletions, so each app would rebuild tombstones and
a cursor, with the same bugs in each.

### 4. Retention and old devices

Tombstones older than the window (default 30 days, `SyncCollection::retain`
and `<P>_SYNC_RETAIN_DAYS`) are removed by the kit's daily cleanup (they are
"finished by their own definition", the rule of STORAGE_DESIGN). The highest
removed `seq` becomes the collection's floor in `chassis_meta`. A device whose
cursor is below the floor gets the 410 and resyncs whole. Reason: a device that
was away for months cannot learn which deletions it missed, so it starts over
from the master; with Kitchen's sizes that costs one download of well under a
megabyte.

### 5. Scope: per login

Every row carries the scope of `login_scope(&Caller)` (STORAGE_DESIGN 3.12.0),
or `"shared"` for a collection declared `.shared()`. The feed only answers rows
of the caller's scope plus shared ones. Today's apps have one login per
household, so in practice everything is shared; a future multi-user kit
changes nothing in the protocol.

### 6. Client: an IndexedDB database per app

- Database `chassis-db:<app>`, separate from `chassis-data:<app>`, with one
  object store per collection (keyPath = the key field, the declared indexes)
  and a `_meta` store (cursor, schema hash, last pull time per collection).
  Reason: the two can coexist during migration and be purged together; a
  version bump of one never blocks the other.
- A stored record is the server's item exactly as the feed sent it, plus
  `syncedAt`. **Pending edits are an overlay**, not written into the record:
  queries put the queued (not failed) writes of that collection on top and mark
  the result `pending: true`. Reason: the record is then always the server's
  word (rule 1), a refused edit disappears from view by itself the moment it
  moves to the failed list (rule 3), and nothing ever has to be rolled back.
- Applying a page: upserts replace the record whole; deletes remove it (rule
  2), also when an overlay is pending (the replay then gets the server's
  404/410 and the edit goes to the failed list, as today). Page and cursor are
  written in ONE IndexedDB transaction, so a crash re-reads the page.
- Full resync: pull from the beginning into the same store, stamping a resync
  generation; when the last page is in, delete every record without the new
  generation. The old data stays readable until then.
- Schema hash changed (an index added): the store is dropped and resynced;
  the queue lives in the other database and is untouched.
- **Triggers**: page start, the `online` event, the page becoming visible, a
  timer (default 5 minutes, configurable), right after each own successful
  write, the band's retry, `chassisData.db.sync()`, and a hint (next point).
  Pulls of one collection never run twice at once.
- **Hints**: an app that uses the kit's live channel (`shell/live.rs`, SSE)
  publishes `sync` with the collection names after a write; open pages pull
  at once. A `resync` event of the channel pulls every collection. Web Push
  cannot wake a page silently (browsers demand a visible notification), so the
  worker pulls only when a notification the app sends anyway arrives with
  `sync` in its data. Reason: no new channel, no fake notifications.

### 7. Local query API

`chassisData.db.collection('dishes')` returns `get(key)`, `all()`,
`where(index).equals(v)` / `.between(a, b)` / `.startsWith(s)`, `.sortBy`,
`.limit`, `count()`, and `watch(fn)` (called after every applied page or local
edit). Results carry `pending`, and `partial` when "keep everything" is off.
Reason: the screens of Kitchen need list, search and filter; that is what an
IndexedDB index gives without a query engine. No joins, no full text: an app
filters further in its own code. No dependency (no Dexie): the kit already
wraps IndexedDB in one file and keeps doing so.

### 8. Writes, ids and conflicts: the queue of chassisData

- `col.put(key, item)`, `col.patch(key, fields)`, `col.delete(key)` go through
  the existing write queue to the app's item routes, with `If-Match` = the rev
  of the record they were made from. The collection declares its routes
  (`.routes("/data/dishes", "/data/dishes/:id")`), so no new write endpoint is
  needed and the server code that checks a write stays the app's.
- `col.create(item)` makes the key with `crypto.randomUUID()` on the device and
  POSTs to the list route with that key in the body and an `Idempotency-Key`.
  The server must accept a well-formed UUID it does not hold yet and refuse
  one it holds (409 `exists`) unless the idempotency key matches. Reason: the
  item is usable, linkable and editable offline under its final id; nothing
  is renamed after the sync.
- Conflicts: the server wins, every time, with the rules and the failed-list
  drawer of OFFLINE_DESIGN.md unchanged. No merge, no `overwrite`.
- After a write succeeds the page pulls that collection (decision 6), so the
  record becomes the server's answer through the same road as every change.

### 9. Keeping, cap, logout

- "Keep everything" on (Kitchen's default): every upsert is stored.
- Off: upserts are stored only for kept keys (`col.keep(key, true)`); a newly
  kept key is fetched once through its item route; deletes are always applied.
  Items the feed skipped are not remembered; a later "keep" fetches them.
- The 50 MB cap counts both databases together. At 80 % the warning fires; at
  the cap new upserts are not stored (never evicted), the collection is marked
  `stale` and its cursor does not move, so nothing is lost once there is room.
  Deletes are still applied. Queued writes are always accepted.
- Logout: the existing guard counts unsent edits, warns, then deletes
  `chassis-db:*` together with `chassis-data:*`; the worker does the same on
  `/logout`. The per-device keep settings stay.

### 10. Security

- Only the logged-in session's data reaches the device: the feed filters by
  scope and sits behind the app's login; a 401 stops pulling and shows the
  kit's expired-session message.
- No tokens or headers are ever stored or sent by the page: the session cookie
  authenticates, same-origin paths only, as in chassisData.
- The local database is not encrypted (browsers offer no key that survives a
  reload without the person typing one); logout purges it. Apps must not
  declare a collection for secrets.

## Server contract, as built (feat-localdb-2)

The server half lives in `chassis::storage::sync` (the `storage` feature;
the routes need `dashboard`). The wire shapes the page is built against:

- `GET /api/sync` answers
  `{"collections": [{"name", "key", "rev", "indexes": [..], "shared": bool,
  "routes": {"list", "item"} | null, "schema": "<16 hex>"}], "schema": "<16 hex>"}`.
  `key` and `rev` are the item's field names; `routes` is what
  `SyncCollection::routes` declared (`:id` stands for the key). `schema` of a
  collection changes when its name, key, rev field, indexes or `shared` change
  (not when retention does); the top-level `schema` hashes all of them.
- Collection names are `[a-z][a-z0-9_]{0,39}`; the item route has exactly one `:param`. The first feed page is requested without `since`; `limit` is optional. The `sync` hint data may be `{"collections": [..]}` (what the server sends).
- `GET /api/sync/<collection>?since=&limit=` answers exactly the shape of
  decision 2. Unknown collection: 404 in the kit's shape. A `since` the server
  did not make: 400 in the kit's shape.
- **Cursors are opaque and come in two kinds.** Between the pages of a read
  from the beginning (no `since`) the cursor is a *sweep* cursor: the feed keeps
  listing live items only and the retention floor does not apply to it, because
  a sweep sends no tombstones and the page drops what the sweep did not
  mention anyway. The cursor of the last page of a sweep (`more: false`) is a
  normal cursor, never below the floor. The page treats both alike: keep the
  string, send it back as `since`. (Without this, a read from the beginning
  could hand out a cursor the next pull refuses with a 410.)
- The 410 body is `{"error", "remedy", "code": "resync"}`; `Cache-Control:
  no-store` on every sync answer.
- `limit` defaults to 500 (per collection: `SyncCollection::page_limit`) and is
  clamped to 1..=2000. A page holds at most `limit` changes (upserts plus
  deletes). An upsert whose item is gone by the time the body is read is left
  out; its delete arrives in a later page.
- Scope: a row is served to the login that owns it and to everyone when it was
  recorded with `tx.sync_upsert` / `tx.sync_delete` (scope `shared`). A
  per-login collection records with `tx.sync_upsert_for(collection, scope, key,
  rev)` where `scope` is `login_scope(&caller)`.
- The `sync` hint is `sync` on the live channel with data
  `{"collections": ["dishes"]}` (`storage::sync::publish_hint(&live, &[..])`,
  with the `live` feature). The existing `resync` event of the channel is
  unchanged.
- The same hint over Web Push: `storage::sync::publish_sync_push(&app.push(), Push::new(..), &["dishes"])`
  (the `push` feature) sends the notification with `"sync": ["dishes"]` in its data (`Push::sync`; an
  empty list means every collection). The notification is still shown.
- Retention: `<P>_SYNC_RETAIN_DAYS` (a knob; when set by flag, environment or
  file it wins over `SyncCollection::retain`), else the collection's `retain`,
  else 30 days.
- `chassis_sync` (and the `chassis_meta` table its counter lives in) is created
  with `CREATE TABLE IF NOT EXISTS` every time the app file opens, BEFORE the
  app's migrations and import run, not as a numbered migration. So a migration,
  the import or `AppDbSpec::on_open` may already call `tx.sync_upsert`.
- Existing rows: `storage::sync::backfill(tx, collection, rows)` (shared scope)
  and `backfill_for(tx, collection, scope, rows)` take `(key, rev)` pairs and
  record each item that the change log does not hold yet. Idempotent: a retry
  records nothing new and never overwrites a later change or tombstone. Returns
  how many it recorded. Call it from a `Migration::code` step that adopts the
  collection, or from the import.
- Startup work: `AppDbSpec::on_open(|db: &AppDb| ..)` runs once, synchronously,
  after the migrations and the import, on the already usable handle. A failure
  is logged and listed in `AppDb::problems()` (like a failed import); it does
  not stop the start. (No awaitable `opened()`: `App::app_db` is a handle that
  opens inside `start`, and a hook inside the spec fits the existing import
  hook and keeps startup work in one place.)
- Tests: `storage::sync::create_tables(&Connection)` creates the same tables
  (and `chassis_meta`) on a plain connection, so an app's unit test needs no
  copy of the DDL.
- Create rules (decision 8) are helpers: `client_key(&str)` (400 unless a
  36-character UUID), `check_create(held, sent_idempotency, recorded_idempotency)`
  returning `Create`, `Replay` or `KeyExists` (409 `code: "exists"`).

## Migration from today's chassisData

Additions only, so a kit minor. Both run side by side: `chassisData` keeps its
response cache for routes that are not in a collection, and becomes the
transport of the local database (its queue, its failed list, its band, its
logout guard, its cap accounting). An app moves one screen at a time from
`chassisData.get(path)` to `chassisData.db.collection(…)`; when no screen reads
a cached route any more, the route leaves `configure({ routes })`.

## What each app changes

**Kitchen** (first): moves its data from `kitchen.json` into its app database
(Kenny's rule, open question 1), importing the file once through
`AppDbSpec::with_import`. Then:
1. Server: one table per collection (dishes, dish_parts, dish_categories,
   ingredients, ingredient_categories, freezer, shelf, resting, log), each
   write calling `tx.sync_upsert` / `tx.sync_delete` in the same transaction.
   Drafts and settings become tables too, outside the sync manifest.
2. Server: `create` accepts a client UUID as described in decision 8.
3. Server: publish `sync` on its live channel after each write (if Kitchen
   takes the live channel; else the 5-minute timer and the triggers suffice).
4. Page: declare nothing new in JS (the manifest comes from `GET /api/sync`);
   move screens from `/data/kitchen` to collection queries; the recipe "keep
   offline" switch calls `col.keep` instead of `keepItem`.
5. Last: remove `/data/kitchen` and the dish/ingredient routes from
   `OFFLINE_ROUTES` once no screen reads them.

**Other apps on chassis** (Habits, JobTracker, the homelab dashboard): nothing
until they choose to; then `SqliteChangeLog` with one `sync_upsert` /
`sync_delete` call per write in their app database.

## Client contract, as built (feat-localdb-client-1)

Readings of the points the decisions leave open; the server half must match:

- **Opt in**: `chassisData.configure({ name, db: true })` (or `db: { syncUrl, pullMs,
  pageLimit, live }`; defaults `/api/sync`, 300000 ms, the server's limit, no live
  channel). `routes` may be empty when `db` is given. `live` is the app's SSE path.
- **Manifest** (`GET <syncUrl>`): `{ schema: "<hash>", collections: [{ name, key, rev,
  indexes: [..], routes: { list, item } }] }`. `routes` may also be `[list, item]`;
  `item` has exactly one `:param`. A collection without routes can be read, not
  written. `hash` is accepted for `schema`. Names are `[a-z][a-z0-9_]{0,39}`.
- **Feed**: `since` is sent only after the first page; `limit` only when `db.pageLimit`
  is set. Upserts are `{ key, rev, data }`; `data` carries the key field. A
  from-the-beginning answer has no `deletes` the client needs (it ignores them).
- **Stored record**: `{ key, rev, data, size, syncedAt, gen }` with keyPath `key` and
  each index on `data.<index>` (not a flat copy of the item, so item fields never
  collide with bookkeeping). Query results are `data` (plus `pending: true`).
- **Resync**: a pull from the beginning always stamps a generation and prunes
  records without it afterwards, so the first pull, a 410 and "keep everything"
  switched on all take the same road.
- **Timer**: fires every `pullMs` but pulls only while the page is visible; becoming
  visible or focused pulls at once.
- **Hints**: SSE event `sync` with data `["dishes"]`, `{"collections":[..]}` or
  `dishes,freezer` pulls those; empty data or `resync` pulls all.
- **Writes**: `create` POSTs to `routes.list` with the key in the body; `put` / `patch`
  / `delete` go to `routes.item` with `If-Match` = the stored record's rev (none for a
  record that only exists in the queue). Queue, failed list and band are chassisData's.
- **Server-assigned keys** (`SyncCollection::server_keys()`, manifest `keys: "server"`):
  `create(item)` POSTs the item without a key to `routes.list` with its Idempotency-Key.
  Queued, it shows in queries under the temporary key `local:<idempotency key>` (returned as
  `key`, `pending: true`); the entry leaves the overlay once sent, and the pull that follows
  brings the real record. Online, `key` is the key in the server's answer. `put` / `patch` /
  `delete` / `act` on a `local:` key throw (the server has no such item yet).
- **PUT in the overlay** merges into the stored record (`{...stored, ...body}`) for display;
  the server stays master after the send.
- **Item actions**: `collection.action(name, (record, body) => record)` registers the optimistic
  look of POST `<item route>/<name>` (return `null` to hide the record; a throwing transform is
  warned about and ignored). `collection.act(key, name, body)` queues that POST (If-Match = the
  stored rev). The queue stores only the entry; the overlay looks the transform up by name at
  read time, in queue order with the other edits.
- **Cached routes** (data-lists.js, for apps on chassisData without the db): `composites:
  [{ path: '/data/snapshot', lists: { tasks: '/data/tasks/:id' } }]` (both paths also in
  `routes`) makes an item write amend `snapshot.tasks`; a queued POST to a list route whose
  body has the item key is added to the stored whole-collection copies of the list (no query
  string) and the composite fields, and leaves them again when refused; a PUT merges into the
  stored list entry (the item's own copy takes the body).
- **Cap**: the database's bytes are added to the cache and queue bytes of the 50 MB
  cap. A page whose upserts do not fit is not stored (its deletes are), the
  collection is `stale`, the cursor stays.
- **Push hint**: the worker's `push` handler posts `{ type: 'chassis-sync', collections: [..] }` to every
  open window (`sw-push.js`) when the push data has `sync`; the page (db-triggers.js) listens on
  `navigator.serviceWorker` and pulls those collections, or all when the list is empty. No window open:
  nothing happens, the next start pulls.
- **Events** on `window`: `chassis-db-pulled` (`{ collection, pages, removed, stopped }`);
  a 401 uses the existing `chassis-data-synced` with `stopped: "auth"`.
- **Purge**: the logout guard deletes `chassis-db:*` with `chassis-data:*`; so does the
  worker. The keep choices (`chassis-db:<app>:keep`, localStorage) stay.

## Testing plan (run at release only, with Kenny's OK)

- Rust unit: cursor encoding, page limits, one-row-per-key replacement, floor
  and 410, retention cleanup, scope filtering, client-UUID create rules.
- Rust conformance helper for `SyncSource`, run against `SqliteChangeLog` and
  Kitchen's adapter: a write and its change are both there or both absent
  after a simulated crash; seq order equals commit order.
- Node tests (pure modules, in-memory store): applying pages, overlay of
  pending writes, failed edit disappears from view, full resync sweep, keep
  on/off, cap behaviour, schema-hash drop.
- The real IndexedDB store: `crates/chassis/tests/browser/db_store.firefox.mjs` (Firefox, started by hand at
  release, see its header).
- One short Playwright run on Firefox: offline create, edit, reconnect, a
  server-side delete arriving, logout purge with the warning.

## Open questions for Kenny

1. Decided (Kenny, 2026-11-02: "ALLE info gaat vanaf nu in databases, geen
   aparte .json bestanden meer, doe dit in elk project"): Kitchen moves its
   data into its app database and uses the kit's `SqliteChangeLog`; no
   `SyncSource` adapter over `kitchen.json`.
2. Decided (Kenny, 2026-11-02, localdb-retention "30 dagen"): tombstones are
   kept 30 days by default, configurable per app.
3. Decided (Kenny, 2026-11-02, localdb-pull "Elke 5 minuten"): an open app
   also pulls every 5 minutes, besides start, reconnect, focus and hints.
