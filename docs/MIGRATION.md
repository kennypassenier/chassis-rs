# Migration — moving an existing service onto the kit

A checklist for kyu, Almanac, HTTPSwitchboard and kyu-runner. The four
migrations are their own mini-projects in their own repositories (SCOPE
N4, AFK answer A2: one `chassis-migration` branch per repo); this
document says what the kit takes over, what stays yours, and in which
order to do it. It cannot read those repositories, so the knob mapping
describes shapes, not their exact names.

Proven by: the extension points in `crates/chassis/src/app.rs`
(`impl App`), the `ClientStore` trait in `crates/chassis/src/shell/store.rs`,
and `examples/inbox/src/main.rs`, which uses every one of them.

## 1 · What the kit replaces

| Concern | Kit module | What your code drops |
|---|---|---|
| Configuration | `core::config`, `shell::config_load` | hand-rolled env/flag/file parsing; `--print-config` and `--check` come free |
| Logging | `shell::logging` | subscriber setup, ANSI handling, JSON switch |
| Errors | `core::error` (`Error { kind, message, remedy }`) | your HTTP error rendering; every API error becomes `{"error", "remedy"}` |
| Request id, access log | `shell::http` | per-request logging middleware |
| Health | `shell::health` (`/healthz`, `Subsystem` trait) | your health handler; **no `/readyz`** (W7) |
| Metrics | `shell::metrics` (`/metrics`, `ScrapeSource`) | the exporter; your metric *names* stay |
| Shutdown | `shell::lifecycle` (SIGTERM, drain, flush, `READY=1`) | signal handling, sd_notify |
| Auth, CSRF, guards | `shell::auth`, `shell::guards` | token/session code, same-origin check, rate limiting, body cap |
| Dashboard chrome | `shell::dashboard`, `templates/`, `static/` | layout, theme picker, kp-themes vendoring, login page, clients page |
| Self-update | `core::update`, `shell::update` | Almanac's `core/update.rs` + `shell/update.rs` (the kit is the port) |
| Notifications | `core::notify`, `shell::notify` | ad-hoc webhook code, backoff |
| Release & scaffold files | `chassis new/sync/release`, `scaffold/` | your CI/release workflows, unit, Dockerfile, sign script |

## 2 · What stays project code

Everything the service *does*: kyu's queue and topics, Almanac's
calendars and Google client, HTTPSwitchboard's translation, kyu-runner's
pump; their own storage (SQLite, files); their API handlers; their pages'
content. The kit knows only what every service needs (SCOPE N1).

## 3 · Mapping old knobs to new

Every kit knob has three names derived from one key (CONFIGURATION.md).
Find each of yours and decide: kit knob, project knob, or gone.

| Old shape | Becomes |
|---|---|
| `BIND` / `LISTEN_ADDR` / `PORT` | `<P>_LISTEN` (`host:port`); default `0.0.0.0:8080` |
| `DATA_DIR` / `STORE_PATH` / `CONFIG_PATH` and other per-path knobs | one root `<P>_STATE_DIR`; derive every path from `App::loaded.state_dir` (rule 28: no per-path overrides). The config file is `<root>/config.toml` unless `<P>_CONFIG` |
| `RUST_LOG` | `<P>_LOG`; JSON via `<P>_LOG_FORMAT=json` |
| `ADMIN_TOKEN` / `DASHBOARD_TOKEN` / `PASSWORD` | `<P>_TOKEN` (≥ 16 chars, env only) |
| a store encryption key, or none | `<P>_SECRET_KEY` (64 hex, env only); the kit's stores are sealed with it |
| a shutdown grace period | `<P>_SHUTDOWN_TIMEOUT_MS` (0 refused) |
| body/concurrency/rate limits, if any | `<P>_MAX_BODY_BYTES`, `<P>_MAX_IN_FLIGHT`, `<P>_RATE_LIMIT_*`, `<P>_REQUEST_TIMEOUT_SECS` |
| a captures/"last requests" TTL and size | `<P>_CAPTURE_KEEP`, `<P>_CAPTURE_BODY_BYTES`, `<P>_CAPTURE_TTL_SECS`, `<P>_CAPTURE_REDACT` |
| Almanac's update knobs (`UPDATE_MODE`, interval, hold…) | `<P>_UPDATE_MODE`, `<P>_UPDATE_URL` (or `AppSpec.repository`), `<P>_UPDATE_INTERVAL_SECS`, `<P>_UPDATE_HOLD` (`pin:`/`skip:`), `<P>_UPDATE_DRILL` |
| webhook/notification settings | `[[notify.webhook]]` tables in the file with `${VAR}` for secrets |
| project-specific settings (Google credentials, topic names, upstream URLs) | stay yours: read them from `app.loaded.as_ref().unwrap().file_table` (the raw TOML, nested tables untouched) or your own env names |

