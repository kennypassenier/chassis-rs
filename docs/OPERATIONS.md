# Operations — health, metrics, logs, limits, state, keys, notifications, shutdown

Day-two facts and numbered procedures for a service on chassis. Every
message in this document is quoted from the source or from a run of the
`inbox` binary on 2026-09-05. Procedures are written so that each step
before the marked one can be abandoned without loss.

## 1 · `/healthz`

Open (no login), JSON:

```text
{"status":"ok","version":"0.1.0","subsystems":{"store":{"detail":"writable","ok":true}}}
```

- `version` is the **running** binary's version (`--version` answers the
  binary on disk; during a supervised update they differ until the
  restart).
- `status` is `ok` and HTTP 200 unless a subsystem reports `ok: false`;
  then `degraded` and **503**. A check longer than
  `subsystem_check_timeout_ms` counts as failing with `check timed out`;
  a panicking one as `check panicked`.
- The kit registers one subsystem itself, **`store`**: `writable` until a
  write to the state root fails, then `last write failed: <error>` until a
  write succeeds again. A state directory that turned read-only after
  start therefore shows here.
- Degraded is not dead: `--healthcheck`, the container `HEALTHCHECK` and
  the autonomous updater treat any well-formed report, 200 or 503, as
  alive.

Proven by: `app::tests::degraded_subsystem_gives_503_but_probe_still_says_alive`,
`shell::health::tests::slow_check_is_bounded_and_counts_as_failing`,
`shell::store::tests::state_dir_probe_fails_closed_and_the_store_subsystem_follows_writes`.

## 2 · `/metrics`

Open, Prometheus text (`text/plain; version=0.0.4; charset=utf-8`):

```text
# TYPE inbox_http_requests_total counter
inbox_http_requests_total{route="/healthz",status="200"} 1

# TYPE inbox_build_info gauge
inbox_build_info{version="0.1.0"} 1

# TYPE inbox_uptime_seconds gauge
inbox_uptime_seconds 0.110437963
```

`route` is the matched route pattern (`/api/clients/{id}/token`, or
`unmatched`), never the raw path, so ids cannot multiply series. A
project's `App::metrics_source` text is appended verbatim after the kit's
registry. Blind spots: `http_requests_total` counts requests the kit's
layers saw, so a connection refused at the socket never reaches it;
`uptime_seconds` restarts at zero on every restart, so a low value after
an update is expected. Because the endpoint is open and names routes,
restrict `/metrics` to Prometheus at Traefik (S9, accepted). Proven by:
`shell::metrics::tests::render_carries_build_info_uptime_and_verbatim_sources`.

## 3 · `--healthcheck [URL]`

`<name> --healthcheck` probes `http://127.0.0.1:<listen port>/healthz`
(or the URL given), prints `<name>: alive=true status=ok version=0.1.0`
and exits 0; a closed port exits 1:

```text
healthcheck GET http://127.0.0.1:1/healthz failed: error sending request for url (http://127.0.0.1:1/healthz). What now: is the service running and listening on that address? compare with --print-config
```

