# Offline app data (feat-offline-1, requested by Kitchen, Kenny 2026-11-02)

Kitchen wants the whole kitchen usable without a connection: "Hele keuken
offline", with one switch "keep everything offline" and, when that is off, a
toggle per item. The kit had no app data layer; the service worker caches
files only, and never JSON (`fix-swcache-1` stands). This adds explicit app
data with revisions, in two halves: a runtime client in the page and an opt-in
helper for the app's own axum routes.

**The server is the master: it is always right** (Kenny's standing sync rule,
2026-11-02). Three rules, which the coming local-database design follows too:

1. **Online answers always replace the local copy.** A fresh answer is stored
   whole, never merged: no local field survives it. After a queued write
   succeeds, the copy becomes the server's answer (a POST's or an empty-bodied
   answer is followed by a refetch of the path when a copy exists).
2. **Server deletions remove the local items.** A whole list answer (route
   without a query string) that no longer holds an item drops that item's copy
   and its entry in every stored list; a 404 / 410 on an item GET deletes its
   copy. Exception: an item with a queued write still pending keeps its copy
   until the replay, where the server's 404 / 410 sends the write to the failed
   list.
3. **A refused queued edit never overrides the server.** On a 409 or any other
   4xx at replay the local copy of that path becomes the server's version at
   once (`current` from the 409 body, else a refetch; a path the server no
   longer has loses its copy). No refused edit lingers in the copy. The edit
   stays in the failed list only as a record; the person decides. "Save again"
   is a fresh user action: it sends the edit as a NEW write on top of the newest
   revision the client holds (the copy's, else the one of the refusal), and does
   not touch the copy again until the server answers. There is no `overwrite`
   policy.

**Early answers** (fix-habits-data-4). `get(path, { from })`: `from` is a Response (or a
promise of one) the app started in the page head. The kit does not read the browser's
preload cache (its own requests are `no-store`, so the browser's cache never poses as a
live answer); the app passes the response it already awaited. Same URL and a 2xx only;
anything else is warned about and ignored. The answer then follows the normal read path.

**`chassisData` is there before the app's modules** (fix-habits-data-5). The runtime
tag is injected right after `<head>` (both variants), so it executes before the
app's own module scripts; `window.chassisDataReady` and the `chassis-data-ready`
event serve code that does not follow script order.

**Query-string copies are bounded** (fix-habits-data-6). Every query string keeps its
own copy, so per route only the newest `keep` of them stay (`routes: [{ path, keep }]`,
else `queryCopies`, default 8): LRU by last keep or offline read, order in memory and
seeded from `savedAt` after a reload. The bare path does not count; the size cap
still refuses copies on top of this.

`configure({ messages })` is an object, or a function returning one (fix-habits-data-7);
a function is called at show time (toasts, drawer, logout dialog), so the words follow
a language that is known only after `configure()`. An object is read at show time too, but it
is the object `configure()` was given; to change the words of a page that is already
configured, call `configure({ messages })` again (fix-kitchen-cycle-6): that is the only
second call accepted (anything else still throws), it replaces the words for the toasts, the
logout dialog and the drawer, and fires `chassis-data-messages` on `window`. An open drawer
draws again at once, heading and intro included, on that event and on kp's `kp-strings-change`.

**Naming a failed edit** (fix-habits-drawer-9). `configure({ describe(entry) })` returns
`{ title, detail? }` for a failed or held entry; the drawer card shows it instead of
`verb + path`, which stays the fallback (no `describe`, no title, or a throw, which is warned).

**The drawer's "Why"** (fix-habits-drawer-10). The reason is the app's wording:
`messages.refusedReason(status, body)` (empty string = pass), else `messages.stale`
(alias `reasonStale`) for 409 / 412, else `messages.reasonOther`. The server's `error` +
`remedy` is the secondary line beneath. With none of these given, the server's sentence
is the reason and the kit's English text appears only when the server said nothing.

**Two headings** (fix-habits-drawer-11). `messages.failedTitle` is the drawer's heading and
`messages.logoutTitle` the logout dialog's; `messages.title` is the fallback for both
(compatibility), then the kit's English defaults.

A write to an item path also reaches the **stored lists that hold the item**
(fix-habits-data-3): the entry (found through `itemKey`) is replaced (PUT),
merged (PATCH) or removed (DELETE) in every stored list of the item route's
parent, and the server's answer replaces it on success or refusal. List entries
are assumed to have the shape of the item. A write never adds an entry.

Optimistic copies (a queued write amending the stored copy, `post`'s
`opts.optimistic`) are therefore only a preview: rolled back to the server's
version on refusal, replaced by its answer on success.

```js
chassisData.configure({
  name: 'kitchen',                       // IndexedDB database chassis-data:kitchen
  rev: 'rev',                            // the revision field of an item's JSON
  routes: ['/api/dishes', '/api/dishes/:id'],   // a route with :id is an item, without is a list
});
const dish = await chassisData.get('/api/dishes/7');       // { data, rev, offline, savedAt }
await chassisData.put('/api/dishes/7', body);              // { ok, queued, data, rev }
await chassisData.keepItem('/api/dishes/7', true);         // or chassisData.keepAll(true)
```

```rust
// server: rev on answers, If-Match, 409
async fn put_dish(IfMatch(want): IfMatch, ...) -> Result<Revisioned<Dish>, Conflict> {
    want.check(store.rev(id))?;            // Err(Conflict) = 409 {error, remedy, code, rev}
    Ok(Revisioned::new(new_rev, dish))     // ETag: "<rev>" and the JSON body
}
```

## Pieces (one module each, `static/chassis/`)

| Module | Job |
|---|---|
| `data-config.js` | Pure: defaults, validation, the route table (`:id` = item). |
| `data-rev.js` | Pure: the revision of an answer (body field, else `ETag`), the `If-Match` value, rebasing queued writes after one succeeded. |
| `data-policy.js` | Pure: what a status means (unreachable / conflict / rejected / auth / retry) and **the one conflict policy function**. |
| `data-keep.js` | Pure: the per-device settings (all / per item), `shouldKeep`, the cap level. Loads and saves them in `localStorage`. |
| `data-trim.js`, `data-trimmer.js` | Pure: list-to-item mapping and `storable` (what of an answer is kept); and the trim of the stored copy after a switch-off. |
| `data-store.js` | IndexedDB behind a flat store interface (`reads`, `queue`). The only file that touches IndexedDB. |
| `data-cache.js` | Reads copy with byte accounting and the cap. |
| `data-reconcile.js` | Server deletions: items missing from a whole list answer or answered 404 / 410 lose their copy (not while a write is pending). |
| `data-queue.js` | The write queue and its replay (ordering, stop rules, rebase). |
| `data-client.js` | `createData`: get / put / patch / delete wired from the above; `fetch` is injected. |
| `data-band.js` | Connection band (`data-kp-pending`, syncing) and the stale/conflict toast. The only file that touches the DOM, with `data-logout.js` and `data.js`. |
| `data-logout.js` | Purges the copy and the queue when the logout form is submitted, after asking when edits would be lost. |
| `logout-guard.js`, `data-stored.js` | The guard on every page with a logout control: counts the queues of every `chassis-data:*` database of the origin (no `configure()` needed) and deletes them. Kit pages install it from `boot-kit.js`, app pages from `data.js`. |
| `data-failed.js`, `data-failed-view.js` | The failed-edits drawer (kp drawer, cards, buttons): opens from the toast's "Review", `chassisData.review()` or `[data-chassis-review]`; an app prevents it with `preventDefault()` on `chassis-data-review`. |
| `data.js` | `window.chassisData`; loaded by `webapp-runtime.js`. |
| `shell/http/revision.rs`, `core/revision.rs` | Server: `IfMatch`, `Precondition`, `Revisioned<T>`, `Conflict`. |

## Decisions

**Answers by URL, not by schema.** The copy is the last good GET answer per
path (a record `{path, data, rev, size, savedAt}`). No normalisation of lists
into items: the app already has a list route and an item route, and Kitchen's
adapter is just the route table. An "item" for the per-item toggle is a path
matching an `:id` route.

**Trimmed keeping** (feat-offline-keep-1). With "keep everything" on, every
answer is stored whole (`partial: false`). With it off, only kept items are
stored, and a list answer is stored **trimmed** to the entries whose item is
kept (`partial: true`), so the device does not hold every recipe because one is
kept. A list route belongs to the item route one `/:param` below it
(`/api/dishes` -> `/api/dishes/:id`); a list entry maps to its item path through
the `itemKey` option (default `'id'`; a field name or `(entry) => key`). The
answer may be an array or an object with an `items` array; any other shape, or a
list without an item route, is not stored while "keep everything" is off, and
nothing is stored at all while no item is kept. `keepItem(path, false)` removes
that item's copy and its entry from stored lists; `keepAll(false)` trims every
stored answer to the kept items (data-trimmer.js); `keepAll(true)` removes
nothing and the next GET of a list stores the full answer. `get()` reports
`partial` (offline reads of a trimmed list: `{offline: true, partial: true}`)
so an app can say "only saved items are shown". `keepAll` / `keepItem` now
return a promise (the trimming is awaited); `keepItem` still throws at once for
a non-item path. Trimming only touches the `reads` store: queued writes are
never dropped.

**Writes queue behind each other.** On a network failure (fetch throws, or
502/503/504) a write is queued with the `If-Match` it had (the revision of the
copy it was made from, or the `rev` option). While the queue is not empty every
new write joins it, even when the network is back, so edits reach the server in
the order they were made. After a replayed write succeeds, later queued writes
for the same path that carried the old revision are rebased to the new one: they
are the same person's follow-up edits, not stale saves. An optimistic local
update (put / patch / delete of the copy) makes offline reads show the edit.

**`post(path, body, opts?)`** (feat-offline-post-1, Kenny: "Kit krijgt post()", for
Kitchen's freezer "take 1"). Online it POSTs as usual. On a network failure or
while the queue is not empty it joins the queue like the other writes, in order.
Its entry carries `key`, a UUID made at enqueue time by `crypto.randomUUID()`
and kept for the entry's whole life, sent as `Idempotency-Key` on the first
try and on every replay (the entry is stored with the key, so a reload keeps
it too). No `If-Match` unless `opts.rev` is given. A refused replay (409/4xx)
takes the same road as PUT/PATCH/DELETE: failed list, review drawer ("Add"),
`onConflict` policy, `resave` (same key). The local copy of `path` is **not**
amended for a POST, because the kit cannot know what an action does to it;
`opts.optimistic(copy)` returns the new copy and is applied once at enqueue
(the function itself is never stored). The answer of a POST is never stored as
the copy of its path. Server: `IdempotencyKey` (next to `IfMatch`) is an
optional-header extractor, a UUID or 400 in the kit's shape. **Chosen: the
extractor only, no kit store.** Answering a repeated key with the first result
is exact only when the key is recorded in the same transaction as the write,
which only the app's database can do (pattern in the module docs of
`shell/http/idempotency.rs`); a kit-side bounded store would be a second place
that can disagree with the data. Additions only: a minor.

**409 on replay: skip and continue** (Kenny, form offline-conflict, "Overslaan",
2026-11-02). The refused edit moves to the **failed list**: it stays in the same
persisted queue store with `state: 'failed'` and the server's answer, it is
never sent again by itself, and the rest of the queue continues at once, in
order. `chassis-data-conflict` fires and the kit's toast says so with a
"Review" action. `chassisData.failed()` lists them, `drop(id)` discards one,
`resave(id)` is the person's fresh decision to send it again as a new edit on
top of the server's newest revision the client holds (or an `{rev}` they pass);
the server may refuse it again. `pending()` counts
only edits still to send; `unsent()` is pending plus failed. The choice is
`onConflict(entry, outcome) -> 'skip' | 'hold' | 'drop'` in
`data-policy.js` (`defaultConflictPolicy` is the one place; an `'overwrite'` answer is treated as `'skip'` with a console warning); `'hold'` stops the
queue behind the edit until `drop` or `resave` (drop then replays at once).
Other 4xx answers (400, 404, 422) go through the same function, because an edit
that can never succeed must not be retried forever, nor vanish silently.
401 and 5xx stop the queue and are retried later.

**Logout warns** (Kenny, form offline-logout, "Waarschuwen", 2026-11-02). With
unsent edits (queued or failed) the logout form first opens the kit's confirm
dialog (kp-themes `openConfirmation`): "N changes have not been sent yet and
will be lost." with "Log out anyway" and "Stay" (texts overridable through
`messages`). Only on confirm the copy is purged and the form sent; without
unsent edits logout stays immediate.

