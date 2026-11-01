# Web Push: notifications for the installed web app (habits-push-1 design)

Habits (2026-11-01) needs reminders that reach a phone when the app is closed:
"Water drinken" with buttons "Gedaan" and "Over 1 uur". The kit gives every
installable web app Web Push: the page subscribes, the kit keeps the
subscriptions and signs and encrypts, and the app sends with its own command.
It is separate from the notify channel (`NOTIFY_DESIGN.md`), which stays
untouched: that one sends service events to a hub, this one talks to browsers.

```rust
let report = app.push().send(
    Push::new("Water drinken")
        .body("Het is tijd voor een glas")
        .url("/habits/water")
        .tag("water")
        .action("done", "Gedaan", "/api/habits/water/done")
        .action("snooze", "Over 1 uur", "/api/habits/water/snooze"),
).await?;
// report.accepted, report.removed, report.failed, report.last_error
```

## Pieces (one module each)

| Module | Job |
|---|---|
| `push/ece.rs` | Pure: RFC 8291 `aes128gcm` encryption (ECDH P-256, HKDF, AES-128-GCM, one 4096-byte record). Tested against the RFC's Appendix A byte for byte. |
| `push/vapid.rs`, `push/keys.rs` | RFC 8292: the ES256 token (`aud` = endpoint origin, 12 h) and the key pair (PKCS#8 on `ring`). |
| `push/message.rs` | `Push` and `Urgency`: the notification, its checks, the JSON the worker reads. |
| `push/subscription.rs` | What the browser sends, and the checks (https only, key shapes). |
| `storage/push_store.rs` | Table `kit_push_subscriptions` in `<name>-kit.db`, the cap, the VAPID row of `chassis_meta`. |
| `push/delivery.rs`, `push/sender.rs` | One request; fan-out with a concurrency bound; the report. |
| `push/api.rs`, `push/mount.rs`, `push/handle.rs` | The three routes, the wiring at dashboard mount, and `PushHandle`. |
| `static/chassis/push.js` | `window.chassisPush`. |
| `shell/webapp/pwa/sw-push-logic.js`, `sw-push.js` | The worker's `push` and `notificationclick` handlers and their pure decisions. |

## Decisions

**Crypto on `ring`, no new HTTP client** (Kenny, 2026-11-01). `ring` is already
in the tree through rustls; it becomes an optional direct dependency behind
the feature `push` (which implies `webapp`). Delivery uses the `reqwest` the
kit already links. No `web-push`, `ece` or `openssl`. ring cannot take a fixed
private key for key agreement, so `ece::encrypt_with` takes the shared secret
and the salt as arguments; the RFC test injects the RFC's values, and the
delivery tests prove the real key agreement by decrypting with a key pair
ring generated.

**One VAPID key per app, sealed.** Made on the first start, stored in the kit
file as PKCS#8, sealed with `<P>_SECRET_KEY` like a client token, so a copy of
the file alone cannot send as the service. Only the public key is served. A
dashboard that runs open (no login, no secret key) gets no push: nothing to
seal with, and a key that changed at every start would orphan every
subscription. `app.push().send` then answers an error saying so.

**The app sends, not the channel.** `App::push()` returns a `PushHandle`, a
cheap clone usable before `start` (like `App::notifier`); it connects when the
dashboard mounts. `send` before that is an error, not a silent drop.

**Subscriptions.** Endpoint unique; https only (a plain-http endpoint is
refused, as are credentials in the URL); keys must be a P-256 point and a
16-byte secret. Subscribing again renews in place and clears the error. A
new endpoint past `push_max_subscriptions` is refused instead of evicting a
working browser. A 404/410 from the push service deletes the subscription;
any other failure keeps it with a sentence in `last_error` (never the
endpoint, which is a capability) and counts in the report.

**CSRF from the worker.** The kit's rule accepts `Sec-Fetch-Site:
same-origin`, or an `Origin` equal to `Host`. A worker's `fetch()` to its own
origin carries exactly that, so an action button simply `POST`s with
`credentials: 'same-origin'`; no token or custom header exists to leak. If the
post fails (login expired, offline) the app opens at the notification's URL.
Action URLs and the notification URL must be paths of the app (a single
leading `/`); the worker drops anything else, so a forged message cannot send
a click to another site.

**Page API.** `chassisPush.state()` is asynchronous (the browser keeps the
subscription behind a promise): `'unsupported' | 'denied' | 'off' | 'on'`.
`subscribe()` asks permission as its first step and must run in a click.
`unsubscribe()` tells the server, then the browser. No UI of its own. It
exists only on pages carrying `<meta name="chassis-push">`, which the server
writes into installable pages of a build with the feature.

## Knobs (feature `push`)

| Knob | Default | Meaning |
|---|---|---|
| `push_subject` | none | VAPID `sub`: `mailto:` address or `https:` URL. Required before the first send. |
| `push_ttl_secs` | 86400 | How long a push service keeps a message for an offline device; one `Push` may override with `.ttl(..)`. |
| `push_timeout_secs` | 10 | Seconds per request to a push service. |
| `push_max_subscriptions` | 50 | Cap on subscribed browsers. |
| `push_concurrency` | 8 | Requests in flight while one message fans out. |

## Routes (behind the admin login and the same-origin rule)

`GET /api/kit/push/key`, `POST /api/kit/push/subscribe` (the browser's
`PushSubscription.toJSON()`), `POST /api/kit/push/unsubscribe` (`{endpoint}`).