Rules that bite: secrets are refused from the file and are not flags; a
`${VAR}` that is unset is an error; every knob needs its three names, so
pick keys that read well as `--flag`, `ENV` and `key`.

## 4 · The `/` ownership rule

With the `dashboard` feature, `/` is the kit's status page and axum
refuses two handlers on one path. Put the API under `/v1/…` (as
`api_routes`, behind client tokens) and own pages behind
`nav_entry` + `dashboard_routes` (DASHBOARD.md). kyu and Almanac serve
their dashboard index on `/` today; after the migration that index is a
status section (`status_section`) or a page of its own.

## 5 · Assembling `main.rs`

The pattern, from `examples/inbox/src/main.rs`; each line is a real
`App` method:

```rust
let spec = AppSpec { name: "kyu", version: env!("CARGO_PKG_VERSION"),
                     repository: Some("kennypassenier/kyu"), ..Default::default() };
let mut app = App::from_env_and_args(spec, public_routes)   // public_routes: nothing needing auth
    .expect("inbox matches on the Result and prints the error");
app.api_routes(token_routes);            // Authorization: Bearer <client token>; captured per client
app.dashboard_routes(admin_pages);       // behind the login session, inside the layout
app.test_route("POST", "/v1/…", "application/json", r#"{…}"#);
app.status_section(MySection);           // fn render(&self) -> Section
app.client_column(MyColumn);             // fn title / fn cell(&ClientView) -> String (raw HTML)
app.problems(|| my_config_problems());   // Vec<Problem { what, why, remedy }>
app.clients_label("Sources");            // Almanac; URL stays /clients
app.subsystem(MyStoreHealth);            // fn name / fn check(&self) -> SubsystemStatus
app.metrics_source(MyScraper);           // fn scrape(&self) -> String, appended verbatim
app.exempt_from_timeout("/t/");          // kyu's long polls
app.on_check(|| my_store.verify());      // runs under --check and the update probe; must not write
app.on_flush(|| my_store.checkpoint());  // after the server drained
app.state_copy(|dest| my_store.vacuum_into(dest.join("kyu.sqlite")));  // before a binary swap
let notifier = app.notifier();           // notifier.emit("kyu.delivery.failed", version, detail)
app.run().await
```

In handlers, `chassis::Caller` is an extractor: `Caller::Admin` (login
token or session) or `Caller::Client { id, name }`. Your error type
implements `chassis::IntoKitError` (one method returning `chassis::Error`)
or you build `Error::invalid/config/dependency/internal(message, remedy)`
directly; a `remedy` is mandatory at compile time.

## 6 · `ClientStore`: keeping your own client table (kyu)

The kit's clients live in `clients.json.enc` by default. A project that
keeps them elsewhere implements the trait and hands it in with
`app.client_store(Arc::new(MyStore))`:

```rust
pub trait ClientStore: Send + Sync {
    fn snapshot(&self) -> ClientsFile;
    fn update(&self, f: &mut dyn FnMut(&mut ClientsFile) -> Result<Client, Error>) -> Result<Client, Error>;
    fn touch(&self, id: &str, now: &str);
    fn persist(&self) -> Result<(), Error>;
}
```

`snapshot` returns the whole `ClientsFile` (`v`, `clients: Vec<Client>`
with `id`, `name`, `token: Option<String>`, `issued_at`, `revoked_at`,
`last_used_at`, `uses`); `update` applies a change and persists it only
when the closure returned `Ok`; `touch` records a use in memory; `persist`
writes what `touch` accumulated (called every `clients_persist_secs` and
at shutdown). Tokens are stored **encrypted, not hashed**, so Reveal and
Copy work; if your table is not encrypted at rest, seal it or accept the
difference knowingly. The kit ships `FileClientStore` and
`MemoryClientStore` and drives both through one suite — run your
implementation through the same `drive()` (`shell::store::tests`). Note
the trait differs from AR5's sketch (`list`, `get_by_token`, …): the code
is the contract. Sessions and passkeys always use the kit's sealed files.

## 7 · Behaviour that changes on purpose

- **No unprotected mode** (W6): a dashboard without both secrets does not
  start; kyu loses that mode.
- **No `/readyz`** (W7), **no in-process TLS** (W8), **no token scopes**
  (W5, Later).
