# Configuration — every knob, the precedence rule, the control commands

The kit resolves its configuration from four layers, strongest first:
**command-line flag > environment variable > config file > built-in
default**. Every knob answers to three names derived from one key
(`shutdown_timeout_ms` → `--shutdown-timeout-ms`, `<P>_SHUTDOWN_TIMEOUT_MS`,
file key `shutdown_timeout_ms`), where `<P>` is the service name
upper-cased with dashes as underscores (`inbox` → `INBOX`).

Proven by: `core::config::tests::precedence_table_all_layers_at_once`,
`core::config::tests::names_derive_from_the_key`
(`crates/chassis/src/core/config.rs`); the list below is
`AppSpec::knobs()` in `crates/chassis/src/app.rs`.

## Seeing what is in force: `--print-config`

`--print-config` prints one line per knob with the effective value and
the layer it came from, then exits 0 without opening a socket. Real
output (state dir shortened):

```text
listen                       = 127.0.0.1:8080  (flag)
state_dir                    = …/state  (flag)
log                          = debug  (env)
log_format                   = text  (default)
shutdown_timeout_ms          = 10000  (default)
…
token                        = ***  (env)
secret_key                   = ***  (env)
…
update_mode                  = off  (default)
```

Secrets show as `***`. A value that contained `${VAR}` shows as
`*** (expanded from ${…})` whatever knob it is, because the variable
may hold a secret the file never did. Knobs without a default that
nobody set (for example `update_url`, `update_pubkey`) are absent from
the list. Proven by: `print_config_and_check_touch_nothing`,
`core::config::tests::render_masks_secrets_and_names_sources`,
`core::config::tests::render_masks_values_expanded_from_the_environment`.

## The config file

TOML, at `<state_dir>/config.toml` unless `--config <path>` or
`<P>_CONFIG` says otherwise. It is optional; a missing file is fine, an
unreadable or malformed one is a configuration error with a remedy. The
kit reads only its own flat keys, each a scalar (string, integer, float
or boolean); an array or table under a kit key is refused with
`config key `<key>` in <file> is a <type> and must be a scalar`. Nested tables
(`[inbox]`, `[[notify.webhook]]`) are left to the project through
`App::loaded.file_table`.

Two knobs decide *where* the file is and are therefore taken from flag,
env or default before the file is read: `state_dir` and `config`. A
`state_dir` key inside the file has no effect on the location, even
though `--help` lists the file key for them like for every other knob.

Proven by: `shell::config_load::tests::missing_file_is_fine_and_malformed_file_is_not`,
`shell::config_load::tests::file_under_state_dir_is_read_and_flag_state_dir_wins`.

## `${VAR}` expansion

Any string value, from any layer, may contain `${NAME}`; it is replaced
by the environment variable of that name at load time. An unset variable
is an error, never an empty string:

```text
knob `listen` (from file) references ${HOST}, which is not set. What now: export HOST=<value> before starting, or write the value directly
```

An unterminated `${` is kept literally (it is not a reference). There is
no escape for a literal `${`. Proven by:
`core::config::tests::expansion_uses_env_and_fails_closed`,
`core::config::tests::expansion_applies_to_file_values_and_is_reported_with_source`.

## Secrets

Two knobs are secret: `token` and `secret_key`. They have **no flag**
(`--help` never lists `--token` or `--secret-key`; `/proc/*/cmdline` is
world-readable), they are **masked** by `--print-config`, and they are
**refused from the config file** when nothing higher sets them:

```text
secret knob `token` was set in the config file. What now: remove it from the file and set INBOX_TOKEN in the environment (or an EnvironmentFile) instead; secrets never live in the config file
```

When the environment does set the knob, a file entry for it is simply
not reached (the env layer wins first) and stays ignored. Proven by:
`core::config::tests::secret_in_file_is_refused_with_remedy`,
`help_lists_knobs_but_never_the_secret_flags`.

## The knobs

Env var is `<P>_` + the key upper-cased; the flag is `--` + the key with
`_` → `-`; the file key is the key itself. "min" is the smallest value
the parser accepts; below it is a configuration error naming the knob.

### Core: listening, state, logging, shutdown

