# Offline app data (feat-offline-1, requested by Kitchen, Kenny 2026-11-02)

Kitchen wants the whole kitchen usable without a connection: "Hele keuken
offline", with one switch "keep everything offline" and, when that is off, a
toggle per item. The kit had no app data layer; the service worker caches
files only, and never JSON (`fix-swcache-1` stands). This adds explicit app
data with revisions, in two halves: a runtime client in the page and an opt-in
helper for the app's own axum routes.

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

**409 on replay: skip and continue** (Kenny, form offline-conflict, "Overslaan",
2026-11-02). The refused edit moves to the **failed list**: it stays in the same
persisted queue store with `state: 'failed'` and the server's answer, it is
never sent again by itself, and the rest of the queue continues at once, in
order. `chassis-data-conflict` fires and the kit's toast says so with a
"Review" action. `chassisData.failed()` lists them, `drop(id)` discards one,
`resave(id)` re-sends it with the server's current revision (the person looked
and decided their version wins) or an `{rev}` they pass. `pending()` counts
only edits still to send; `unsent()` is pending plus failed. The choice is
`onConflict(entry, outcome) -> 'skip' | 'hold' | 'drop' | 'overwrite'` in
`data-policy.js` (`defaultConflictPolicy` is the one place); `'hold'` stops the
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