The scaffold's `Dockerfile` uses it as `HEALTHCHECK --interval=30s
--timeout=5s --retries=3`. Proven by: `start_serves_kit_routes_and_stops_cleanly`
(alive on 200), `degraded_subsystem_gives_503_but_probe_still_says_alive`.

## 4 · Logs

Everything goes to **stderr** — under systemd that is journald; the
service writes no log files, so rotation is `deploy/journald.conf`
(`SystemMaxUse=200M`, `SystemMaxFileSize=32M`, `MaxRetentionSec=1month`)
on an LXC and `logging: options: max-size` in compose. The filter is
`<P>_LOG` (default `info`); `<P>_LOG_FORMAT=json` gives one JSON object
per line with `level` and `fields`. Colour codes appear only when stderr
is a terminal. One access line per request:

```text
2026-09-05T14:12:20.092463Z  INFO request method=POST path=/v1/messages route=/v1/messages status=202 duration_ms=0 request_id=c996b4fb-e784-4112-902e-5fc4b0abfa3a
```

`request_id` is the `x-request-id` the caller sent (accepted only if it
matches `[A-Za-z0-9._-]{1,64}`, otherwise replaced) or a fresh UUIDv4;
the same id is echoed in the response header, so `curl -i` and
`journalctl` can be matched.

**Never logged:** the login token (a refused login logs only `login
refused from=<ip>`), client tokens, the secret key, values pulled in via
`${VAR}`, request bodies (the access line has none), webhook paths and
userinfo (URLs are logged as `http://host/…`), and the message of an
internal error's *response* (the log gets it; the caller gets `internal
error` plus the remedy). Proven by:
`the_log_never_carries_a_secret_and_counts_one_access_line_per_request`,
`json_log_mode_emits_one_object_per_line`,
`shell::notify::tests::logged_webhook_urls_keep_only_scheme_and_host`,
`shell::http::tests::internal_error_hides_its_message`.

## 5 · Limits and the statuses they produce

| Status | When | Body / headers |
|---|---|---|
| 401 | API route without a valid token | `{"error":"missing or invalid credentials","remedy":"send Authorization: Bearer <client token>, or log in on /login"}` |
| 303 → `/login` | Admin page without a session | (browsers never get a 401 popup) |
| 403 | POST/PUT/… from a browser with `Sec-Fetch-Site: cross-site` or `same-site` | `{"error":"cross-site request (Sec-Fetch-Site: cross-site) refused","remedy":"call this endpoint from the dashboard itself, or from a script without browser fetch metadata"}` |
| 403 | POST/PUT/… without `Sec-Fetch-Site` and with an `Origin` that is not this `Host` | `{"error":"cross-origin request from http://evil.example refused","remedy":"call this endpoint from the dashboard itself, or from a script without an Origin header"}` |
| any 4xx/5xx to a browser navigation | `Sec-Fetch-Mode: navigate` or `Accept: text/html` on the request, and a dashboard is mounted | the same error and remedy rendered as a page in the dashboard layout (`text/html`), status unchanged — never a bare JSON tab (CF-7) |
| 408 | Request longer than `request_timeout_secs` (30) on a non-exempt path | `request to <path> exceeded 30 s` |
| 413 | Body above `max_body_bytes` (1 MiB), declared or streamed | `{"error":"the request body is larger than this service accepts","remedy":"send a body within max_body_bytes (the knob <PREFIX>_MAX_BODY_BYTES sets it)"}` |
| 429 | `/login`: more than `rate_limit_login_per_min` (10) per client IP, burst 5 | `too many attempts from this address`, `Retry-After: 5` |
| 429 | API: more than `rate_limit_token_per_sec` (50) per client token, burst 100; the login token is exempt | `this client token is over its rate limit`, `Retry-After: 5` |
| 503 | More than `max_in_flight` (64) concurrent requests | `the service is at its in-flight limit`, `Retry-After: 5` |
| 503 | `/healthz` with a failing subsystem | the report itself |

Proven by: `login_and_token_rate_limits_answer_429_with_retry_after`,
`oversized_body_on_an_api_route_is_413_not_empty`,
`shell::guards::tests::in_flight_cap_answers_503_with_retry_after`,
`shell::guards::tests::timeout_applies_except_to_exempt_prefixes`,
`shell::guards::tests::csrf_refuses_cross_origin_posts_and_passes_scripts`.

## 6 · Trusted proxies

`trusted_proxies` (comma-separated IPs, default empty) decides whose
`X-Forwarded-For` and `X-Forwarded-Proto` are believed. It feeds three
things: the client IP the login limiter keys on, whether a request counts
as HTTPS (→ `Secure` cookies), and whether passkey routes exist.

**Empty behind Traefik:** every visitor shares Traefik's IP, so one
attacker's failed logins lock everyone out; cookies are never `Secure`;
passkeys answer 404. The kit says so three times: `--check` warns
(`warning: trusted_proxies is empty while listening on …`), the first
forwarded request logs `X-Forwarded-* headers arrive from a peer that is
not in trusted_proxies; they are ignored (client IP = proxy IP, no https,
no passkeys)` once, and the status page's Problems card gets one entry:
**proxy headers from untrusted peer <ip>** — `X-Forwarded-For/Proto are
ignored unless the peer is listed in trusted_proxies, so every client
shares one rate-limit key, cookies are not Secure and passkeys are off`,
remedy `set <PREFIX>_TRUSTED_PROXIES to the proxy's IP (e.g. Traefik's)
and restart`.

Procedure: add `<P>_TRUSTED_PROXIES=<traefik ip>` to the env file → run
the `--check` line from GETTING_STARTED §9 step 5 → `systemctl restart`.
A spoofed `X-Forwarded-Proto: https` from any other peer is ignored.
Proven by: `shell::guards::tests::untrusted_proxy_headers_are_noted_once`,
`trusted_proxies_parse_and_client_ip_follows_xff_only_from_them`,
`passkeys_exist_only_over_https_from_a_trusted_proxy`.

## 7 · The state directory

One root, `<P>_STATE_DIR` (default `/var/lib/<name>`). What lives there:

| File | Content | When |
|---|---|---|
| `clients.json.enc` | clients and their tokens, sealed (XChaCha20-Poly1305, `{"v": 1, "nonce", "ciphertext"}`) | after the first client |
| `sessions.json.enc` | SHA-256 of session ids, sealed | after the first login |
| `passkeys.json.enc` | WebAuthn credentials, sealed | after the first passkey |
| `update-state.json` | plaintext `{from_version, to_version, previous_binary, attempts}` | only while an autonomous update is on probation |
| `update-skip.json` | plaintext list of versions this process installed and rolled back; never reinstalled (CF-3). Delete it to retry one on purpose | after the first autonomous rollback |
| `config.toml` | yours, optional | — |
| `.chassis-probe`, `.<file>.tmp-<pid>` | transient: the write probe and atomic-write temp files | never at rest |

Every file the kit writes is created **0600** (observed:
`-rw------- clients.json.enc`), written temp + fsync + rename, then the
directory is fsynced. The binary, `<bin>.prev`, `<bin>.staging` and
`<bin>.drill` live **beside the binary**, not here; pre-update copies go
to `<state>-pre-update/<version>/`; captures and rate-limiter state are
in memory and gone after a restart.

Rules: `--check` refuses a missing or unwritable root and creates
nothing; start creates a missing root and refuses an unwritable one with
`the state directory … is not writable: … What now: make the service
user its owner (chown -R <user> <dir>); under systemd also list it in
ReadWritePaths; for a docker bind mount chown the host directory`.

**Backup = the whole state root.** The homelab's `data_dirs` in
`service.yml` lists exactly it. Restore drill (done on CT 118, 2026-09-05,
REALIZATION_PLAN L8), abort-safe until step 5:

1. `systemctl stop <name>`.
2. `tar -C /var/lib -czf /root/<name>-state.tgz <name>` — keep it until
   step 7 passes.
3. Prove the tar lists `clients.json.enc` and `sessions.json.enc`.
4. (The drill destroys the root here: `rm -rf /var/lib/<name>/*`.)
5. `tar -C /var/lib -xzf /root/<name>-state.tgz && chown -R <name>: /var/lib/<name>`.
6. `systemctl start <name>`; `systemctl is-active <name>` → `active`.
7. An existing client token still gets 202 on the API and an existing
   browser session still opens `/clients`; `uses` continues where it was.

The tar is useless without the secret key — see §8. Proven by:
`sessions_and_usage_survive_a_restart`, `unwritable_state_dir_is_refused_at_check_and_start`,
`shell::store::tests::encrypted_file_round_trips_and_is_unreadable_as_plaintext`.

## 8 · The secret key — where every copy is, and how to put one back

`<P>_SECRET_KEY` seals the three `.json.enc` files. The kit reads it
**only from the environment** (never from the file, never from a flag)
and **writes no copy of it anywhere**: not in the state root, not in the
backup. Asked deliberately (ECOSYSTEM norm N4): if the key were gone
tomorrow, these are its copies:

| Copy | Where | Survives |
|---|---|---|
| The environment file | `/etc/<name>/<name>.env` on the LXC (0640 root:<name>) — the only copy the kit knows | a service restart, a binary swap, a state-root restore; **not** the LXC's loss, and it is **outside `data_dirs`**, so the nightly tar does not contain it |
| latch's store | only if the unit is the `--latch` variant (`ExecStart=latch run --env prod -- …`); the kit reads env only and does not know latch exists | whatever latch's own backup regime covers |
| A copy Kenny made | password manager or wherever `gen-secret`'s two lines were pasted | Kenny's choice; the kit cannot know |

Without any copy, the sealed files are unrecoverable: `rekey` needs the
old key. The nightly tar alone therefore does not restore a service.

**Procedure A — the env file is gone, a copy exists.** Recreate
`/etc/<name>/<name>.env` (0640 root:<name>) with the two lines (plus
`PUBLIC_URL`), run the `--check` line from GETTING_STARTED §9 step 5,
`systemctl start`. Nothing else changes.

**Procedure B — rotate the key** (abort-safe until step 5; keep the old
key until step 7):

1. `<name> gen-secret` on a terminal; keep only the `SECRET_KEY` line.
2. `systemctl stop <name>`.
3. Back up the state root (§7 steps 2–3).
4. Add one line to `/etc/<name>/<name>.env`: `<P>_OLD_SECRET_KEY=<old key>`,
   and change `<P>_SECRET_KEY=` to the new key (both keys are now in the
   file, none on any command line — S8). Then, as the service user:
   ```bash
   systemd-run --wait --pipe --collect --uid=<name> --gid=<name> \
     --property=EnvironmentFile=/etc/<name>/<name>.env \
     --property=WorkingDirectory=/var/lib/<name> /opt/<name>/bin/<name> rekey
   ```
   Expect `<name>: 3 store file(s) in /var/lib/<name> now sealed under
   <P>_SECRET_KEY; unset <P>_OLD_SECRET_KEY and start the service`
   (2 files when no passkey was ever registered). A rerun re-seals 0
   files and is harmless. A wrong old key is refused: `<file> opens with
   neither the old nor the new key: … What now: the OLD_SECRET_KEY is not
   the key this file was sealed with; find the key that wrote it (the
   environment file before the rotation)`.
5. Remove the `<P>_OLD_SECRET_KEY=` line from the env file, then `--check`, then start.
6. Log in and call the API with an existing client token: both must work.
7. Now discard the old key.

**Procedure C — the key is gone and no copy exists.** What is lost:
every client token (re-issue each caller), every browser session, every
passkey. `update-state.json`, `update-skip.json` and the binary are unaffected.

1. `systemctl stop <name>`. Starting with a new key against the old
   files fails on purpose: `clients store cannot be decrypted with the
   current secret key. What now: either the SECRET_KEY changed (rotate
   with `<binary> rekey`: …) or the file was tampered with; restore it
   from backup`.
2. `<name> gen-secret`; write both new lines into the env file.
3. `mkdir /var/lib/<name>/unrecoverable && mv /var/lib/<name>/*.json.enc
   /var/lib/<name>/unrecoverable/` (keep them; a key that turns up later
   opens them).
4. `--check`, `systemctl start`: the stores start empty.
5. Log in with the new token, re-issue a client per caller, re-register
   passkeys.

Proven by: `shell::store::tests::rekey_reseals_every_store_once_and_refuses_a_wrong_old_key`,
`shell::store::tests::wrong_key_is_a_config_error_naming_rekey`,
`core::config::tests::secret_in_file_is_refused_with_remedy`; the
absence of any key copy by `grep -rn secret_key crates/chassis/src`
(read in `shell/auth.rs` and `app.rs`'s `rekey` only).

## 9 · Notifications (`notify` feature)

Webhooks live **only in the config file**, as repeated tables:

```toml
[[notify.webhook]]
events = ["update.*", "health.degraded"]
url = "http://10.10.10.9:8080/t/ops.alerts"        # a kyu topic is just a webhook
method = "POST"                                     # default; POST, PUT or PATCH
headers = { "Authorization" = "Bearer ${INBOX_KYU_TOKEN}" }
body = '{"service": "{{ service }}", "event": "{{ kind }}", "detail": {{ detail | tojson }}}'
fallback = "http://10.10.10.5:8123/api/webhook/${INBOX_HA_HOOK}"
```

- `events`: exact names or `prefix.*` (`update.*` matches `update.ok`,
  not `updates.ok`). Empty is refused (`notify.webhook[0] lists no
  events`).
- `${VAR}` in `url`, `headers` and `fallback` resolves from the
  environment, fail-closed: `notify.webhook[0] references ${X}, which is
  not set. What now: export X=<value> in the environment file; secrets
  never go in the config file`.
- `body` is a minijinja template over `service`, `kind`, `at`, `version`,
  `detail`; without it the event is sent as JSON with those five fields.
  `Content-Type: application/json` is added unless a header sets one.
- Kit events: `service.started` (after bind), `update.installed`,
  `update.ok`, `update.failed`, `update.rolled_back`, `update.held`,
  `health.degraded` and `health.recovered` (sampled every
  `health_sample_secs`, emitted once per transition). Projects emit their
  own through `App::notifier()` (inbox: `message.received`).
- Delivery: a queue of `notify_queue_size` drained by one task; per
  target `notify_retries` retries with jittered exponential backoff
  (`notify_backoff_base_ms` … `notify_backoff_cap_ms`), then the
  `fallback`. Best effort, never blocks a request; a full queue drops the
  event with `notification queue full; event dropped (it is in the log
  above)`.
- Logged: every event as `INFO event event="…" version="…" detail=…`
  (also with no webhooks configured); failures as `webhook failed after
  retries url=http://host/… error=…`, `notification not delivered after
  retries and fallback`, `delivered via the fallback webhook`. Header
  values and URL paths are never logged. There is no `preset` key; a kyu
  topic or a Home Assistant webhook is written as its URL.

Proven by: `notify_webhook_receives_kit_and_project_events_and_the_header_stays_out_of_the_log`,
`core::notify::tests::parses_resolves_and_matches`,
`shell::notify::tests::fallback_receives_when_the_primary_stays_down`,
`shell::notify::tests::logging_only_never_blocks`.

## 10 · Shutdown

SIGTERM or Ctrl-C: `INFO SIGTERM received; finishing in-flight requests`
→ stop accepting → in-flight requests finish (bounded by
`shutdown_timeout_ms`, default 10 s) → flush hooks run, the kit's first
(persist client usage), then the project's `on_flush`, each bounded →
`INFO stopped drained=true` → **exit 0, always**. A second signal changes
nothing. Exceeding the bound logs `shutdown exceeded its bound; exiting 0
anyway (norm N1)` with `still_open=` naming the phase, and still exits 0.

The unit's `TimeoutStopSec=60` must stay above `shutdown_timeout_ms`, or
systemd SIGKILLs a drain that is still running; the unit mirrors it as
`Environment=<P>_TIMEOUT_STOP_SECS=60` so `--check` can warn
(CONFIGURATION.md). Two other exits are deliberate: the autonomous
restart after an install (exit 0) and `update reverted; exiting so the
supervisor starts the restored binary` (exit 0); only the drill and
configuration errors exit 1. Proven by:
`sigterm_exits_zero_and_second_signal_is_harmless`,
`in_flight_request_completes_during_drain`,
`shell::lifecycle::tests::bounded_reports_timeout_without_panicking`.

## 11 · Symptom → cause

| Symptom | Cause | Where to look |
|---|---|---|
| Unit never reaches `active`, `--check` in the journal says `does not exist` or `not writable` | state root missing or not owned by the service user / not in `ReadWritePaths` | §7; `chown`, unit |
| `… TOKEN and … SECRET_KEY are not set` | env file missing or not readable by the unit | §8 A; `EnvironmentFile=` path, mode 0640 root:<name> |
| `cannot be decrypted with the current secret key` | key changed without `rekey`, or a store from another instance | §8 B/C |
| Browser lands on `/login` after every click | cookie not stored: `Secure` set but page opened on http, or session expired (`session_ttl_secs`) | §6, CONFIGURATION.md |
| Everyone locked out of `/login` with 429 | behind a proxy with `trusted_proxies` empty: one IP for all | §6 |
| Passkeys page says "Not over HTTPS", routes 404 | not reached through a trusted TLS proxy, or `PUBLIC_URL` wrong | §6, DASHBOARD.md |
| `/healthz` 503, `store … last write failed` | disk full or root turned read-only | §1, §7 |
| Update refused with `is not https://` | LAN drill host on http without `update_allow_insecure` | SELF_UPDATE.md |
| Update refused with `signature is for …` | `VERSION` and manifest from different releases, or a pre-chassis release without the `<repo> v<version>` comment | SELF_UPDATE.md step 6 |
| `installed …` but the old version still serves | supervised never restarts; the supervisor must | SELF_UPDATE.md |
| Update card says `newer available: …, but it was rolled back earlier and is skipped`; `update.held` every interval | that version crashed after an autonomous install and is on the skip list | SELF_UPDATE.md; `update-skip.json` |
| Last requests panel empty after a restart | captures are in memory by design (AR7) | DASHBOARD.md |
| `notification not delivered after retries and fallback` | receiver down or wrong URL; the event is still in the log | §9 |