| Key | Default | What it does |
|---|---|---|
| `listen` | `0.0.0.0:8080` | `host:port` to bind. `0` picks a free port; the bound address is logged (`listening … addr=`). |
| `state_dir` | `/var/lib/<name>` | The one state root. `--check` refuses a missing one; start creates it. Env/flag only. |
| `config` | `<state_dir>/config.toml` | Path of the TOML file. Env/flag only. |
| `log` | `info` | `tracing` filter, e.g. `info,chassis=debug`. |
| `log_format` | `text` | `text` or `json`; anything else is refused. |
| `shutdown_timeout_ms` | `10000` | Bound on the drain and each flush hook at stop. `0` and non-numbers are refused. |
| `timeout_stop_secs` | — | Mirror of the unit's `TimeoutStopSec` (the scaffold sets `Environment=<P>_TIMEOUT_STOP_SECS=60`) so `--check` can warn when it is shorter than `shutdown_timeout_ms`. Not validated. |

### Guards, health, metrics (K10, K6, K7)

| Key | Default | min | What it does |
|---|---|---|---|
| `max_body_bytes` | `1048576` | 1 | Request bodies above this → 413. |
| `max_in_flight` | `64` | 1 | Concurrent requests above this → 503 + `Retry-After`. |
| `retry_after_secs` | `5` | 1 | The `Retry-After` value on 429 and 503. |
| `request_timeout_secs` | `30` | 1 | Requests longer than this → 408, except paths registered with `App::exempt_from_timeout`. |
| `rate_limit_login_per_min` | `10` | 1 | `/login` attempts per client IP per minute. |
| `rate_limit_login_burst` | `5` | 1 | Burst allowed on `/login` before the per-minute rate applies. |
| `rate_limit_token_per_sec` | `50` | 1 | API requests per client token per second (the login token is not limited). |
| `rate_limit_token_burst` | `100` | 1 | Burst per client token. |
| `subsystem_check_timeout_ms` | `2000` | 1 | A `/healthz` subsystem check longer than this counts as failing (`check timed out`). |
| `healthcheck_timeout_secs` | `5` | 1 | Timeout of the `--healthcheck` probe. |
| `trusted_proxies` | `` | — | Comma-separated IPs whose `X-Forwarded-For` / `X-Forwarded-Proto` are believed. Non-IP entries are refused. |

### Login, clients, captures (K8, K12, K13)

