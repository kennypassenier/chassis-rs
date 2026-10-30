# Notifications: one shared sender and a Status card (3.15.0 design)

Kenny, 2026-10-30: every app on chassis-rs gets a "Meldingen" card on its kit
Status page and one shared sender behind it, so no app builds its own. The
card is titled **Notifications** (the kit pages are English). The sender sends
to a primary target (the kyu message hub), keeps unsent messages on disk until
a target has accepted them, falls back once to a fallback target (by default
the household Home Assistant webhook) and records the last error.

## Pieces (one module each)

| Module | Job |
|---|---|
| `core/notify_target.rs` | Pure: the precedence of one address, address checks, the dedup contract's validation. |
| `storage/outbox.rs` | The queue: table `kit_outbox` in `<name>-kit.db`, cap, order, retry times. |
| `storage/notify_meta.rs` | Rows of `chassis_meta` beside it: saved addresses, last error, last delivery, dropped count. |
| `shell/notify_intake.rs` | The bounded hand-off between `Notifier::emit` and the writer task. |
| `shell/notify_channel.rs` | The shared state: resolved targets, saving and the lock refusal, the view for the card. |
| `shell/notify_delivery.rs` | The delivery loop, one HTTP attempt, the Test message. |
| `shell/notify_api.rs` | `GET /api/kit/notify`, `POST /api/kit/notify/settings`, `POST /api/kit/notify/test`. |
| `static/notify-card.js`, `.css`, `templates/status_notify.html` | The card. |

## Decisions

**Relation to `[[notify.webhook]]`.** The table is untouched and keeps working
exactly as before (own queue, templates, headers, per-entry fallback). The
channel is a second sink for the same events. To avoid double delivery, an
event that some webhook entry `wants` is left to that entry; every other
event goes to the channel. An app with webhooks and no `notify_url` behaves
as before, byte for byte, because the channel is off without an address.
`kit_sections()` is unchanged (`notify` is already listed). The additions are
a minor release (check-api: additive items only; no existing public struct
gained a field, which is why `NotifyKnobs` did not grow and the outbox cap is
read straight from the knob).

**Knobs** (feature `notify`; they only act together with `dashboard`, because
the outbox lives in the kit file that `dashboard` opens):

| Knob | Default | Meaning |
|---|---|---|
| `notify_url` | none | Primary target, a kyu topic `http://<hub>/t/<topic>`. |
| `notify_fallback_url` | none | Fallback target (a Home Assistant webhook address). |
| `notify_outbox_max` | 5000 | Cap on unsent messages. |

The existing `notify_timeout_secs`, `notify_retries`, `notify_backoff_base_ms`
and `notify_backoff_cap_ms` also govern the channel's sends.

**Code default.** `App::notify_targets(primary, Option<fallback>)`, additive.
The text is checked at start. A webhook id does not belong in code; give the
fallback through `<P>_NOTIFY_FALLBACK_URL` instead.

**Kit default.** Nothing: no target, the card says "Not set". The library
holds no homelab address and no webhook id. Examples in the UI and docs use
`hub.example`.

**Precedence, per address, exactly like the Storage budget:** flag,
environment or config file; then the value saved from the page (rows
`notify_url` and `notify_fallback_url` in `chassis_meta` of the kit file);
then the `App::notify_targets` value; then none. A value fixed by
configuration is shown locked with its reason (`it is set by the environment
variable <P>_NOTIFY_URL when the service starts`) and the API answers 400 and
changes nothing; sending the very same value is a no-op. A saved empty
address is a choice ("send nowhere") and also switches off a code default.
"Use defaults" deletes the saved rows of the addresses that are not locked.

**Secrets.** A webhook id may only arrive through `${VAR}` expansion or the
environment. An address that came from a flag, the environment or a `${VAR}`
is shown by scheme and host only (`http://host/...`); one literally written in
the config file or typed on the page is shown whole. Errors and logs never
contain an address: the last error is a sentence ("the connection failed"),
and log lines use `redacted_url`. Addresses saved from the page sit in the
kit file as plain text, like the budget setting; the kit file is the
service's own state, readable by the service user only.