**Retry triggers.** `online` event, a timer while the queue is non-empty
(`retryMs`, default 30 s), the band's retry button (`kp-connection-retry`) and
`chassisData.retry()`.

**No tokens, no headers.** The session cookie authenticates (`credentials:
same-origin`). Requests take no custom headers (an `options.headers` throws),
only same-origin paths are accepted, and what is stored is path, method, body,
`If-Match`. Cookies and `Authorization` never enter the client's code path.

**Logout.** `data-logout.js` intercepts the submit of a form posting to
`/logout`, purges the copy and the queue, then submits. Unsent edits are lost at
logout by design (the next person at the device must not read or send them); an
app can check `chassisData.pending()` before offering logout. The worker also
deletes `chassis-data:*` databases on a `/logout` request, as it purges its
caches. The per-device settings (a flag and item paths) stay.

**Cap.** `maxBytes` default 50 MB, counted on the JSON we store (copy plus queue,
UTF-8 bytes of the serialised value). At 80 % (`warnRatio`) the event
`chassis-data-storage` fires with `level: 'warn'` and a kit toast; at the cap
new copies are refused (not evicted: silently dropping what the person asked to
keep is worse) with `level: 'full'`; queued writes are always accepted.

**Connection band.** Pending count is written to `data-kp-pending` and passed to
`setConnection`. kp-themes 12.2 has no `syncing` state; the nearest is
`reconnecting` (spinner) which is shown while the queue is replayed (gap added
to `kp-gaps/chassis-rs.md`).

**Loaded on every web-app page, inert until `configure`.** No server marker:
nothing opens IndexedDB before an app configures it.

**Server.** Revisions are `u64` (Kitchen's shape, absent = 0). `If-Match` accepts
`5`, `"5"`, `W/"5"` and `*`. A mismatch answers 409 `{error, remedy, code:
"stale", rev, current?}`; a malformed header 400 in the kit's shape. It is an
extractor plus a response type, not a layer: the check needs the stored
revision, which only the handler has. Added items are pure additions: a minor.