- **Captures are in memory** and empty after a restart (AR7); Almanac's
  captures page and capture-only token are replaced by Last requests.
- **Wrong login is HTTP 200** with an inline message, never 401.
- **The kit reads env only, never `.env`** (M2); under systemd use
  `EnvironmentFile=` or the `--latch` unit variant.
- **Passkeys** are compiled but the success path is untested until the
  live Bitwarden test (TEST_PLAN §3, H7); S6 accepted for now.

## 8 · Ejecting a module

If a kit module does not fit, copy the file out (`README.md`, "Ejecting a
module"): every `core/*` file is pure and every `shell/*` file touches one
concern, each opening with a `//!` sentence saying what it does (enforced
by `tests::every_module_opens_with_a_doc_comment`), and its tests sit in
the same file. Copy it into your crate, change the `use crate::…` paths,
keep the tests. The kit's `App` keeps using its own; you wire yours where
the extension points allow (a `Subsystem`, a `ScrapeSource`, a router).

## 9 · Release and signing changes

The kit's own `CHANGELOG.md` keeps a **Migration** section under
`[Unreleased]` listing what a consumer must change per kit release; read it
before bumping the tag.

- Four assets per release: `<name>`, `SHA256SUMS`, `SHA256SUMS.minisig`,
  `VERSION`; CI makes the first two with `GITHUB_TOKEN`, `chassis release`
  the last two from the PC (SELF_UPDATE.md).
- **The trusted comment is now required**: the updater accepts a
  signature only if its comment reads `<owner/repo> v<version>`.
  Almanac's existing releases carry minisign's default comment
  (`the_compiled_in_key_verifies_a_real_almanac_release` shows it), so a
  kit-based Almanac cannot update *from* them; the first kit release of
  each project must be signed with `scripts/sign-release.sh` (via
  `chassis release`), and so must every later one.
- The tag must equal `Cargo.toml`'s version (the Release workflow
  refuses otherwise); a major bump needs a `Migration` section in
  `CHANGELOG.md`.
- The homelab reads `service.yml`: `binary: /opt/<name>/bin/<name>`,
  `update_cmd` via `systemd-run --wait --pipe --collect …`, `data_dirs:
  [<state root>]`. The install path moved from `/usr/local/bin` to
  `/opt/<name>/bin` (S2), announced to the Homelab Rust session.

## 10 · The order

1. `chassis new <name> --no-remote --dir /tmp/<name>-scaffold` and copy
   the scaffold files you lack into the existing repository on a
   `chassis-migration` branch — **`.chassis.toml` included** (edit `name`,
   `repo`, `state_dir`, `latch`; or write it first and run `chassis sync
   --write`, see `scaffold/README.md`). `chassis sync` and `chassis release`
   refuse to run without it; the three projects migrated on 2026-09-05
   lacked it and could not release until it was added. Commit the kit as a
   git dependency pinned to a tag, with `version = "<tag without v>"`
   beside it — cargo-deny's wildcard rule rejects a git dependency without
   a version requirement.
2. Rewrite `main.rs` per §5; move handlers under `api_routes` /
   `dashboard_routes`; delete the code from §1.
3. Map the knobs (§3); write the new env file with `gen-secret`; make
   `<name> --check` green; read `--print-config` line by line.
4. Run the project's own tests, then the kit-shaped E2E (copy the
   patterns from `examples/inbox/tests/lifecycle_e2e.rs`: `--version`
   without configuration, SIGTERM → exit 0, the token flow, the log scan
   for secrets).
5. Drill on a scratch LXC: install per GETTING_STARTED §9, restore drill
   per OPERATIONS.md §7, and — once a signed release exists — the
   supervised swap per SELF_UPDATE.md.
6. **Closing check before "gates green" is reported** (CF-6, 2026-09-06):
   `chassis release <next> --dry-run` is green (it checks `.chassis.toml`,
   the Dockerfile the image job expects, and the Migration section on a
   major), and the Release workflow has run once on a test tag of the
   branch. Discipline-enforced: the migration is not reported done without
   both lines in its PENDING entry. Three migrations were reported green on
   2026-09-05 and none of them could release the next day.
7. **Deploy files come from measured paths** (CF-6 d): before writing the
   unit, `service.yml` or an env file for a target machine, read what is
   there (`systemctl cat <unit>`, `ls` of the state root and the binary
   directory) and copy those paths — never the scaffold's defaults or the
   project's README. Almanac's migration note put the state root at
   `/opt/almanac`; the LXC had it at `/appdata/almanac/almanac-config`.
   Discipline-enforced.