| Key | Default | min | What it does |
|---|---|---|---|
| `token` | — | 16 chars | **Secret.** The dashboard login token; also works as a bearer for scripts. |
| `secret_key` | — | 64 hex | **Secret.** 32 bytes hex; seals `clients.json.enc`, `sessions.json.enc`, `passkeys.json.enc`. |
| `session_ttl_secs` | `86400` | 60 | A plain session slides this far from its last use. |
| `remember_me_days` | `30` | 1 | Fixed lifetime of a "keep me logged in" session (also the cookie's `Max-Age`). |
| `capture_keep` | `20` | 1 | Last requests kept per client, in memory. |
| `capture_body_bytes` | `4096` | 1 | Captured bodies are cut here with a `truncated` mark. |
| `capture_ttl_secs` | `3600` | 1 | Captures older than this disappear. |
| `capture_redact` | `` | — | Extra header names shown as `***`; `authorization`, `cookie`, `set-cookie`, `x-api-key` always are. |
| `clients_persist_secs` | `30` | 1 | How often `last_used_at`/`uses` are written to disk (also at shutdown). |
| `reveal_seconds` | `10` | — | How long the Reveal button shows a token in the browser. Not validated; unparsable values fall back to 10. |
| `passkey_ceremony_cap` | `64` | 1 | Pending passkey ceremonies kept in memory; at the cap the oldest makes room (S6, 1.4.0 — until then the table refused). |
| `passkey_ceremony_ttl_secs` | `300` | 1 | A started ceremony must finish within this; expired ones are swept. |
| `passkey_ceremonies_per_ip` | `8` | 1 | One client IP's share of the table; at its share its own oldest goes, nobody else's. The `/login` IP limiter (`rate_limit_login_*`) also covers `/passkeys/login/*`. |
| `public_url` | — | — | The `https://` origin the dashboard is reached at; required at `--check`/start when `passkeys` is compiled in. |

### Self-update (K18–K21; read only with the `self-update` feature)

| Key | Default | min | What it does |
|---|---|---|---|
| `update_mode` | `off` | — | `off`, `supervised` or `autonomous`. |
| `update_url` | derived | — | Directory holding `VERSION`, `SHA256SUMS`, `SHA256SUMS.minisig` and the binary. Default `https://github.com/<AppSpec.repository>/releases/latest/download`; with neither set and mode not `off`, `--check` refuses: `update_mode is on but neither update_url nor AppSpec.repository says where releases live`. |
| `update_asset` | `<name>` | — | The binary's asset name in the manifest. |
| `update_interval_secs` | `21600` | 60 | Time between checks (autonomous installs; off/supervised watch read-only). |
| `update_startup_delay_secs` | `300` | 0 | Delay before the first check after start. |
| `update_healthy_after_secs` | `60` | 1 | Autonomous: serving this long after bind confirms the new version. |
| `update_max_start_attempts` | `2` | 1 | Autonomous: starts of an unproven version before the previous binary is restored. |
| `update_hold` | `` | — | `1.4.0` or `pin:1.4.0` pins that version; `skip:1.4.0` refuses exactly that one. Must parse as `x.y.z`. |
| `update_drill` | `` | — | `broken` or `broken-after-ready` for the broken-release drill; anything else refused. |
| `update_keep_copies` | `3` | 1 | Pre-update state copies kept. |
| `update_probe_timeout_secs` | `30` | 1 | Bound on `<staging> --check`. |
| `update_download_timeout_secs` | `300` | 1 | HTTP timeout per download. |
| `update_copies_dir` | `<state_dir>-pre-update` | — | Where pre-update copies go (beside, not under, the state root). |
| `update_pubkey` | compiled-in key | — | A minisign public key (base64 line) replacing the ecosystem key. Refused if not a minisign key; logged and shown on the card when set. |
| `update_allow_insecure` | `false` | — | Allow an `http://` release host. `true/false/1/0/yes/no/on/off`. |
| `update_max_download_bytes` | `268435456` | 1 | An asset above this is refused before it is read in full. |
| `update_notify_after_failures` | `3` | 1 | `update.failed` is emitted once, on the N-th consecutive failed release check (unreachable host, refused signature, bad hash), and `update.ok` once when checks succeed again — not every interval (A3, 1.4.0; Almanac's AR24). `1` reports every first failure. |

### Notifications (K22; read only with the `notify` feature)

| Key | Default | min | What it does |
|---|---|---|---|
| `notify_timeout_secs` | `10` | 1 | HTTP timeout per webhook attempt. |
| `notify_retries` | `3` | 0 | Retries per target before the fallback is tried. |
| `notify_backoff_base_ms` | `500` | 1 | First retry delay. |
| `notify_backoff_cap_ms` | `30000` | 1 | Largest retry delay (jitter may add up to one more). |
| `notify_queue_size` | `1024` | 1 | Events waiting for delivery; a full queue drops the event with a warning. |
| `health_sample_secs` | `30` | 1 | How often health is sampled for `health.degraded` / `health.recovered`. |

The `[[notify.webhook]]` entries themselves live only in the file (see
OPERATIONS.md § Notifications). Proven by:
`app::tests::shipped_defaults_pass_their_own_validation` (the defaults
survive their own parser; `--max-in-flight 0` is refused).

## Control commands

All knobs are **global flags**: `inbox update --update-url …` works, and
so does the flag before the subcommand. Every command below except
`--version` and `gen-secret` loads and validates the full configuration
first, so a bad knob makes it exit 1 with a remedy. Exit codes are 0 or
1 only.

| Command | What it does | Exit |
|---|---|---|
| `--version`, `-V` | Prints `<name> <version>`. Reads no configuration, no environment, no state dir (a garbage `<P>_LISTEN` does not matter). | 0 |
| `--check` | Validates every knob; with `dashboard` requires both secrets (and `public_url` with `passkeys`); requires an **existing, writable** state dir (writes and removes a zero-byte `.chassis-probe`, creates nothing); prints warnings to stderr; runs the project's `App::on_check` hooks; prints `<name>: configuration ok`. Opens no socket. | 0 ok / 1 first error |
| `--print-config` | The table above. Works without secrets when neither is set. | 0 / 1 on a load error |
| `--healthcheck [URL]` | `GET` the URL (default: the configured port on `127.0.0.1`), prints `<name>: alive=<bool> status=<ok\|degraded> version=<v>`. Alive means a well-formed JSON report came back, 200 **or** 503. | 0 alive / 1 |
| `gen-secret` | Prints `<P>_TOKEN=<48 hex>` and `<P>_SECRET_KEY=<64 hex>`. Refuses when stdout is not a terminal. Reads nothing. | 0 / 1 |
| `update` | One supervised update attempt regardless of `update_mode` (SELF_UPDATE.md). Prints one of: `… already current (<v>); nothing touched`, `… <v> is available but held; nothing touched`, `… an update to <v> is still on probation; nothing touched`, `… installed <to> over <from>; restart to run it`. Never restarts, never writes update state. | 0 for all four outcomes / 1 on error |
| `rekey` | Re-seals every `*.json.enc` in the state dir from `<P>_OLD_SECRET_KEY` (read from the process environment) to `<P>_SECRET_KEY`. Files already under the new key are skipped, so a rerun is a no-op; prints `<name>: N store file(s) in <dir> now sealed under <P>_SECRET_KEY; unset <P>_OLD_SECRET_KEY and start the service`. Run it with the service stopped (the code does not enforce that). | 0 / 1 |

Without the `self-update` feature, `update` exits 1 with `this service
was built without the self-update feature`.

### What `--check` refuses (each with its remedy, verbatim from a run)

```text
INBOX_TOKEN is set but INBOX_SECRET_KEY is not; the dashboard needs both. What now: run `<binary> gen-secret` on a terminal to get a value for INBOX_SECRET_KEY, then set it in the environment file
INBOX_SECRET_KEY is not hexadecimal. What now: set INBOX_SECRET_KEY to 64 hex characters, e.g. <64 fresh hex chars>
listen address `not-an-address` is not host:port. What now: set INBOX_LISTEN (or --listen) to something like 0.0.0.0:8080
shutdown_timeout_ms is 0. What now: set it to a positive number; 0 would make every clean stop look like a timeout
log format `yaml` is not one of text, json. What now: set the log_format knob to text or json
update_mode `sometimes` is not one of off, supervised, autonomous. What now: supervised = the homelab runs `<binary> update`; autonomous = this process checks and restarts itself; off = never
update_drill `explode` is not one of broken, broken-after-ready. What now: leave it empty unless you are running the broken-release drill
`not-a-version` is not a version of the form MAJOR.MINOR.PATCH. What now: the release's VERSION file must contain exactly x.y.z
```

Also refused: `trusted_proxies entry `traefik` is not an IP address`, a
non-minisign `update_pubkey`, a `public_url` that is not `https://`, an
unknown flag (`error: unexpected argument '--bogus' found … What now: run
with --help for the flags this service accepts`).

### The two warnings `--check` prints (stderr, exit still 0)

```text
warning: trusted_proxies is empty while listening on 0.0.0.0:0: behind a reverse proxy every client shares the proxy's IP (one attacker's failed logins lock everyone out), cookies are never Secure and passkeys stay off. What now: set INBOX_TRUSTED_PROXIES to the proxy's IP, or bind to 127.0.0.1 if no proxy is involved
warning: the unit's TimeoutStopSec (5 s) is shorter than shutdown_timeout_ms (10000 ms): systemd would SIGKILL a drain that is still running. What now: raise TimeoutStopSec in the unit (and INBOX_TIMEOUT_STOP_SECS with it) or lower INBOX_SHUTDOWN_TIMEOUT_MS
```

The first fires when `trusted_proxies` is empty and `listen` is not a
loopback address; the second when `<P>_TIMEOUT_STOP_SECS` parses and is
shorter than the shutdown timeout. At start the same two lines go to the
log at `WARN`. Proven by:
`check_warns_about_empty_trusted_proxies_and_a_short_stop_timeout`,
`update_subcommand_refuses_a_foreign_signature_and_touches_nothing`
(the `--check` knob refusals), `version_answers_with_no_configuration_at_all`,
`app::tests::every_command_named_in_a_remedy_exists` (every `<binary> …`
a remedy names is a real subcommand).