**Outbox.** Table `kit_outbox` (id, created_at, kind, body, attempts,
next_try_at, dedup_key, dedup_window), schema step 2 of the kit file. It is in
`kit_migrations()` in every build, so all feature sets agree on the file's
version. A build older than 3.15.0 refuses a kit file at version 2; the
pre-update copy restores it (existing storage policy). A message is written
before anything is sent, so it survives a restart; a delivered message is
**deleted at once**. While no address is set nothing is queued (the event is
in the log).

**Cap and overflow.** At most `notify_outbox_max` (5000) waiting messages.
When a new message would exceed it, the OLDEST waiting messages are deleted in
the same transaction, counted in `notify_dropped_total`, and the last error
says so. Rationale: when a target has been away long, the newest news is
worth most. There is no age limit; the cap bounds the disk (a few MB).

**Register as a DataKind?** Not done, and this needs Kenny's call. A
`DataKind` describes rows in the APP file and gives the Storage page delete
controls; `STORAGE_DESIGN.md` decision 2 says the kit file has no kind, no
delete and no compact, and many apps have no app file. The outbox is already
counted in the kit file's size on the Storage page and the Notifications card
shows its count. If a read-only line on the Storage page is wanted, that is a
small follow-up in the Storage API.

**What "falls back once" means per message.** A delivery round offers the
message to the primary (initial attempt plus `notify_retries` retries with
backoff). Only if the primary did not take it, the fallback is asked, once,
with the same retry policy. A message the fallback accepts is finished and is
never sent to the primary afterwards. If neither accepts it, it stays on disk,
the attempt is counted and it is retried after 30 s, doubling to 15 min, and
the next round starts at the primary again. After two failed messages in a
row the loop stops asking for the retry delay (the targets are away), and a
primary that just failed gets a single attempt for the next message instead
of a full ladder, so a dead hub does not stall the fallback. An address
change makes every waiting message due at once.

**kyu damping.** An event may carry a dedup key and window:
`Notifier::emit_keyed(kind, version, detail, Dedup::new(key, window)?)`.
The key is 1 to 200 printable ASCII characters; the window is a number of ms
or a number with `ms`, `s`, `m`, `h` or `d`, above zero and at most `7d`
(kyu's default of 24h applies without one). They are sent as `Kyu-Dedup-Key`
and `Kyu-Dedup-Window` and stored with the outbox row, so a retry after a
restart sends the same key. A repeat inside the window answers `200` with
`Kyu-Duplicate: true`; the sender counts any 2xx as accepted, so the row is
deleted and the fallback is NOT asked. A first publish answers `201`.
Without a key nothing changes; success messages send none. `[[notify.webhook]]`
entries do not send the headers. (The `Event` struct gained no field, so the
key travels beside it.)

**The Test message.** `POST /api/kit/notify/test` sends one message with
`kind: "notify.test"` and a detail starting `TEST:` to EACH address that is
set, one attempt each, and answers per target (`delivered`, `failed`,
`not_set`) with a sentence. Testing both is deliberate: the fallback is the
one path normal operation never exercises. A test is never queued and does
not change the last error. With no address set it answers 400 and the button
is off with that reason.

**Card.** On the Status page, span 12, `data-chassis-owned` (the status poll
leaves its states alone), read quietly every 30 s. Grid of twelve: the two
addresses (columns 1 to 8) against the facts (9 to 12: waiting count with its
empty state, last delivery, last error with time), the test (button 1 to 4,
result 5 to 12) across all twelve; one column on a phone. States: loading
(from the first frame), ready, empty ("No messages waiting", "No error
recorded"), error with Try again, locked fields, saving and test result as
flash buttons plus a result list.