8. Release with `chassis release <version>`; then `homelab adopt` with
   the new `service.yml`.

Nothing here is released or deployed by the migration branch itself
(A2: gates green, no release, no deploy); Kenny gives the go per project.


## Background workers: `on_start` and `on_flush` (1.1.0)

A service with a pump or poller (kyu-runner, http-switchboard) spawns it
from `app.on_start(|| { … tokio::spawn(…) … })` — after the bind and the
READY notification, inside the runtime, never for `--check` or the other
control commands — and stops it from `app.on_flush(|| { stop_tx.send(true);
Handle::current().block_on(join_all(tasks)) })`, which the kit runs inside
its shutdown window. The kit's own knob keys are stripped before a project
deserialises the shared file with `deny_unknown_fields`:

```rust
let config = Config::from_table(&app.loaded.as_ref().unwrap().file_table, &app.spec.knob_keys())?;
```

## 1.2.0 additions

- **`help_extra`.** Put the project's environment variables and
  subcommands in `AppSpec { help_extra: Some("…"), .. }`; `--help` prints
  the kit's knobs first, then this text. Keep it to what the kit cannot
  know — the knobs are already listed.
- **`needs_project_config()`.** Read the project's own configuration only
  when `app.needs_project_config()` is true:

  ```rust
  let mut app = App::from_env_and_args(spec, Router::new())?;
  if !app.needs_project_config() {
      return app.run().await; // --version, --help, --healthcheck, update, …
  }
  let loaded = app.loaded.as_ref().expect("a start or --check loads");
  ```

  Before 1.2.0 the idiom was `let Some(loaded) = app.loaded.as_ref()`,
  which also caught `--healthcheck`, `--print-config`, `update` and `rekey`
  — and made `--healthcheck` fail on a box without the config file.
- **`update_gate`.** `app.update_gate(move || captures.retained().then(|n|
  format!("{n} captures retained")))` defers an autonomous check while the
  closure returns `Some(reason)`; the reason is logged once per deferred
  tick. Only the autonomous loop asks; `<name> update` is the operator's
  decision.
- **Own dashboard under the kit's CSP.** A project that keeps its own
  templates (kyu, Almanac) runs under `script-src 'self'; font-src 'self'`
  from the moment it merges its router into the kit. Inline `<script>`
  blocks stop running and CDN fonts stop loading. Move the no-flash snippet
  to a file the project serves itself, and serve the fonts from the kit's
  vendored set:

  ```rust
  // in the project's /static/{name} handler
  if let Some((_, content_type, bytes)) =
      chassis::shell::assets::ASSETS.iter().find(|(n, _, _)| *n == name)
  {
      return ([(CONTENT_TYPE, *content_type)], *bytes).into_response();
  }
  ```

  `fonts.css` declares the same faces the kp-themes package expects
  (Instrument Sans, Fraunces, Share Tech Mono, Chakra Petch).
  Enable the `assets` feature for this (`dashboard` implies it):
  `features = ["core", "self-update", "assets"]`.

## 1.6.0 additions

- `.chassis.toml`: `env_file` and `latch_env` — set them to the paths the
  target machine was measured at (CF-6 d) before `chassis sync --write`, or
  the rendered unit and `service.yml` describe a machine that does not exist.
- Project gates move into `.claude/hooks/gates.project.sh` (executable);
  the kit's `gates.sh` and CI call it. Almanac: AR13 and `check-version.sh`;
  kyu: the SQL guard.
- `.gitignore` entries of your own go under the marker line the scaffold
  ends with; anything above it is the kit's and gets rewritten.

## 1.5.0 additions

- `AppSpec::open_dashboard` (default `false`): opt in to running the
  dashboard open when neither `<P>_TOKEN` nor `<P>_SECRET_KEY` is set
  (DASHBOARD.md, "An open dashboard"). Nothing changes for a service that
  leaves it off.

## 1.3.0 additions

- **`on_update_event`.** A project that already has a notifier keeps it and
  listens to the kit's update events:

  ```rust
  let notifier = my_notifier.clone();
  app.on_update_event(move |event| {
      let name = match event.kind {
          "update.installed" => "my-service-update",
          "update.rolled_back" => "my-service-reverted",
          "update.failed" => "my-service-unverified",
          _ => return, // `update.ok` and `update.held` are routine
      };
      notifier.fire(name, &event.version, &event.detail);
  });
  ```

  The hook runs on the updater's task; keep it cheap (spawn if it does I/O).
  It fires for every event the kit emits, whichever loop or subcommand
  produced it, and the kit's own handling of the event is unchanged.
