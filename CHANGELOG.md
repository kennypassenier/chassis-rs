# Changelog

All notable changes to chassis-rs. Semantic versioning over two contracts
(SCOPE H3): the Rust API services call, and the shape of the files the
scaffold writes. A breaking change in either is a major and carries a
**Migration** section; `chassis release` refuses a major without one.

## [Unreleased]

### Migration

No breaking change; these are the steps that pick up the unreleased fixes.

- **Almanac**: set `Pwa::new().start_url("/")` on the web app at `/ui` so
  the installed app opens on its own pages. Pages rendered through the kit
  layout (`render_project`) already carry the install tags and the script
  that registers the worker; do not add `app.pwa_page_head()` to them (the
  tags would appear twice). `pwa_page_head()` is only for a page that writes
  its whole HTML itself, outside the kit layout.
- **HTTPSwitchboard**: no code change; its web app at `/app/hsb` is
  installable from this release, with the icons in `web/pwa/` (including
  `icon.svg`).
- **Habits**: drop the `no-store` stand-in on the app's JSON data; the worker
  no longer caches it. Users need no step: the next release of the worker
  replaces the old cache and the cached `/data/*.json` copies go with it.
- A service that called `app.webapp(..)` twice used to keep only the second
  app; both are now mounted, and two installable ones are refused at start
  (add `.without_pwa()` to all but one).

### Added

- **Browser-policy headers on every answer** (`[fix-sec-headers-1]`, Habits
  security review): `Cross-Origin-Opener-Policy: same-origin`; a
  `Permissions-Policy` that turns off `accelerometer`, `camera`,
  `display-capture`, `geolocation`, `gyroscope`, `magnetometer`, `microphone`,
  `midi`, `payment` and `usb` (nothing a kit page uses: Web Push, the share
  target, the service worker, clipboard and passkeys are not affected); and
  `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, no
  `preload`) only when a trusted proxy reports HTTPS, the rule the session
  cookie uses. They cover the kit's pages, the API, the web app's files and
  the PWA routes. `app.allow_browser_feature("camera")` sends
  `camera=(self)` instead of the deny; a name that is not lowercase letters
  and `-` is refused at start.

- **A title and a link on a notification** (`[notify-link-1]`, Habits integration
  test): `Notifier::emit_linked(kind, version, detail, Link)` and
  `emit_linked_keyed(.., link, dedup)`. `Link::new(Some("Water drinken"),
  Some("/tasks/42"))?` (or `Link::to(url)?`, in `core::notify_link`) checks
  its parts when it is built: the url is a path of the app (one leading `/`)
  or an absolute http(s) address, the title one line of at most 200
  characters; anything else is refused with a remedy. The JSON body of the
  shared sender, and so the outbox row, gains `"title"` and `"url"` after
  `detail` for whichever is set; without a link the body is byte for byte the
  old one. The public `Event` struct is untouched (the link travels beside
  it), so this is a minor. The default body of a `[[notify.webhook]]` entry
  gains the same two fields; a custom `body` template sees them as the
  variables `title` and `url`, absent when unset (`{% if url %}`), via the new
  `Webhook::render_body_linked` (`render_body` is unchanged).
- **`notify_kit_url`** (`[notify-kit-1]`): where the kit's own events
  (`KIT_EVENTS`: `service.started`, `update.*`, `health.*`; see the new
  `core::notify::is_kit_event`) go instead of `notify_url`, through the same
  outbox, retries and fallback. Flag, environment `<P>_NOTIFY_KIT_URL` or
  config key, checked like `notify_url` (a bad value stops the start); not
  editable on the Status page. The app's own events always go to `notify_url`.
  Unset, everything behaves as before. The Notifications card shows a "Kit
  events" line when it is set and `GET /api/kit/notify` answers `kit` (null
  when unset); the Test button also tests it.

- **A web app mounted below the root is installable** (`webapp` PWA, HTTPSwitchboard
  at `/app/hsb`, Almanac at `/ui`; `[feat-pwa-mount-1]`): the whole service is
  the installed app. The manifest, `/sw.js`, `/pwa/*` and `/favicon.ico` stay
  at the root with scope `/`, so the kit's pages and the project's own routes
  are inside it; icons, shortcut icons and screenshots are read from the web
  app's own files (`pwa/icon-192.png` of the mount serves `/pwa/icon-192.png`).
  `start_url` defaults to the mount (`/app/hsb/`); `Pwa::start_url(path)` sets
  another (checked: a path of the app). `App::webapp` can be called more than
  once; two installable web apps are refused at start and at `--check`, naming
  the mounts. The root case is unchanged.
- **`App::pwa_page_head()` / `WebApp::pwa_page_head()`**: the head markup for
  pages a project renders itself (manifest link, theme colour, touch and tab
  icons, the push marker) plus a `<script type="module">` for the new
  `/static/chassis/pwa-boot.js` that registers the worker; `script-src 'self'`
  is enough. `None` when no web app is installable.
- **`pwa/icon.svg`**: a web app that ships it lists
  `{src: "/pwa/icon.svg", sizes: "any", type: "image/svg+xml"}` in the manifest
  and gets `<link rel="icon" href="/pwa/icon.svg" type="image/svg+xml">` ahead
  of the PNG link. `/pwa/icon.svg` is public; it answers only when the file is
  SVG text, else 404.
- **Web Push** (feature `push`, implies `webapp`; Habits, 2026-11-02, design in
  `docs/PUSH_DESIGN.md`): `app.push().send(Push::new("Water drinken").body(..)
  .url("/habits/water").tag(..).action("done", "Gedaan", "/api/habits/water/done"))`
  returns a `PushReport { accepted, removed, failed, last_error }`. Our own
  RFC 8291 encryption and RFC 8292 VAPID signing on `ring` (an optional direct
  dependency, already in the tree through rustls), delivery over the existing
  `reqwest`. One VAPID key per app, made on the first start and sealed in the
  kit file; subscriptions in the new kit table `kit_push_subscriptions` (https
  endpoints only, capped); 404/410 from a push service deletes the
  subscription. API behind the login: `GET /api/kit/push/key`,
  `POST /api/kit/push/subscribe`, `POST /api/kit/push/unsubscribe`. Page:
  `window.chassisPush.state() | subscribe() | unsubscribe()` (no UI; present
  only on installable pages of a build with the feature). The service worker
  gains `push` and `notificationclick` handlers: action buttons `POST` to an
  app route with the login cookie, a body click focuses or opens the app.
  Knobs: `push_subject` (required before sending), `push_ttl_secs` (86400),
  `push_timeout_secs` (10), `push_max_subscriptions` (50), `push_concurrency`
  (8). The notify channel is untouched.
- **`/favicon.ico` no longer hides an app's own file**: the public redirect to
  `/pwa/icon-192.png` is only answered when the web app ships no
  `favicon.ico`; with one, that file is served.
- **Manifest screenshots and a favicon** (`webapp` PWA, Habits, 2026-11-01):
  `Pwa::screenshot(Screenshot::new(path, "WxH", FormFactor::Narrow | Wide)
  .label(text))`, callable more than once, writes `screenshots` into the
  manifest (type from the extension). Checked at start: an absolute plain
  `.png` or `.webp` path (no scheme, query, `#` or `..`) and `WxH` digits.
  Each declared path is a web-app file served outside the login (a missing
  file or the wrong image type is a 404); no other path becomes public.
  Fixes apps having no favicon: every installable page, and every kit page
  of an installable app, now carries
  `<link rel="icon" href="/pwa/icon-192.png" type="image/png">` next to the
  manifest link (a page's own `rel="icon"` wins), and `GET /favicon.ico` is
  answered publicly with a 308 to `/pwa/icon-192.png`. Nothing is added when
  the app is not installable.
- **Installed-app polish from Habits** (`webapp` PWA, Habits gaps 1, 3, 4, 5,
  6 and 8, 2026-11-01): the manifest lists a generated
  `/pwa/icon-maskable-192.png` and a `/pwa/icon-monochrome-512.png` (the
  initial in the theme colour on a transparent ground, for themed launcher
  icons); both are public and replaceable by a web-app file at the same path.
  New optional manifest fields, each written only when set:
  `Pwa::categories`, `orientation(Orientation)`, `lang`, `dir(Dir)`,
  `display_override(&[Display])` and `launch_handler(ClientMode)`.
  `Shortcut::icon(path)` adds a 96x96 PNG to a shortcut; the path is a file
  of the web app and is served outside the login with the PWA icons (a
  missing file is a 404). The page script keeps the
  `<meta name="theme-color">` in step with the kit header's colour at start
  and on every `kp-theme-change` (installable pages only; the injected value
  stays the first-paint colour). `Pwa::reload(Reload::Ask)` stops the
  automatic reload on a new release: the page fires `chassis-pwa-update` on
  `window` with `detail: { version, apply() }`, and `apply()` reloads once
  under the same `chassis-sw-reloaded` key. The policy reaches the page as
  `data-chassis-reload="ask"` on the injected manifest link. `Reload::Auto`
  (default) behaves as before.

- **Storage follow-ups from kyu's move to the kit store** (`storage`,
  2026-11-01): `Db::recent_write_failure_age()` says how long ago the last
  write failed; a passing `Db::probe_writable()` no longer clears a failure
  a real write recorded; a clean stop folds the write-ahead logs into their
  files as its last step (after the project's flush hooks); the docs warn
  that write tickets do not nest.

- **What kyu's store needed, in the kit's storage** (`storage`, kyu
  2026-11-01): `Db::open_with(path, migrations, &DbOptions)` and
  `AppDbSpec::with_options` with `DbOptions::readers(n)` (up to
  `MAX_READERS`), `writable_readers()` and `pre_migration_snapshots(n)`: an
  existing file is copied to `<stem>.pre-v<N>.db` before it migrates (a
  failed copy refuses the migration) and only the newest n copies are kept,
  newest by version number. `Db::probe_writable()` (`BEGIN IMMEDIATE`, then a
  rollback) for `/healthz`. `Db::write_as` / `write_blocking_as` return the
  project's own error type (`E: From<chassis::Error>`); the closure's own
  refusals never count as a sick store, and `Db::note_failure` reports one
  the project saw itself. `Db::open` behaves as before.


- **One refresh control and one freshness line, owned by the kit**
  ([ux-chassis-10]; Kenny's decision "De kit beheert hem"): Status,
  Storage and Clients draw the same kp-themes auto-refresh control from one
  slot (`<div data-chassis-refresh>`), and a web app's pages get it from the
  runtime by putting that slot in their header row. The interval is one
  remembered choice (`chassis-refresh`, per login through the preferences)
  shared by every page. App code uses `window.chassisRefresh`
  (`onTick`, `onInterval`, `interval`, `setInterval`, `now`, `markFresh`),
  the `chassis:refresh` event, and `data-chassis-refresh-section="/url"` to
  have a server-rendered section re-read on the kit's tick instead of its own
  bar. Additive. **Migration** for an app with its own bar: delete the bar
  and its "updated" line, add the slot, move the bar's handler into
  `onTick`; see docs/DASHBOARD.md and docs/WEBAPP.md.

- **One overflow menu in the header** (`shell`; [ux-chassis-7]; kitchen,
  Medicine Cabinet, http-switchboard reviews 2026-11-01):
  `Page::new(id, title, path).secondary()` (and `.primary()` to undo it)
  puts a page in the header's single "More" menu instead of the bar. The
  menu also holds the kit's Passkeys and Storage pages (secondary by
  default; `kit_page("storage", |p| p.primary())` keeps one in the bar) and
  the actions of the page you are on, so Status's and Passkeys' own
  "More" buttons are gone: there is exactly one More per screen. Links the
  bar folds on a narrow window go into the same menu. `Page.secondary` and
  `PageSet.more` (the ids of the listed secondary pages) are served in
  `GET /api/kit/pages`.
- **A More tab on the phone** ([ux-chassis-8]): the kit's tab bar shows the
  first five primary pages as tabs and ONE More tab that holds the secondary
  pages, any primary page beyond the fifth, Help, theme and Log out, so no
  page is in both. A web app with its own tab bar hosts the same tab from
  `more` (docs/WEBAPP.md) and does not draw the kit's drawer next to it.
- **Help for every page** ([ux-chassis-9]): a "?" in the header opens a
  drawer with plain-English help. Status, Clients, Passkeys and Storage carry
  their own (Storage explains the budget, pending writes and Clean up);
  `Page::help(html)` adds help for a project's page, `kit_page(id, |p|
  p.help(..))` replaces a kit page's, and `GET /api/kit/pages` serves it as
  `help`. Round: [kp11].
- **Home-screen shortcuts and a share target for installable web apps**
  (`webapp`; Habits, 2026-11-01): `Pwa::shortcut(Shortcut::new(name, url))`
  and `Pwa::share_target(ShareTarget::get(action))` (or `post`, `.params`,
  `.files`) add `shortcuts` and `share_target` to the manifest. Checked at
  start: a path outside the app, an empty name or more than four shortcuts
  refuses with a remedy. See docs/WEBAPP.md.

### Changed

- **Status, Storage and Clients no longer keep an interval each**: the
  three remembered keys (`chassis-status-refresh`, `chassis-storage-refresh`,
  `clients-refresh`) are replaced by the one shared key. A reader's earlier
  choice per page is not carried over; Storage still opens on 5 min until a
  choice is made.
- **The kit's pages fill the page container** (Status, Clients, Storage,
  Passkeys, the error page; Kenny's 80 % rule, kit-page UX review): the
  page column inside `<main class="kp-page">` capped and padded a second
  time, so content used 976 of 1280 px. The kit's roots now carry
  `.chassis-ops`, which hands the width and padding back to the container
  (1024 px at 1280).
- **The Issue dialog is as large as its content**: one name field is a
  508 px dialog at 1280 (was 750) and 549 px at 390 (was 882). The name's
  example moved from the placeholder to the hint line under the field, and
  the preview line reads "Requests from this <app> will go to POST /path".
- **The Clients onboarding cards are the empty state**: "Wire up your first
  ..." and "What a ... is" show while no client exists and go as soon as
  one does; the list, the figures and the refresh control take their place.
  The "Waiting for a call" state is gone with them.
- **The Storage "Clean up..." dialog is as large as its content**: the
  preview and the confirm band have no minimum height, so a kind with
  nothing to remove is 657 px at 1280 (was 833).
- **A client has a page of its own** (`dashboard`; ux-chassis-5, from the app
  reviews): "Manage" on the Clients page is a link to `/clients/{id}`, a page
  behind the login (not a nav entry; an unknown id is a 404 in the project's
  words) with a way back to the list and the same content as the old dialog:
  the token to reveal and copy, the command, the test console, the request
  log, the project's own actions and the danger zone. Re-issue, Revoke and
  Delete confirm in a panel inside the page (Delete still asks for the name)
  instead of a second modal, and the page then shows the result in place:
  nothing reloads (`data-kp-reload="page"` is gone from the flow), and the
  request log and the scroll position stay. A project action's `data-post`
  button now raises a cancelable `chassis-post-done` event before it reloads,
  which the client page uses to update in place. On the list, a client issued
  from the dialog appears as a new row without a reload; "Open the client" in
  the dialog goes to the client's page; the palette's "Manage ..." goes there
  too. The `/api/clients...` endpoints are unchanged. Round: kp11.
- **The revoke confirmation says exactly what happens** (`dashboard`;
  ux-chassis-6): "The token stops working at once and is wiped. To use
  <name> again, issue a new token." A project's destructive action whose
  label starts with "Revoke" and that names no phrase gets the same words;
  `DEFAULT_CONFIRM` ("Are you sure? This cannot be undone.") stays for every
  other destructive action, where it is true.

### Fixed

- **A push endpoint can no longer point into the local network**
  (`[fix-hunt-push-1]`): the server posts to every stored endpoint, and only
  the scheme was checked, so a logged-in caller could subscribe
  `https://127.0.0.1:..`, `https://169.254.169.254/..`, a private address or a
  single-label name such as `https://nas/` and make the service request it
  (the status code came back in `last_error`). Loopback, private, link-local,
  CGNAT and unique-local addresses, `localhost` and single-label names are
  refused at subscribe. A public name that resolves to a private address is
  not caught (no resolver hook); noted in `docs/PUSH_DESIGN.md`.
- **A too-large push notification fails once, up front** (`[fix-hunt-push-2]`):
  `send` used to build, fail to encrypt and record "the push payload is N
  bytes" as the last error of every subscription; it now returns the error
  before anything is attempted, and no subscription is marked failed.

- **A GET share target is no longer forgeable from another site**
  (habits, `[fix-sec-share-1]`): `ShareTarget::get(path)` writes on GET by
  design, and the `Lax` session cookie rides a top-level navigation from any
  website, so a link elsewhere could trigger it. The kit now answers 403 to a
  request for that path whose `Sec-Fetch-Site` is present and not
  `none`/`same-origin`, or, without that header, whose `Referer` names another
  host. A request with neither header (an installed app's share sheet) passes.
  A POST share target already goes through the CSRF rule. Documented on
  `ShareTarget::get`.
- **A logged-out `fetch` gets a 401 JSON, not a redirect into the login page**
  (habits, `[fix-json-401-1]`): a dashboard route used to answer every
  logged-out request with a 303 to `/login`, which `fetch` follows into a 200
  HTML page. A script call (`Sec-Fetch-Mode` other than `navigate`,
  `Sec-Fetch-Dest: empty`, or without those headers an `Accept` that lists
  types but neither `text/html` nor `*/*`) now gets 401
  `{"error":"not logged in","remedy":"log in on /login, then repeat the call"}`.
  Navigations and header-less clients keep the 303.
- **A listen address that is not loopback, with no trusted proxy**
  (`[fix-sec-cookie-1]`): the start-time warning and the `--check` warning
  already existed; they now say plainly that the session cookie never gets
  `Secure` and name `<PREFIX>_TRUSTED_PROXIES`, and a test pins them (fires for
  `0.0.0.0`, silent for `127.0.0.1` or with a proxy). Cookie behaviour is
  unchanged.

- **The API door's 401 remedy speaks to the program that got it**
  (habits, `[fix-door-1]`): a request that carried an `Authorization`
  header with an unknown token (a rotated or mistyped one) now gets
  "send the token issued for this source on the Sources page (/clients),
  as Authorization: Bearer <token>", in the app's own vocabulary and clients
  page label. A request with no header keeps the old remedy. The `error`
  text and the 401 status are unchanged.
- **Kit pages register the service worker** (almanac, `[fix-pwa-boot-1]`):
  `/`, Clients, Storage and every page rendered through the kit layout
  carried the manifest but not the script that registers the worker, so a
  first visit to the start page installed nothing until a web-app page was
  opened. The layout now writes the install tags with `pwa-boot.js`, once.
- **Two web apps on one mount are refused at start** (`[fix-mounts-1]`):
  now that `App::webapp` takes several, two on the same path would have
  panicked in the router merge; start and `--check` say which path instead.
- **The service worker no longer caches an app's own data** (Habits, 2026-11-02;
  `[fix-swcache-1]`): it cached any same-origin GET outside `/api`, `/login`
  and a few more, so `/data/*.json` answers lingered in browser storage and
  showed a stale snapshot offline (an item added offline later duplicated). It
  now caches an allow-list: navigations (request mode, destination or an HTML
  `Accept`) and assets (`/static/**`, `/pwa/**`, or an asset extension: js mjs
  css map woff2 ttf png svg ico jpg jpeg webp gif webmanifest). Everything
  else goes to the network untouched. A response with `Cache-Control: private`
  or an `application/json` type is never stored either.
- **`docs/KIT.md` lacked the knobs of `webapp` and `push`**: `chassis-cli`'s
  feature list stopped at `notify`, so a project built with them got no
  knob rows for them. Both are listed now, with what they imply
  (`[fix-cli-features-1]`).
- **Static files no longer count towards `max_in_flight`** (Habits,
  2026-11-01): a cold page that preloads its module graph (114 requests) got
  503 on about 60 of them, and a browser never fetches an ES module again
  after a 503, so the page stayed on its loading screen. GET and HEAD under
  `/static/` and for page assets (`.js`, `.css`, fonts, images, maps, the
  manifest) skip the cap; handlers still meet it.

- **The Issue dialog opens as a form again after an issue** (`dashboard`;
  merge of ux-chassis-5): with no reload after an issue, a second "Issue"
  showed the first receipt. The dialog now returns to its form when it closes.
  The danger band's heading on a client's page keeps a small gap to the
  column edge at 1280.
- **The PWA service worker no longer handles event streams** (`webapp`): a
  request asking for `text/event-stream` goes straight to the network. A
  live channel outside `/api` kept one connection open per page through the
  worker, and Firefox stopped loading pages after six.

## [4.1.0] - 2026-10-31

### Changed

- **kp-themes 12.1.0 vendored** (`scripts/vendor-kp-themes.sh 12.1.0`, 1215
  files checked against the release's SHA256SUMS). A minor: every new
  option is opt-in. The bundle now also exports the names that clashed
  between modules, under a module prefix (`progressbarSetProgress`,
  `PALETTE_OPEN_EVENT`, `DATATABLE_REORDER_EVENT`, …), and `js/log.js`
  (`sourceColour`, `sourceIndex`). The kit's own JavaScript uses none of the
  renamed names; Status, Clients and Storage measure clear in formal and
  dark at 1280 and 390.
- **Dependencies updated within their semver ranges** (`cargo update`: 72
  crates updated, 3 added, 1 removed; no advisory among them).

### Fixed

- **The 4.0.0 migration said "names unchanged" for the switch to the
  kp-themes bundle; that was not true for every name.** kp-themes 12.0.0's
  bundle lacked a few exports whose names collide between modules
  (`sourceColour`, `setProgress`, `OPEN_EVENT`). kp-themes 12.1.0 adds
  them under prefixed names (for example `progressbarSetProgress`,
  `PALETTE_OPEN_EVENT`); an app that imported one of the colliding names
  from a module path imports the prefixed name from the bundle instead.

## [4.0.0] - 2026-10-31

### Migration

4.0.0 carries everything 3.15.0 would have, plus kp-themes 12. Per project:

1. Both chassis lines in `Cargo.toml` (the kit and the `testing` one) move to
   `tag = "v4.0.0", version = "4.0.0"`.
2. **kp-themes 12 comes as one bundle** (see its MIGRATION.md). The kit's
   own JavaScript imports only `/static/kp/dist/kp-themes.min.js`, and static
   files are served gzip. Rewrite every import of `/static/kp/js/<x>.js` in
   the app to `/static/kp/dist/kp-themes.min.js` (names unchanged), in the
   same release as this bump: a page that mixes the module tree and the
   bundle loads every kp-themes singleton twice (listeners, auto-attach).
   One sed does it for `.js` and `.html` files:
   `sed -E 's#/static/kp/js/[A-Za-z0-9_/.-]+\.js#/static/kp/dist/kp-themes.min.js#g'`.
   A page that loads kp-themes' `js/auto.js` swaps that tag for
   `<script type="module" src="/static/kp/dist/kp-themes.min.js">`: the
   bundle boots exactly like auto.js, so never load both.
   Measured on Kitchen's front page: 451 requests and 2076 KB cold before,
   155 requests and 1831 KB after. The module tree is still served.
3. **A web app no longer attaches kp-themes effects itself.** The kit puts
   `/static/chassis/webapp-runtime.js` into every page of the web app. Remove
   your own `attachEffects(...)` call, or keep it and call
   `WebApp::without_kit_runtime()`; with both, effects attach twice.
4. **A web app at the root is installable (PWA) by default**: manifest,
   service worker and icons are served without a login. Put your own icons
   at `pwa/icon-192.png`, `pwa/icon-512.png` (and optionally
   `icon-maskable-512.png`, `icon-180.png`) in the web app's folder, or opt
   out with `WebApp::without_pwa()`.
5. **Notifications to kyu need a token**: set `<P>_NOTIFY_TOKEN` (a kyu
   client token, through latch) when `<P>_NOTIFY_URL` points at a kyu topic;
   without it every message gets 401 and goes to the fallback.
6. **kp-themes 12 changes an app's own markup may lean on** (its
   MIGRATION.md has the details): components are controller classes now
   (import from the bundle, as in point 2); `attachTypeConfirms` lives in
   `js/components/type-confirm.js` (same bundle export); a `data-kp-form`
   whose submit must reach the server as a plain POST needs
   `data-kp-form-native-submit` (or `nativeSubmit: true`), as the kit's
   login and logout already have; a failing element is reported with
   `reportError` instead of aborting the whole attach; the form grid aligns
   to the start edge and reserves the error line. The bundle attaches the
   page's components on load, so markup copied from the live page after
   that carries the attached marker and is skipped on a later attach (the
   kit's Storage table lost its loading state this way): keep a skeleton you
   clone in an inert `<template>`.
7. **A web app at the root registers its own pages** with
   `app.page(Page::new(id, title, path))`, or the kit's pages show only the
   kit's links (the start now warns about it).
8. **`ClientsFile::issue` is gone** (deprecated since 2.0.0): call
   `issue_with_fields(name, id, token, now, BTreeMap::new())` instead, which
   is what it did. No app in this workspace still calls it.
9. **Recognised through Traefik**: behind the home route add Traefik's
   address to `<P>_TRUSTED_PROXIES` (10.10.10.4) so `<P>_TRUSTED_ADMINS`
   also works on the hostname.

### Added

- **Every web app is installable** (`webapp`, feat-webapp-4): at the root,
  the kit serves `/manifest.webmanifest`, generated or own icons
  (`pwa/icon-*.png` in the app), `/sw.js` and an offline page without a
  login, links the manifest from the app's pages and the login page, and
  registers a network-first service worker from `webapp-runtime.js` that
  never serves a stale page and never stores `/api`, redirects, non-200 or
  opaque answers. `WebApp::pwa(Pwa::new().display(Display::Standalone)
  .theme_color(..)..)` tunes it; `WebApp::without_pwa()` opts out. Additive
  API: `Pwa`, `Display`, `WebApp::pwa`, `WebApp::without_pwa`.

- **The web app gets the kp-themes runtime without asking** (`webapp`,
  feat-webapp-3): the file server adds `static/chassis/webapp-runtime.js`
  (kp-themes' effects and the remembered-choice store, once per page) to
  every HTML page it serves, so no app can forget `attachEffects` (Medicine
  Cabinet's dark-theme glow did not follow the mouse). `ETag` covers the
  injected bytes; `WebApp::without_kit_runtime()` opts out. `boot-kit.js`
  shares its effects code through `kit-effects.js`.
- **A warning at start when a web app at the root registers none of its
  pages** (`dashboard`, feat-pages-2): the kit's pages then show only the
  kit's links in their bar (seen in Medicine Cabinet). The line names the
  remedy: `app.page(...)` for each area, or `app.kit_pages_in_webapp()`.

- **One shared notification sender and a Notifications card on the Status
  page** (Kenny, 2026-10-30; docs/NOTIFY_DESIGN.md). Knobs `notify_url`
  (primary target, a kyu topic), `notify_fallback_url` and `notify_outbox_max`
  (5000); `App::notify_targets` gives an app's default. Messages are kept in
  the kit database (`kit_outbox`, kit schema step 2) until a target accepts
  them, the fallback is asked once when the primary does not take a message,
  and the last error is recorded. The card shows both addresses (locked with
  the reason when configuration fixes them, same precedence as the Storage
  budget), the messages waiting, the last error and a Test button. API:
  `/api/kit/notify`. `[[notify.webhook]]` keeps working and claims its
  events. A build older than 3.15.0 refuses a kit file at schema 2.
- **`notify_token` knob** (secret, environment `<P>_NOTIFY_TOKEN`, no flag,
  refused in the config file): the sender adds `Authorization: Bearer
  <token>` to requests to the primary target (and the Test button's), which
  the real kyu requires; the fallback never gets it. A token that is shorter
  than 16 or longer than 512 characters, or holds whitespace, a control or a
  non-ASCII character, refuses the start. A 401/403 from the primary records
  a last error naming the missing or wrong token. The card shows only
  "Token: set" / "Token: not set"; the value is masked everywhere.
- **kyu damping**: `Notifier::emit_keyed` with `core::notify_target::Dedup`
  sends `Kyu-Dedup-Key` / `Kyu-Dedup-Window`, stored with the outbox row; a
  `Kyu-Duplicate: true` answer counts as delivered.

- **`chassis release` for a multi-binary workspace** (CLI only,
  homelab-shared-4): an optional `[release]` table in `.chassis.toml` with
  `binaries`, `build = "glibc"` (+ `glibc_image`), `sign`, `notes`, and
  `[release.hooks]` `pre_gate` / `post_gate` / `tag_notes` (an annotated tag).
  A workspace root's `[workspace.package]` version is bumped when there is no
  `[package]`. Every key defaults to the old behaviour; documented in
  scaffold/README.md. The logic sits in `manifest_version.rs`,
  `release_config.rs` and `release_hooks.rs`.
- **`shell::release_verify`** (feature `self-update`, homelab-shared-3):
  `verify_release_asset(sums, minisig, pubkey, asset, bytes)` verifies a
  downloaded release without an `Updater`: signature over `SHA256SUMS` first,
  then the asset against it; `verify_release_asset_for` also binds the
  signature's trusted comment to a repo and version. Errors are the typed
  `ReleaseError` (`NotSigned`, `Signature`, `NotListed`, `HashMismatch`,
  `WrongRelease`), each with a remedy, convertible to `Error`.
  `Updater::verify_manifest` shares the trusted-comment check.
- **`shell::install_binary`** (feature `self-update`, homelab-shared-2):
  `install_binary(path, bytes)` installs a binary at any path atomically,
  keeping the old one as `<path>.prev`, keeping its mode and fsyncing;
  `rollback_binary(path)` restores `.prev`; `prev_path(path)`. `Updater` now
  calls the same code (one implementation); its behaviour is unchanged except
  that the new binary takes the old one's mode instead of always 0755.
- **Client scopes** (`core::clients`, homelab-shared-1): `SCOPE_FIELD`,
  `Client::scope()`, `Client::has_scope_in()` and `ClientsFile::issue_scoped()`.
  A scope is the ordinary declared client field `scope`, so it is stored,
  sealed and listed like any other field and needs no store migration; a client
  without one is allowed nothing. The meaning of a scope stays the project's.
  Not added: hashed tokens (the kit keeps the token revealable on purpose, K12)
  and a failed-auth counter. See docs/HOMELAB_SHARED.md.

### Changed

- **kp-themes 12.0.0 vendored** (`scripts/vendor-kp-themes.sh 12.0.0`, every
  file checked against the release's SHA256SUMS: 1212 files, the module
  tree, the self-contained `dist/kp-themes.min.js` and its source map). The
  kit's own JavaScript imports only the bundle, so a kit page loads one
  kp-themes file instead of a module tree; static and web-app responses are
  served gzip (`tower-http` compression) for clients that accept it.

- **The kit's source is split by responsibility** (Kenny's engineering
  rules, 2026-10-30): 64 own files over 250 lines became small modules, among
  them `app.rs` (3916 lines), `chassis.js` (3129 lines, now ES modules under
  `static/chassis/`, page state in one context object per page),
  `chassis.css` (an entry that `@import`s its parts in the old order) and the
  CLI's `main.rs`. Nothing a service calls moved: the API contract reads the
  same, and a page serves the same DOM and requests (measured in Firefox).
  The kit's asset hash changes once, so browsers fetch the files again.
- **The embedded asset tables are generated** (feature `assets`): a
  `build.rs` builds `ASSETS` and `WEBAPP_KP_ASSETS` from `static/` with the
  same rules as the hand-kept list (an unknown extension stops the build), and
  a test checks that every servable file is embedded exactly once.
- **The API snapshot files a public method under its type** (CLI tooling,
  `api_snapshot`): an `impl` block may sit in a child module of the module
  that declares the type. Types, functions and constants still keep their
  declaration path.
- **The release gate builds every feature set a consumer can pick**
  (`scripts/release-kit.sh`), not only all features at once.

- **Trusted admins are recognised through a trusted proxy** (`dashboard`;
  Kenny, 2026-10-30, route "thuis lokaal houden"): `<P>_TRUSTED_ADMINS`
  now matches the client address the guards already use, the TCP peer or,
  behind a proxy in `trusted_proxies`, the last `X-Forwarded-For` hop that
  proxy appended. So the PC is recognised through a hostname that the home
  network sends to Traefik. An earlier hop a client wrote itself, and the
  header from any other peer, are ignored. Nothing changes for a service
  without `trusted_admins` or without `trusted_proxies`.

### Fixed

- **`bigshouldersdisplay-variable.woff2` is served** (feature `assets`):
  `kp/css/fonts.css` asks for it and `KP_THEMES.sha256` lists it, but the
  hand-kept table never embedded it, so it answered 404.

- **"updated … ago" counts on again on the Storage and Clients pages**
  (`dashboard`; Kenny, 2026-10-30, seen on almanac and kyu): the refresh
  control's line stayed at "updated 0 s ago" because those pages never
  attached kp-themes' freshness ticker (the status page did). Locked by
  `the_refresh_line_ticks_on_storage_and_clients`.
- **"Pending writes" shows what is really pending** (`storage`): SQLite folds
  its write-ahead log into the database by itself but keeps the file at its
  largest size, so the Storage page showed about 4 MB beside a 40 KB kit file
  (measured on kyu and almanac). The ten-minute storage check now folds each
  log in and trims it to nothing (a busy log waits for the next round), and
  every connection sets `journal_size_limit` to 1 MB. Locked by
  `a_checkpoint_empties_the_log_and_the_log_has_a_limit`.

## [3.14.0] - 2026-10-30

### Changed

- **kp-themes 11.3.0 vendored** (verified against the release SHA256SUMS; 213
  vendored files, new module `sequencer`, the editable timeline). What a
  consumer's own pages notice: **a valid `data-kp-form` is no longer
  submitted by the browser**; the package fires `kp-form-valid` and stops the
  submit. A form whose `action` does the work (a plain POST) must say
  `data-kp-form-native-submit` (or pass `nativeSubmit: true`), or it silently
  stops sending. Also: form-grid descriptions, ledes and progress rows fill
  their column; a gantt keeps its minimum width and scrolls on a phone;
  charts attach lazily from 12 on a page; the refresh chooser's menu can be
  picked again (its items are `menuitemradio`, which the menu button now
  answers).

### Fixed

- **The Storage page refreshes every 5 minutes by default** (Kenny,
  2026-10-24), and "Every 5 min" is one of its choices. A choice already made
  in the browser stays.
- **tokio 1.54.1** for RUSTSEC-2026-0386 (`AsyncFd::new` and related
  constructors violated I/O safety).
- **The kit's login and logout keep their plain POST under kp-themes
  11.3.0**: both forms say `data-kp-form-native-submit`. Without it the
  login stayed on /login after a valid token (measured in Firefox before the
  fix). Locked by `login_and_logout_keep_their_native_post`.

## [3.13.0] - 2026-10-22

### Added

- **Trusted admins: `<P>_TRUSTED_ADMINS`** (`dashboard`; Kenny, 2026-10-22:
  "mijn pc heeft altijd toegang, zonder token"): exact IP addresses whose
  requests are the admin without a login. Only the TCP peer counts, never a
  forwarded header, so nothing through a proxy gets in this way; a bearer, when
  sent, still decides; `GET /login` from such a machine goes to `/`. A range,
  `0.0.0.0` / `::` and an address that is also a trusted proxy refuse to
  start, and a set list is a `--check` and start-log warning. Default empty:
  nothing changes until a service sets it. Additive. See CONFIGURATION.md
  "Trusted admins".

### Fixed

- **A browser choice made just before a reload is no longer lost**
  (`dashboard`, homelab, found adopting 3.12.0): a reload asked for the next
  page before `pagehide` sent the write, so the page came back with the
  database's older value and overwrote the newer choice. `prefs-boot.js` now
  keeps every write the server has not confirmed in
  `localStorage["chassis-prefs:pending"]` (per login), and a confirmed one for
  30 s more, because the next page may have been rendered before the server
  stored it (measured in Firefox); on the next page such a write wins over
  the database and is sent again, and `beforeunload` sends at once too. The workaround `window.chassisPrefs.flush()` before a reload is
  no longer needed. No change for a consumer.

## [3.12.0] - 2026-10-21

### Added

- **`App::sync_browser_keys` and the preferences API** (`dashboard`): the
  service declares which `localStorage` keys sync (`BrowserKeys`: exact keys
  and prefixes, minus exceptions, plus `session_exact` / `session_prefix`
  for the one case of a tab's `sessionStorage` that may sync, kp-themes'
  unsaved-changes draft), and the kit serves `GET /api/kit/prefs?prefix=`,
  `PUT /api/kit/prefs/{key}` and `DELETE /api/kit/prefs/{key}` behind the
  admin login and the same-origin rule, scoped to the login identity. The
  kit never syncs a key it was not told to; a declaration that names a
  secret is a start error and `--check` failure; keys are only refused when unusable
  (empty, over 256 bytes, a control character, `.` or `..`; any other name
  works); a value over `prefs_max_value_bytes` (16384), a scope over
  `prefs_max_scope_bytes` (262144) or `prefs_max_keys` (512) is refused with
  a sentence; a PEM block, a JWT, a bearer credential, the service's own
  login token and a form draft with a secret-named field are refused as
  values. `App::prefs_store` takes an adapter of the project's own. New
  knobs `prefs_max_value_bytes`, `prefs_max_scope_bytes`, `prefs_max_keys`.
  **Never declare a secret.** Additive.

- **A Preferences kind on the Storage page** (`dashboard`): the kit registers
  it itself for the `chassis_prefs` table whenever a service declares synced
  keys, so the page lists the rows and bytes of the preferences and a targeted
  delete (older than, key contains, login scope contains) goes through the
  existing preview and typed confirmation. The samples show key, scope and
  size and when it was last updated (as a date), never the value. Nothing is
  cleaned up on its own. The kind id `preferences` is now taken. Additive.
  On a phone the sample cards wrap a long value instead of cutting it.

- **The browser side of the preferences: `prefs-boot.js`** (`dashboard`): the
  server renders the login's values into every signed-in HTML page (the
  kit's pages, project pages and a `webapp` index, with no change to the
  project's HTML) as a JSON block after `<head>` plus a classic script that
  runs before any module, so there is no request and no flash. The script
  applies the database to `localStorage` for the declared keys, seeds the
  declared `sessionStorage` draft keys (kp-themes' unsaved bar), writes
  declared `localStorage` changes through to the database (a wrap of
  `Storage.prototype` for `localStorage` and declared keys only, which
  catches `data-kp-remember` without touching kp-themes; the composite
  store is also handed to `configureRemember` in `chassis.js`), mirrors the
  draft from kp-themes' `kp-unsaved-*` events, and re-reads when the page
  becomes visible again (`chassis-prefs-change`). The pre-login theme and
  every undeclared or per-tab key stay in the browser. A conditional request
  for such a page is answered in full. `window.chassisPrefs` is the explicit
  API. Additive; first node tests of the kit's own JavaScript
  (`tests/js`).

- **The preference port and its adapters** (`storage`): `PrefStore`, a
  trait for user preferences (get, set, remove, list by prefix, async-
  friendly, every call scoped), with `SqlitePrefStore` (the new table
  `chassis_prefs` in the APP database, created when it opens, never in the
  kit file) and `MemoryPrefStore` for tests. The scope is a value the port
  takes on every call: the login identity (`ADMIN_SCOPE`, `"admin"`, for
  the dashboard's one admin whatever the device or passkey), so a future
  multi-user kit passes another one. `Quota` is checked inside the store's
  own write. Another database later is one more adapter. The decision and
  what is and is not behind a port: `docs/ARCHITECTURE_DECISIONS.md` arch-22.
  Additive.

- **Three homelab gaps from adopting 3.11.0** (`storage`; gaps 139, 140, 141
  of the homelab's list). All additive.
  - A project can unit-test what it hangs on `App::on_storage_warn`:
    `StorageReport::new`, `FileReport::new` and `FileSizes::new` build a
    report by hand, and `AppDb::prune_finished_at(&Now)` is public, so a
    `finished_by_definition` rule runs at a chosen instant instead of the
    real clock.
  - An import reports per store: `ImportReport::from_stores(vec![
    ImportStore::new("sessions", expected, imported).moved(files), ..])`.
    Each store's count is checked on its own and a mismatch names the store
    in the rollback message; only the files of stores marked `moved` are
    renamed `*.migrated`, so a store that is copied but still runs on its
    JSON file is never renamed from under the running code. The rename is
    also a step of its own: `storage::mark_migrated(&files)`, for a project
    that moves a store in a later release. `ImportReport::new` is unchanged.
  - A `DataKind` over a `WITHOUT ROWID` table works: its samples are ordered
    by the time column and then by the primary key (an ordinary table still
    by `rowid`), and the ordering is proven at registration with a dry run
    of the very query, so a kind that cannot be previewed is a start error,
    not a failure at the first click.

## [3.11.0] - 2026-10-21

### Added

- **`chassis::storage`, a sqlite layer behind the new `storage` feature**
  (on by default; `dashboard` implies it; rusqlite 0.40.2 `bundled`, the
  version kyu uses): `Db` with one write connection and two read-only
  connections, WAL, `synchronous=FULL`, `busy_timeout=5000`,
  `foreign_keys=ON`, an async `read` / `write` API under `spawn_blocking`
  (a write is `BEGIN IMMEDIATE` and holds a backup `WriteTicket`), numbered
  migrations that each run atomically with the `user_version` bump, a
  database newer than the binary refused with a restore remedy,
  `Db::open_in_memory` for tests and `Db::inspect` for `--check`. Additive.

- **The backup pause settles sqlite files** (`storage`): after the write
  tickets drained, the pause runs `wal_checkpoint(TRUNCATE)` on every
  registered database (`chassis::storage::pause_hook`); a checkpoint that
  stays busy past the 5 s timeout refuses the in-process pause, so
  `backup-pause` falls back to stopping the unit as before. New
  `App::backup_db(&Db)` registers a database the project opened itself; its
  directory joins the paths `backup-pause` lists when it lies outside the
  state root. The pre-update state copy snapshots every sqlite file with
  `VACUUM INTO` (`Db::vacuum_into`, `chassis::storage::copy_db_files`),
  replacing a raw copy of a live file. Additive.

- **`App::app_db`, the app's own database, with kinds, a budget and an
  import** (`storage`): `<state_dir>/<name>.db`, opened at start (`--check`
  and `--version` create nothing; `--check` inspects it read-only and refuses
  one written by a newer build). `AppDbSpec { migrations, import }`; the
  import hook runs once, after the migrations, in ONE transaction: an error
  or a count that does not match rolls everything back, the service keeps
  running on its old files (`AppDb::import_state`), a status-page problem is
  raised and the next start retries; on success the marker commits with the
  data and the old files are renamed `*.migrated`. `App::storage_kind(DataKind)`
  declares a kind of data (table, time column in seconds, milliseconds or
  RFC 3339, filters of choice, flag and text, `finished_by_definition`, or
  `KindOps` for a kind that is not one table); declarations are checked
  against the schema at start. Only rows finished by their own definition are
  removed on their own: daily, per declared kind, logged with a count.
  Budget: default 50 MB, warn at 40 (`<P>_STORAGE_BUDGET_MB`,
  `<P>_STORAGE_WARN_MB`, or `App::storage_budget`; the environment wins),
  size = `page_count * page_size` plus the log, checked at start, every ten
  minutes and after Storage actions; past the warn line a status-page problem
  appears, `/metrics` carries `<prefix>_storage_bytes{file}`, `_budget_bytes`,
  `_warn_bytes` and `_level`, and `App::on_storage_warn` runs once. It warns
  only: no write is ever refused for size. Two knobs (`storage_budget_mb`,
  `storage_warn_mb`, feature `storage`); `chassis-cli` lists `storage` among
  the kit features, implied by `dashboard` and by the default features.
  `TestApp::try_start_with_env` returns the kit's refusal instead of
  panicking. The new value types are `#[non_exhaustive]` so they can grow in
  a minor; they are built with `AppDbSpec::new(migrations).with_import(hook)`,
  `ImportReport::new(expected, imported, files)` and
  `Selector::all().older_than(secs).with_filter(name, value)`. Additive.

- **The budget can be changed on the Storage page** (`storage`; Kenny,
  2026-10-21 17:34): the Space used card gets a budget and a warn line
  (whole MB, ids `storage-budget-mb`, `storage-warn-mb`), Save
  (`storage-budget-save`) and Reset to default (`storage-budget-reset`),
  with the figure, the bar's warn mark and the words under the fields
  following the draft live. New `POST /api/kit/storage/budget`
  (`{budget_mb?, warn_mb?}` or `{reset: true}`; budget 1 to 100 000 MB, warn
  line below it; a plain-language 400 otherwise; one audit line) keeps the
  setting in `chassis_meta` of the app file and checks the budget again at
  once. Precedence: `<P>_STORAGE_BUDGET_MB` / `_WARN_MB` (or flag, or file)
  over the page setting over `App::storage_budget` over the default; a value
  the configuration fixes is shown as fixed, with the reason, and refused by
  the API; Reset removes the stored setting. `GET /api/kit/storage` gains
  `budget.setting`. New `Storage::set_budget`, `Storage::setting` and the
  `#[non_exhaustive]` `storage::Fixed`. Additive.

- **The kit's clients, sessions and passkeys move into `<name>-kit.db`**
  (`dashboard`, which implies `storage`; Kenny, 2026-10-21): one table each,
  the secrets sealed FIELD BY FIELD with the same crypto and the same
  `<P>_SECRET_KEY` (a client's token and field values, a passkey's
  credential), ids, names, timestamps and the SHA-256 of a session cookie in
  plain columns. The first start imports `clients.json.enc`,
  `sessions.json.enc` (`sessions.open.json.enc` for an open run) and
  `passkeys.json.enc` in ONE transaction and verifies the counts; a failure
  writes nothing, renames nothing, raises a status-page problem and the kit
  keeps running on the old files until the next start retries; a success
  renames them `*.json.enc.migrated` (still sealed: they keep working as a
  backup) and a marker per source makes it idempotent, so a restored old
  file is never read again. `<name> rekey` also re-seals the database fields,
  in one transaction. Expired sessions are the only rows the kit removes from
  this file, daily, logged with a count. Nothing in the Storage layer can
  reach this file: no kind, no delete, no compact. `EncryptedFile`,
  `rekey_dir`, `ClientStore`, `FileClientStore` and every other public item
  are unchanged; a project's own `ClientStore` (kyu's) is still used as given.
  The data moves, the API does not. Additive.

- **The Storage page's JSON API, `/api/kit/storage`** (`dashboard`): `GET`
  returns the budget (bytes, warn line, level, percent), both files with
  their write-ahead log and reclaimable bytes (the kit's marked
  `cleanable: false`), the app import state and one row per declared kind
  (rows, estimated bytes, oldest, newest, declared filters). `POST
  /api/kit/storage/{kind}/preview` is read-only (count, bytes, oldest, newest,
  five samples) and returns a token that binds the selection, the instant and
  the count; `POST /api/kit/storage/{kind}/delete` needs that token, the
  selection again and the kind's name typed as the confirmation, recounts
  inside the transaction and refuses when the count moved, deletes in ONE
  transaction, writes one audit line and rechecks the budget. `POST
  /api/kit/storage/compact/preview` and `/compact` vacuum the app file only
  and answer 503 with `Retry-After` while a backup pause holds the state.
  Admin login and the same-origin rule apply like for the other kit POSTs.
  The kit file is never deletable or compactable through any route (a test
  holds that). Additive.

- **The Storage page, `/storage`** (`dashboard`; Kenny approved the demo
  `research/chassis-storage` of kp-themes 21/10/2026, the kinds as a table,
  the kind's name typed to confirm): a kit page in the registry beside Status,
  Clients and Passkeys (order 1030; the bar, the palette with the chord
  `g o`, the tab bar and the phone's More drawer list it; `App::disable_kit_page("storage")`
  removes the page and its API; `/storage` is reserved against a web app's
  mount). **Space used** is the budget against the three parts (application
  data, sign-in data marked read-only, pending writes) with a share bar and a
  warning band that says what, why and what now; **Give back empty space** is
  the compact card; **What is stored** is the kinds as a sortable table with
  amount, size, share of the budget, oldest and newest and a `Clean up…` per
  kind. Clean up is a dialog in two steps (choose and read-only preview, then
  the kind's NAME typed), compact a dialog of its own; every card and the
  table have the package's loading, empty and failed states. Sizes are
  decimal and human, counts exact, dates dd/mm/yyyy HH:mm. Stable control ids
  for the homelab Live view are listed in docs/DASHBOARD.md. The page's
  kp-themes workarounds (gaps 11 to 14 and 18 of `~/Projects/kp-gaps/chassis-rs.md`)
  stand in one block of `chassis.css` that says when to delete it. Additive.

- **`Page::hint` and `DataKind::unit`**: a page says in one line what it is for
  (the palette and the More drawer print it; the kit's four pages carry one and
  `/api/kit/pages` returns it, so the drawer no longer keeps a list of its own in
  the layout); a kind names what its rows are called (`.unit("cells")`, default
  `rows`) and the overview returns it. The preview also returns `columns` and
  `time_column` and shows the time column as an RFC 3339 string, and the
  overview returns `last_compacted_at` (kept in the app file). Additive.

### Changed (unreleased 3.11.0 only)

- **The typed confirmation of a delete is the kind's name as the page shows it**
  (its label: "Delivery log"), not its id: `confirm_with` and the delete's
  `confirm` are the label, and the id is refused. This is what the approved
  demo showed; nothing released depended on the id.
- **A megabyte of the budget is 1 000 000 bytes**, as in every size the page
  writes, so a budget of 50 MB reads "50.0 MB" and not "52.4 MB"
  (`<P>_STORAGE_BUDGET_MB`, `<P>_STORAGE_WARN_MB`, `App::storage_budget`).

### Documentation

- **docs/ARCHITECTURE_DECISIONS.md arch-21 "SQLite, two files"** amends AR5;
  **docs/DASHBOARD.md** documents the Storage JSON API; **docs/MIGRATION.md**
  says what moves at the first start of 3.11.0, what does not, that a
  downgrade is a restore of the pre-update copy, and how to adopt
  `App::app_db`; docs/OPERATIONS.md and docs/CONFIGURATION.md name the new
  files and what `rekey` now re-seals.

## [3.10.0] - 2026-10-21

### Security

- **webpki-roots 1.0.9 → 1.0.10** in the kit's own lock file: cargo-deny
  refused the release on RUSTSEC-2026-0381 (1.0.9 still trusts the emSign
  ECC Root CA - G3, whose distrusted intermediates' private keys are now
  known). A consumer runs `cargo update -p webpki-roots` in its own lock file.
- **rustls-webpki 0.103.15 → 0.103.16** in the kit's own lock file: the same
  distrusted emSign intermediates, on the verification side
  (RUSTSEC-2026-0382). A consumer runs `cargo update -p rustls-webpki`.

### Added

- **The copy-paste command names its token after the vocabulary** (kit-r4,
  Kenny 2026-10-21): with `vocabulary("source", "sources")` the "Use it"
  command, the issue dialog's first command and the API's `command_template`
  say `$SOURCE_TOKEN`; the default stays `$CLIENT_TOKEN`. One new method,
  `Vocabulary::token_var()`, derives it (upper-cased, other characters `_`,
  `KIT_` before a digit); `GET /api/kit/clients` also reports it as
  `token_var`. Additive.

- **`App::vocabulary_article` and `chassis::article_for`** (kit-r4, kyu gap
  53): the kit now writes the right article before the vocabulary's word
  ("What an app is", "Issue an app", "a source") by the word's vowel sound;
  a service whose word the rule gets wrong sets it with
  `vocabulary_article("an")`. Templates read `vocab_article` and
  `vocab_article_cap`; the palette reads `data-chassis-article`. Additive.

- **A status section can keep its own card state** (kit-r4, almanac +
  http-switchboard gap 38): `data-chassis-owned` on the section's card stops
  chassis.js from setting it back to ready/empty/loading on each poll and
  re-read, and the cancelable `chassis-settle` event (`detail { card, state,
  source }`) lets a section veto one change. Documented in docs/DASHBOARD.md.

### Fixed

- **A status section's own refresh bar keeps the package's form-grid tracks**
  (kit-r4, http-switchboard gap 39): the kit's `.kp-refresh__bar` rules in
  chassis.css were unlayered and scoped to the whole status page, so they beat
  the package's subgrid rules and stacked a section's bar in one column. They
  now reach only the kit's own header bar (`.chassis-status__fresh`).
- **A status section whose body is html only no longer renders an empty
  `dl[data-chassis-rows]`** (kit-r4, almanac): an empty rows list draws
  nothing, on the first paint and on the live redraw; rows that arrive later
  are drawn then.

### Changed

- **kp-themes 11.2.0 vendored** (verified against the release SHA256SUMS; 212
  vendored files, 31 changed; new modules `code-field`, `job-line`,
  `markdown`, `page-contents`, `quiet-hours`). What a consumer's own pages
  notice: a data table's header press now cycles ascending, descending,
  unsorted (`sortCycle: 'two'` keeps the old two-step cycle); a secret field
  clears the clipboard 30 s after a copy (`data-kp-secret-clear`, `0`/`off`
  disables); chart `timeUnit` takes ms/s/min/h/d/w; the network graph gains
  its full option set; `data-kp-subgrid="rows"` on attention/problems.

## [3.9.0] - 2026-10-19

### Changed

- **kp-themes 11.1.1 vendored** (verified against the release SHA256SUMS;
  four new modules: `diff`, `feed`, `live-options`, `logviewer`). Every data
  component has one loading look per kind, the form grid (`.kp-formgrid`),
  the page-header and QR grid fixes and the passkey list's confirm fix come
  from the package; the kit's temporary copies of them are gone. No consumer
  action (kp-themes 11.1.x is a minor without a migration section; 11.1.1 counts a menu button as a page header's second action).
- **The passkeys page is the approved kp-themes 11 composition** (kit-kp11):
  one card of ways to sign in (this-device badge from `current`, rename in
  place through `PATCH /api/passkeys/{id}`, an unused flag, removal behind a
  confirm dialog), a code and three steps to register another device, and a
  not-on-HTTPS alert in plain words. Register and login buttons are kp flash
  buttons that show the browser's refusal as one sentence.
- **The login page is the approved kp-themes 11 composition** (kit-kp11): the
  intro and the service's health, version and age on the left (read from the
  open `/healthz`), the card on the right with "Log in with a passkey" as the
  one primary button, "or with the token", Show/Hide on the token field, a
  switch for keep-signed-in and a three-part alert (what, why, what now) for
  a wrong token. The Log in button keeps its width while it works.
- **Every kp-themes module is served under `dashboard`**, no longer only with
  `webapp` (kyu, gap 30): a status section or page a service adds under
  `dashboard` alone loaded `/static/kp/js/datatable.js` or another module and
  got a 404. The kit's pages on kp-themes 11 use these modules themselves, so
  the set follows the pages; `webapp` keeps meaning a project's own browser
  app. A build without `dashboard` (kyu-runner) is unchanged.
- **The client dialogs are the approved kp-themes 11 compositions, round 3**
  (kit-kp11): the issue fields are rows of one `.kp-formgrid` and fill their
  cell; the manage dialog is identity and three figures, a rail with the token
  (`.kp-secret`, asked of the service only when shown or copied), the command
  with `$CLIENT_TOKEN` (`.kp-command`) and the project's actions, the Test it
  card (a JSON field and Send test on one form-grid row), the request
  inspector (`.kp-inspector`, replacing the hand-built log) and a danger band
  of three equal cells with a typed confirmation on Delete. The list has its
  own empty, loading and failed states, and the walk-through's wait step its
  failed state. `POST /api/clients/{id}/test` takes an optional
  `{"body": "…"}` (at most 64 KiB); without it the route's own body is sent.

### Added

- **`chassis release` reruns only the tests that failed last time** (kit-kp11;
  Almanac's wish, backing the rule "never rerun green tests"). A red nextest
  step writes the failed tests, the tree they ran on and the time to
  `.chassis/release-failed.json` (the scaffold's `.gitignore` now lists
  `/.chassis/`). The next release reruns just those tests when the change
  since that tree touches no `Cargo.toml`, `Cargo.lock`, build script,
  toolchain or cargo config and stays inside crates that had a failing test;
  it prints one line saying what was skipped and why, runs the doctests as
  before, and deletes the record once the release is published. Any other
  change runs the whole suite and says why. `--full-tests` forces the whole
  suite. The measured duration of the test step is printed either way.
- **The status page as an operations page** (kit-kp11, approved demo
  `research/chassis-kit-status` in kp-themes). A `.kp-ops` frame: header with
  a remembered refresh control and "updated N s ago", four key figures
  (health with a meter, running version with a version chip when a newer
  release is known, up for, and a tile linked to the clients list), an
  attention band built from `Problem` (what, why, what now, and a Copy button
  when the remedy quotes a command in backticks), cards for service facts
  (copyable address), health rows with Retry that re-poll `/api/kit/status`,
  the update card in plain words, and an availability strip of the last 48
  hours. The history is bounded and in memory (sampled every five minutes and
  on every poll): a restart empties it. `POST /api/kit/status/update-check`
  does one read-only look at the release host for the "Check for updates"
  button. `/api/kit/status` gains `up_for`, `parts`, `update_facts`,
  `uptime`, `clients`, `repository_url`, per problem a `key`, `severity` and
  `command`, and per section `body`, `parts`, `span`, `slug` and
  `flash_actions`. `layout.html` is untouched.
- **Status sections as data** (kit-kp11). `StatusSection::body()` returns a
  `SectionBody` (`Rows`, `Table { columns, rows, key }`, `Kpis`, `Checks`,
  `Json { url, render }`, `Many`); `Section::html` stays the escape hatch and
  `Section` is unchanged, so struct literals keep compiling. A table sorts,
  searches and remembers; a `Json` card reads its own address and shows
  loading, empty and failed with Try again; the cards of one row always add
  up to twelve columns. New public items: `SectionBody`, `JsonRender`, `Kpi`,
  `KpiTone`, `Check`, `CheckState`.
- **Section buttons that keep the page** (kit-kp11).
  `StatusSection::flash_actions()` returns `FlashAction`s: a spinner, a short
  word and a success toast carrying the count the route answered
  (`{"count": 12}` becomes "Retried 12 entries"); `destructive(confirm)` keeps
  the confirmation dialog. A type of its own because `SectionAction` is an
  open struct services build as a literal; it keeps its reload.

- **A kit toast region and a page-ready signal** (kit-kp11). `layout.html`
  carries one empty `<div id="chassis-toasts" class="kp-toasts"
  aria-live="polite">` on every page. After chassis.js has attached its kp
  modules (theme picker, contracts, confirmations, effects, skip links) it
  fires `chassis:ready` on `document` and resolves `window.chassis.ready`,
  so an app attaches its own kp modules after the kit without
  double-attaching the theme picker. docs/DASHBOARD.md lists what the kit
  attaches itself. No Rust API change.
- **Status sections declare their module script and stylesheet** (kit-kp11).
  `StatusSection::assets()` (a default method) returns a `SectionAssets`
  (`module_script(path)`, `stylesheet(path)`); the kit renders the tags once
  in the status page's `<head>`, even when several sections name the same
  file, and `/api/kit/status` carries them as `section_assets`. Paths must be
  same-origin and absolute (the CSP is `script-src 'self'`); anything else
  is dropped and logged. Documented in docs/DASHBOARD.md. Public surface:
  `SectionAssets`, `StatusSection::assets`.
- **Passkeys: `current` flag and rename** (kit-kp11). `/api/kit/passkeys` and
  `GET /api/passkeys` carry `current: true` on the passkey this session logged
  in with (the dashboard remembers, in memory, which stored passkey opened
  each session; a token login has none, and a restart forgets it until the
  next passkey login, so every row is `false` until then).
  `PATCH /api/passkeys/{id}` and `PATCH /api/kit/passkeys/{id}` take
  `{ "name": "…" }`, trim it, accept 1 to 64 characters, and answer the
  updated passkey; same admin session and CSRF guard as the delete. Public
  surface (additive): `PasskeyListing` (`PasskeyView` plus `current`),
  `PasskeyState::list_for` and `list_for_request`, `passkeys::list_current`,
  `rename`, `RenameBody`, `clean_name`, `MAX_NAME_CHARS`.

## [3.8.0] - 2026-10-19

### Changed

- **kp-themes 11.0.0 vendored** (verified against the release SHA256SUMS; the
  component rounds kpadopt4 to kpadopt6 add eighty-seven framework-free
  modules under `js/` (tabbar, toolbar, timer, undo-toast, qr, …), all
  embedded with the `webapp` feature, and the Barlow, Barlow Condensed and
  Inter font families, named by no remaining theme, leave the embedded
  assets). **Four themes are gone: `terminal`, `phantom`, `light` and
  `grotesk`** (Kenny's decision in kp-themes; twelve remain: formal, dark,
  cyberpunk, synthwave, pastel, forest, blueprint, solstice, brutalism, deco,
  nostromo and titanium). A viewer whose stored choice was one of them
  is mapped once in `static/theme-boot.js` to the nearest remaining theme
  (`terminal` to `nostromo`, `phantom` to `dark`, `grotesk` to `brutalism`,
  `light` and the earlier `shade-light` to `formal`) and sees it in the
  picker; nothing in the kit named them otherwise. A web app of a consumer
  that writes one of the four names itself (`applyTheme('light')`,
  `data-theme="light"`, a `light` default) falls back to `formal` and has to
  change it, and `setTabbarBadge(tab, count)` no longer takes a `max`
  option: it no longer caps at `99+`.

## [3.7.1] - 2026-10-15

### Security

- **rustls 0.23.45 → 0.23.46** in the kit's own lock file: cargo-deny
  refused the release on RUSTSEC-2026-0346 to -0349 (TLS secrets in a
  `Debug` impl, ECH data leak, a 1 GiB brotli allocation before
  authentication, a key-exchange downgrade). A consumer runs
  `cargo update -p rustls` in its own lock file.

### Changed

- **kp-themes 10.1.1 vendored** (10.1.0 plus its two CSS fixes: a comment in the brutalism register that closed early, and 21 empty entries in a cyberpunk `:is()` list; verified against the release SHA256SUMS;
  `js/loading-pieces.js` joins the `webapp` asset set; the Atkinson
  Hyperlegible and Pixelify Sans fonts, no longer in the release and named
  by no stylesheet, are dropped). What a web app notices: the date picker
  writes dd/mm/yyyy by default (`data-kp-date-format="locale"` opts back),
  key-figure labels wrap instead of ending in an ellipsis, the sidenav opens
  from its edge tab when the page has one (`data-kp-sidenav-opener=
  "launcher"` or `"both"` for the old look), and menus gain
  `--kp-menu-anchor-x` and `--kp-menu-count`. **Three themes are gone:
  `high-contrast`, `sepia` and `retro`** (Kenny's decision in kp-themes); a
  viewer whose stored choice was one of them no longer finds it in the
  picker.

## [3.7.0] - 2026-10-08

### Changed

- **kp-themes 10.0.0 vendored** (verified against the release SHA256SUMS):
  every theme's decided character grammar, the dashboard components
  (calendar, graph, menu button, tiles, freshness, tour, update modules,
  embedded with the `webapp` feature), and nineteen themes: kp-themes
  removed `lapis`, `shade-light` and `shade-dark`. A stored choice of one of
  them falls back as kp-themes' MIGRATION.md suggests (`lapis` and
  `shade-dark` to `dark`, `shade-light` to `light`, in
  `static/theme-boot.js`), and the four font families only they used
  (Markazi Text, Source Sans 3, Source Serif 4, Vazirmatn) leave the
  embedded assets.

## [3.6.3] - 2026-10-04

### Changed

- **kp-themes 9.2.1 vendored** (verified against the release SHA256SUMS):
  the close button on alerts and toasts takes the alert's own plate and
  ink. No class or API change.

## [3.6.2] - 2026-10-04

### Changed

- **kp-themes 9.2.0 vendored** (verified against the release SHA256SUMS).
  The four new modules join the `webapp` asset set: `js/actions.js`
  (buttons in shared columns), `js/attention.js` (attention band),
  `js/chart.js` (time chart) and `js/kpi.js` (key figures); `js/motion.js`
  gains `leave()`. New classes: `.kp-action-list`, `.kp-row-actions`,
  `.kp-tiles`, `.kp-kpis`/`.kp-kpi`, `.kp-page-header`, `.kp-attention`,
  `.kp-state-word`, `.kp-chart`. No class or API removed.

## [3.6.1] - 2026-10-04

### Changed

- **kp-themes 9.1.0 vendored** (verified against the release SHA256SUMS;
  `js/motion.js` added to the `webapp` asset set). Dialogs, accordions,
  tabs, tables, toasts, lists, trees, wizards and fields move through
  `js/motion.js`, which `js/auto.js` loads: a `.kp-dialog` plays its
  entrance backwards on close and stays `open` until that ends, and boxes
  ease to a new height. Knobs `--kp-close-max`, `--kp-size-max`,
  `--kp-motion-scale`; nothing moves under reduced motion. No class or API
  removed. A web app test that measures a dialog right after `close()`
  needs reduced motion or a wait for the motion to end.

## [3.6.0] - 2026-10-04

### Changed

- **Faster test runs** (Kenny, 2026-10-04, test report). `chassis release`
  runs the suites side by side with cargo-nextest when it is installed
  (doctests follow with `cargo test --doc`), and says so when it is not.
  The kit's own `scripts/test-carry.sh` does the same and runs the 57 s
  scaffold E2E only when `scaffold/`, the CLI or `Cargo.lock` changed since
  it last passed. The admin-API test no longer waits 10 s on port 1, which
  WSL drops instead of refusing. Measured: the kit's suite went from
  1 min 51 s to 49 s with the scaffold E2E included.

## [3.5.1] - 2026-10-04

### Changed

- **kp-themes 9.0.1 vendored** (verified against the release SHA256SUMS):
  `.kp-dialog` sets `margin: auto` and, when modal, `inset: 0` itself, so a
  modal dialog stays centred under a Tailwind preflight; no class or API
  change. Released without a test run on Kenny's word (2026-10-04: "deze
  update zo klein is dat er geen testen moeten uitgevoerd worden").

## [3.5.0] - 2026-10-04

### Changed

- **kp-themes 9.0.0 vendored** (verified against the release SHA256SUMS;
  `js/progressbar.js` added to the `webapp` asset set). The progress bar is
  now `<div class="kp-progressbar" role="progressbar" aria-valuenow="35">`;
  `<progress class="kp-progress">` and `--kp-progress-max-width` are gone.
  The kit's own pages use no progress bar. **A web app on the `webapp`
  feature that draws `.kp-progress` bars must move them to `.kp-progressbar`
  in the same change that bumps to this release** (the homelab admin does
  so in its 3.71.0). New cascade layer order `kp.base, kp.components,
  kp.register, kp.signature, kp.layout, kp.utilities`; every theme draws its
  own signature for spinner, switch, toast, dialog and the like, markup
  unchanged. See kp-themes' MIGRATION.md, section 8 to 9.

- **`chassis release` says how long its tests and gate took** (Kenny,
  2026-10-02: every test run reports its measured duration), e.g.
  `chassis release: tests took 1 min 40 s (measured)`.

## [3.4.0] - 2026-10-02

### Changed

- **The client issue form sits on a grid** (Kenny, 2026-10-02: grids
  wherever elements sit side by side). Its fields take equal columns, the
  button its own, the help line the whole row; on a phone they stack.
  Measured with screenshots at 1400 and 390 px.

### Added

- **Every kit page is optional per app** (Kenny, 2026-10-02: "alle
  pagina's moeten optioneel zijn"). `App::disable_kit_page("status" |
  "clients" | "passkeys")` removes the page from the navigation and
  `/api/kit/pages`, its route (404), its `/api/kit/…` data and, for
  `clients`, the client management API, for `passkeys`, the ceremonies and
  the login page's passkey button. Without it every page stays on, so no
  service loses a page it uses (measured: almanac, kyu and
  http-switchboard register a client API and status sections; kyu-runner
  has no dashboard). With the status page off and no home set, `/` leads
  to the first listed page.
- `tests/kenny_rules.rs`: locks for what Kenny said must always hold (page
  width, the grid form, the registry brand, the backup pause's 10 s bound
  and default mode, the release's single run and its durations), each
  drilled red once.

## [3.3.0] - 2026-10-02

The `chassis` CLI only; the library is unchanged, so a project keeps its
pin and gets this with the CLI (workstation `bin/ws-tools`).

### Changed

- **`chassis release` builds no container image for a native service**
  (Kenny, 2026-10-02: almanac, kyu, kyu-runner and http-switchboard run as
  native units, yet every release pushed an image to ghcr that nothing
  pulled: 58 versions). Whether a release builds and pushes the image now
  follows the project's deployment: a `deploy/service.yml` naming a
  `binary:` (the native stack file `chassis new` writes) means no image; a
  project without one builds it as before. `image = true` or `image = false`
  in `.chassis.toml` decides when set. Without an image the release needs
  no Dockerfile and skips the container gate; `chassis release --plan`
  says which way it goes and why.
- **A release that pushes an image keeps only the newest 3 versions on
  ghcr** (Kenny's rule that nothing grows without a bound). Best effort:
  the gh token needs `delete:packages`; without it the release says so and
  keeps them.

## [3.2.0] - 2026-10-02

### Fixed

- **The brand showed the binary's name** (fix-15; Homelab-dashboard,
  2026-10-02: the admin's brand read "Homelab-Admin"). The page registry
  filled `brand.title` with `AppSpec::name`, and `App::brand` took only the
  link. New `App::brand_title("Homelab")` sets the text; the kit's layout and
  `GET /api/kit/pages` (`brand.title`) both use it. Without it nothing
  changes: the service's name, as before.

## [3.1.0] - 2026-10-01

### Added

- **Backup pause** (feat-backup-1; Kenny, 2026-10-01: the homelab should
  pause every chassis-based service for its nightly backup instead of
  stopping it, and it must work in every circumstance, including an app
  that needs a full pause). `<name> backup-pause --for <secs>` and `<name>
  backup-resume` make the files under the state root stand still and
  return only once they do. Three ways, lightest first: hold only writes
  (default); `full`, which also answers every request but the probes 503
  (`App::backup_mode(Mode::Full)` or `--mode full`); and, when the service
  cannot give either, stop the systemd unit. Each has a dead-man: the
  in-process pause ends at the deadline, a stopped unit is started again
  by a systemd timer. The kit's own stores join through `write_atomic`; a
  project wraps its own writes in `chassis::shell::backup::writing()` (or
  `writing_blocking()`) and brings its files to rest in
  `App::on_backup_pause(|mode| …)`, with `App::on_backup_resume` for the
  way back. Exit codes and the procedure: docs/OPERATIONS.md §7.
- The pause, refined with the homelab as the backup's caller: `writes`
  stays the default, so probes and pages keep answering and no monitor
  fires at night; a write held by it waits at most 10 s and then fails as
  503 with `Retry-After`; `backup-pause` prints the directories it holds
  still after its first line (the state root plus `App::backup_path`); and
  the state shows as `<name>_backup_paused` and
  `<name>_backup_paused_since_seconds` in `/metrics` and as `backup` in
  `/api/kit/status`. The homelab uses it as a heartbeat: `backup-pause
  --for 120`, repeated every 60 s while the copy runs, then
  `backup-resume`, so the pause lasts exactly as long as the copy and ends
  by itself within 2 minutes if the backup dies.
- **Pages and one navigation** (feat-pages-1; Kenny, 2026-10-01: the admin
  should open on its own Home, not on `/app`, and the kit's pages belong in
  the same bar as the app's). A `WebApp` now mounts at the root by default
  and is the router's fallback, so `/` is the app's home and `/overview` its
  own route; `/app/…` answers 308 to the same path at the root. One page
  registry feeds every navigation: `App::page(Page::new(id, title,
  path).order(n).group(g).hidden())`, `App::kit_page(id, |p| …)`,
  `App::brand(href)`, `App::home(path)`, read by a web app from
  `GET /api/kit/pages`. With `App::kit_pages_in_webapp()` the web app draws
  the kit's status, clients and passkeys pages inside its own bar from
  `GET /api/kit/status`, `/api/kit/clients` and `/api/kit/passkeys`. The
  status page now also lives at `/status`; `/` still shows it for a
  service without a web app at the root. Docs: docs/WEBAPP.md.

### Changed

- **`WebApp::embedded` and `WebApp::dir` mount at `/`, not `/app`.** A
  service that wants the old place says `.at("/app")`. Only the homelab
  dashboard uses `webapp` today, and it asked for this.
- The kit's layout renders its navigation from the page registry, and the
  brand link follows `App::brand`.

- The scaffold's units carry `RuntimeDirectory=<name>` and
  `RuntimeDirectoryMode=0700`, so the socket has a home outside the state
  root. A project picks it up with `chassis sync --write`; until then
  `backup-pause` falls back to stopping the unit.

## [3.0.2] - 2026-09-30

A kp-themes update only: **kp-themes 8.1.0 vendored** (from 8.0.0; three
files changed, none added or removed). What a page on the kit sees:
`.kp-page` is now `max(80vw, 64rem)` wide, so the kit's pages and a
project's app use 80 % of the window (chassis's own CSS caps only prose,
`.explain` at 48rem); a datatable can show its busy state as an overlay
(`busy({ text, since, overlay: true })`, `data-kp-busy-overlay`); and an
indeterminate `.kp-progress` is striped again in every theme (kp-themes
fix-86).

## [3.0.1] - 2026-09-30

A patch: a project's own unit directives survive `chassis sync --write`.
Nothing on the Rust surface moves.

### Fixed

- **`chassis sync --write` no longer drops a project's own unit directive**
  (fix-14; http-switchboard, 2026-09-29). 3.0.0's sync rewrote
  `deploy/http-switchboard.service` from the scaffold and removed its
  `ExecReload=/bin/kill -HUP $MAINPID` (feat-reload-1). A project now
  records such lines in `.chassis.toml` as `unit_service = ["…"]`; the
  scaffold renders them after `ExecStart=`, so sync keeps them. A directive
  in the unit that the record lacks makes `--write` leave that file alone
  and name the line and the key (`--write --force` still drops it).

## [3.0.0] - 2026-09-29

A **major (3.0.0)**: the scaffold's file set changes (the two GitHub Actions
workflows are gone and `chassis sync --write` deletes them from a project),
and `chassis release` changes what it needs on the machine it runs on. The
Rust API is unchanged. Kenny, 2026-09-29: tests and release builds run
locally, then the result is uploaded; GitHub Actions builds nothing.

### Changed

- **`ClientsFile::issue` now goes at 4.0.0, not 3.0.0** (docs/REMOVALS.md).
  This major is the local build path only; the surface narrowing planned
  for 3.0.0, this removal included, moves to the next major. Nothing a
  consumer calls disappears in 3.0.0.

- **`chassis release` gates and builds on this machine** (feat-build-2).
  It runs what the scaffold's `ci.yml` ran (fmt, clippy `-D warnings`,
  tests, `.claude/hooks/gates.project.sh` with `CHASSIS_RELEASE_GATE=1`,
  `--version`, `cargo deny check all`, the image build with its `--version`
  and closed-port `--healthcheck` smoke, coverage as information), bumps and
  commits through the hooks, tags locally, and builds what `release.yml`
  built: the static musl binary in the same `rust:<toolchain>-slim-trixie`
  docker invocation, refused on any `=>` in `ldd`, `dist/<name>` +
  `dist/SHA256SUMS`, and `ghcr.io/<repo>:v<version>` + `:latest`. Only then
  does it push main and the tag, push the image, create the GitHub release
  (title = tag, the workflow's body "built locally from `<sha>`",
  `--latest=false`, fix-10 unchanged) and run `scripts/sign-release.sh`.
  No release branch, no waiting on check runs or on a Release run.
- **One full test run per release.** Kenny, 2026-09-29: "drie keer
  dezelfde testrun is dom, dat moet naar één". The scaffold's pre-commit
  hook goes through `~/Projects/workstation/bin/gate-stamp`: a commit that
  only moves the version lines (the one `chassis release` makes) skips the
  suite, and a green gate stamps the tree it tested. `chassis release` (and
  the kit's own `scripts/release-kit.sh`) skip fmt, clippy and the tests
  when HEAD's clean tree is that stamped tree. Without workstation, or on
  any doubt, everything runs as before.
- **`--dry-run` runs the gate and every build** on the bumped version and
  stops before any commit, tag, push or upload, putting `Cargo.toml` and
  `Cargo.lock` back. The old print-only behaviour is `--plan`.
- **The release preflight** no longer requires `.github/workflows/ci.yml`
  (fix-5's check is retired with the workflow); it refuses a project without
  a `Dockerfile` or `scripts/sign-release.sh`, and a tag that exists here or
  on origin.
- **Branch protection**: `chassis sync --protect` sets no required checks
  (none can arrive) and keeps "no force-push, no deletion"; `--remote`
  reports every required check as drift.

### Removed

- `scaffold/.github/workflows/ci.yml` and `release.yml`. `chassis sync`
  reports both as obsolete in a project that still has them; `--write`
  removes them, and `.github/workflows` once it is empty.
- `chassis release --poll-interval-secs` and `--max-wait-secs`.
- `drift::REQUIRED_CHECKS`. `.chassis.toml` `required_checks` still parses,
  and `sync` reports a non-empty one until it is deleted.
- The kit's own `.github/workflows/ci.yml`. `scripts/release-kit.sh` runs
  its steps on this machine instead (fmt, clippy, the whole suite with
  cargo-deny installed, the API contract, the `--version` smokes) plus
  `cargo deny check` on the kit, and pushes the release commit straight to
  `main` instead of through a `release-<version>` branch and a wait for its
  checks.

### Migration

Per project, after installing the 3.0.0 `chassis` CLI:

1. `chassis upgrade 3.0.0`, then `chassis sync --write`: the two workflow
   files go; `deny.toml`, `rust-toolchain.toml`, `.claude/hooks/gates.sh`
   and `scripts/sign-release.sh` change only in comments and messages.
2. Delete `required_checks` from `.chassis.toml` if present.
3. `chassis sync --protect` once, so `main` stops requiring
   `fmt · clippy · tests`, which no job produces any more.
4. On the release machine: `docker login ghcr.io -u <owner>` with a token
   that has `write:packages` (the push no longer uses the workflow's
   `GITHUB_TOKEN`), and `cargo install cargo-deny --locked`.
   `cargo-llvm-cov` is optional.
5. A project gate that keyed a heavier check on `CI=true` reads
   `CHASSIS_RELEASE_GATE=1` instead.
6. Scripts that polled CI or the Release workflow, and runbooks that say
   "the Release workflow builds …", point at `chassis release <version>`
   (`--dry-run` to rehearse). Before: `chassis release 1.2.0 --max-wait-secs
   2400`. After: `chassis release 1.2.0`.

## [2.4.1] - 2026-09-29

A patch: kp-themes 8.0.0 behind `/static/kp/`, and unhashed kit assets
revalidate instead of caching for a day (fix-13), so the new themes reach an
open tab at its next reload.

### Changed

- **kp-themes 8.0.0 vendored** (from 7.2.0, through 7.3.0). 8.0.0 is the
  theme-repo split: it drops kp-themes' `ha/`, `vscode/` and `tui/`
  exports, none of which the kit vendors; for the kit only the version
  stamp moved. 7.3.0 before it: Five files changed, none added
  or removed, 22 themes as before: the bundle, `datatable.js`, `effects.js`,
  `strings.js`, `theme-registry.js`. What a page on the kit sees: a required
  field no longer loads red (fix-74, so kyu can drop its own `:user-invalid`
  rule); nav-bar ghost and icon buttons use the bar's ink (fix-77/82); the
  select picker has a width cap (fix-78); datatables get a first-load
  spinner, a failed slot with Try again and a one-line multi-sort bar
  (fix-80, 83, 84, 85); the effects module arms its pointer and press buses
  on a later theme switch (fix-81). kp-themes' own fix numbers.

### Fixed

- **A kp-themes bump reaches an open tab at its next reload** (fix-13; the
  homelab dashboard thread, 2026-09-29). `/static/…` URLs without the
  `?v=` hash (a font reached from `fonts.css`, a module a project's app
  imports from `/static/kp/js/`) were cached for a day; they now get
  `no-cache` with a strong `ETag`, and an unchanged file answers 304.
  Hashed URLs keep a year, `immutable`.

## [2.4.0] - 2026-09-28

A minor: an optional gate in front of every route, and live streams that
end at logout. Nothing a project uses today changes.

### Added

- **`request-guard` feature: a gate in front of every route** (feat-guard-1;
  the homelab admin dashboard, reached through a Cloudflare tunnel and only
  from home). Off by default. `App::request_guard` runs a project's check
  after the proxy handling and before every route, the kit's own login,
  assets and API included; `/healthz` stays open. See `docs/WEBAPP.md`.

### Changed

- **A live stream ends at logout** (feat-live-1). Mounted behind the login
  or a token, an open stream re-checks every 5 s (`Live::recheck_every`)
  whether its caller is still allowed, without extending the session.

## [2.3.0] - 2026-09-28

A minor: two optional features for a project whose dashboard is a static
browser app, both off by default. Nothing a project uses today changes.

### Added

- **`webapp` feature: a project's own browser app behind the login**
  (feat-webapp-1; Kenny, 2026-09-28, for the homelab admin dashboard). Off
  by default, implies `dashboard`. `App::webapp(WebApp::embedded(FILES))`
  serves HTML, ES modules and CSS under `/app` (`.at()` moves it) with the
  kit's login in front, `index.html` for client-side routes, `ETag`
  revalidation, and a CSP of its own (the kit's unless `.csp()` names
  another). `WebApp::dir(path)` reads from disk for development. See
  `docs/WEBAPP.md`.
  With `webapp` the kit also serves the whole kp-themes 7.2.0 module set
  under `/static/kp/js/` (24 more modules: the wizard, the data table, the
  palette, the date picker, `auto.js`, …, verified against the release's
  `SHA256SUMS`), so a project's app takes kp-themes from the kit instead of
  vendoring a second copy.
- **`live` feature: Server-Sent Events** (feat-live-1). Off by default.
  `Live::publish` sends JSON to every subscribed browser; a slow or
  reconnecting browser gets a `resync` event instead of a replay buffer.
  The project mounts `Live::router(path)` behind the login or a token.

A service with neither feature compiles none of it: kyu-runner's release
binary measured 10,813,496 bytes before and after.

## [2.2.1] - 2026-09-27

A patch: two scaffold repairs from kyu's 2.2.0 adoption. Nothing on the Rust
surface moves; a project gets them with `chassis sync --write`.

### Fixed

- **A new project's gates skip the suite when no Rust moved** (fix-11; kyu,
  2026-09-27). The scaffold's `gates.sh` still ran `cargo test` on every
  commit although dev-procedure rule 49 moved every project to the gate
  cache; it now sources `.githooks/gate-cache.sh` and runs the suite through
  `gate_glob`. The scaffold ships the runner (`gate-cache.sh`,
  `trace-inputs.cjs`) and `check-timestamps.sh`, and its shared hooks are
  the current dev-procedure generation.
- **The unit's install line sets the owner** (fix-12; kyu, 2026-09-27).
  `deploy/<name>.service` said `install -D -m755 <bin>` and then
  `chown -R`, which is how kyu's binary ended up root-owned on CT 109 and
  the self-update stopped at the swap (fix-9). It now reads
  `install -D -m755 -o <name> -g <name> …`.

## [2.2.0] - 2026-09-27

A minor: kp-themes 7.2.0 behind `/static/kp/`, two repairs from kyu's
deployment (fix-9, fix-10) and the `--check` contract written down. Nothing
on the Rust surface moves; a project picks the scaffold half of fix-10 up
with `chassis sync --write`.

### Changed

- **kp-themes 7.2.0 vendored** (from 5.1.0; kp-themes asked, 2026-09-27).
  Brings kp-themes fix-74, the `:user-invalid` repair kyu reported, so a
  project serving the kit's `/static/kp/` can drop its own override. Two
  majors in between, what they change for a page on the kit:
  - 6.0.0 removed `academia`, `mono`, `ticker` and `woodblock` (22 themes
    remain). `theme-boot.js` maps a stored removed name to `formal`, and
    `nishiki`, which 5.0.0 renamed to `woodblock`, maps to `formal` too.
    `dark` is a rebuilt theme under the same name.
  - 7.0.0 loads the effect hooks on demand: `js/effects.js` imports nine
    files under `js/effects/` plus `js/as-of.js`, all now served. Six font
    families left the package and three arrived; the fonts in the binary
    went from 115 vendored files to 112 (2.1 MB of woff2).
  Measured in Chromium on the inbox example under `terminal`: the block
  caret follows the typed text (`--kp-col` 3 after three characters),
  `/static/kp/js/effects/caret.js` answers 200, no console error.

### Fixed

- **A refused `.prev` link names the binary's owner** (fix-9; kyu, 2026-09-20).
  "Operation not permitted" while keeping the previous binary used to blame
  the directory only; the common cause on CT 109 was a root-owned binary,
  which Linux will not let another user hard-link. The remedy now shows the
  owner and says to install with `install -o <user> -g <group>`.

- **Only a signed release is `latest`** (fix-10; kyu, 2026-09-27). The
  scaffold's `release.yml` published every release as `latest` with only the
  binary and `SHA256SUMS`, so between tagging and signing every updater read
  `releases/latest/download/VERSION` as a 404 (kyu 4.0.0: from 22:09 to
  02:59 UTC). The workflow now passes `make_latest: false`,
  `sign-release.sh` runs `gh release edit --latest` after uploading
  `VERSION`, and a 404 on `VERSION` says the release is not signed yet. A
  project picks the scaffold half up with `chassis sync --write`.

### Documentation

- **`--check` writes nothing**, stated in `docs/SELF_UPDATE.md` and on
  `App::on_check`: open the store read-only, never through the migrating
  path (kyu fix-check-1).

## [2.1.0] - 2026-09-26

A minor: one addition to `.chassis.toml`, a repaired release step, and a test
suite that passes on WSL2. Nothing on the public surface moves.

### Added

- **`.chassis.toml` `required_checks`** (Kenny, 2026-09-25). A project that
  runs fewer CI jobs than the kit's `ci.yml` names the checks `main` waits
  for; `chassis sync --remote` compares branch protection against that list
  and `--protect` sets it. Left out, it is the kit's three. Before this, the
  drift report told http-switchboard and kyu-runner to require
  `cargo-deny (advisories · licenses · bans)` and `container build`, which
  their CI never produces, so following its remedy would have blocked `main`.

### Fixed

- **`chassis release` shows minisign's password prompt** (fix-7). The sign
  step collected its output until the script ended, so the prompt stayed
  invisible while minisign waited for the password: with a terminal the
  release looked hung at "waiting for the Release workflow", without one it
  failed at once. The step now passes all three streams through.
- **The test suite passes on WSL2** (fix-8). Three tests assumed a refused
  connection on a fixed low port and a paused clock that waits for loopback
  IO; neither holds there.

## [2.0.2] - 2026-09-10

The release that makes the branch-protection decision of 2026-09-10 reach the
projects that build on the kit, plus one repair to the consumer check. Nothing
here touches the public surface.

### Changed

- **`chassis sync --protect` no longer forces admins to wait** (Kenny,
  2026-09-10). Branch protection still requires the one CI check and still
  blocks force-pushing and deleting `main`; `enforce_admins` is off, so the
  people who own the repository can push straight to main when they choose.
  A project that still has it on now reads as drift. What a release is
  verified by does not change: `chassis release` waits for the pushed
  commit's checks itself.

### Fixed

- **The consumer check no longer writes in the consumers' working trees**
  (fix-6, CF-18). `scripts/check-consumers.sh` patches the kit in with cargo's
  `--config patch…` override, which rewrites each consumer's `Cargo.lock`
  where that project lives — it dropped the `source = "git+…"` line in three
  of the four. Every lockfile is now saved and restored in a `trap`, on every
  exit path. Reported by http-switchboard as a defect they could not
  reproduce; it was this repository, twice in one evening.

## [2.0.1] - 2026-09-10

The transition window's missing half, and two faults kyu-runner and
http-switchboard found while adopting 2.0.0. Nothing here touches the public
surface: the contract reports 823 items unchanged.

### Added

- **The transition window has a list and a check** (feat-api-2).
  `docs/REMOVALS.md` names every `#[deprecated]` item, the version it was
  deprecated in and the major it goes at; `scripts/check-api.sh` now compares
  that table with the attributes the compiler sees and refuses a release where
  they disagree — a deprecation with no row, a row whose item is already gone,
  a `Since` that does not match, or a removal aimed at a minor. Rule 46 fixes
  the window's length: the contract is frozen for the life of a major, so a
  deprecated item goes at the next major.
- The surface generator takes `--deprecated`, printing that list separately.
  Separately on purpose: `docs/API_SURFACE.txt` is the frozen contract, and a
  marker appearing on one of its lines would read as that line changing.

### Fixed

- **The scaffold no longer overwrites the shared hooks** (fix-4). Three files
  are distributed by `~/Projects/dev-procedure` as well: `.githooks/commit-msg`,
  `.githooks/check-ids.sh` and `.claude/hooks/check-commit.sh`. The kit writes
  them once at `chassis new` and `chassis sync` now reports a difference instead
  of writing over it, so a project that carries the canonical version stops
  going red on every sync. The shipped copies were a generation behind, old
  enough that a fresh project could not commit with the house ID scheme.
  Reported by kyu-runner; the ownership question is CF-16.
- **`chassis sync` writes a project-owned file that is missing** (fix-4).
  "Written once by `new`" now means an absent file is still written, because
  creating is not overwriting — a project that was migrated rather than
  generated never ran `new`, so without this it would never receive
  `.githooks/check-ids.sh` at all and the ID gate would silently not run. A
  file that exists is still left alone.
- **`chassis release` refuses a project whose CI cannot check the release
  branch** (fix-5). It pushes `release-<version>` and waits for that commit's
  checks; a workflow triggering only on `main` produces none, so the wait ran
  to its 1800-second timeout with nothing in the Actions tab to look at. The
  `on:` block is read before anything is pushed, and the message names the
  remedy. Measured by kyu-runner on their own release.
- `docs/MIGRATION.md` still called this release's section `1.9.0 additions`.
- `ClientsFile::issue` said `since = "1.9.0"`, a version that was never
  released — the chain refused it as a mislabelled minor and it went out as
  2.0.0. Its doc comment also promised removal "in the version after", which
  the frozen contract does not allow; it now says 3.0.0 and points at the
  table that holds it to that.

## [2.0.0] - 2026-09-10

Batch 4 and round 5 (rule 46, the four consumer reports and the name Clients,
weighed 2026-09-10), kp-themes 5.1.0, and round 6 — the three working points
from Kenny's own look at this release running on the scratch container.

**This is a major.** It was drafted as 1.9.0 and called additive, and the
release chain proved otherwise: `check-consumers.sh` refused to publish
because almanac and kyu no longer compiled. See CF-15.

### Migration

`chassis::core::clients::Client` gained a public field in this release
(`fields`, from feat-clients-2) and a struct with public fields cannot grow
without breaking every literal construction of it. Rather than let that
happen again on the next field, the type is now `#[non_exhaustive]` and the
kit offers the way to make one:

```rust
// before — breaks whenever the kit adds a field
clients.push(Client {
    id: format!("source-{source_id}"),
    name: source_id,
    token: Some(token),
    issued_at,
    revoked_at: None,
    last_used_at: None,
    uses: 0,
});

// after — everything the kit adds later gets its default
clients.push(Client::adopted(
    format!("source-{source_id}"),
    source_id,
    token,
    issued_at,
));
```

Only code that *builds* a `Client` is affected, which in practice means
one-time migration code that converts a project's own store into the kit's.
Measured across the four consumers on 2026-09-10: almanac
(`src/shell/kit.rs`) and kyu (`src/kit.rs`), one place each.
http-switchboard and kyu-runner never construct one and need no change.

Reading a `Client` is unchanged, and so is the on-disk format: a store
written by 1.8.0 reads here without conversion.

The transition window promised by rule 46 is also in use for the first time:
`Clients::issue` is deprecated and still works, replaced by
`issue_with_fields`.

### Added
- **The kit keeps a client's declared fields** (feat-clients-2). A project
  declares a field with `client_form_field` and nothing else: the kit stores
  the value with the client in its sealed store, renders a column under the
  project's own label, returns it from the clients API (so `chassis clients
  list --json` carries it) and removes it with the client. Only declared names
  are stored, so a caller cannot grow the store; `on_client_issued` still sees
  everything posted. Clients-store format 1 → 2, and a format-1 file reads
  unchanged.
- **`App::project_config()` / `project_table()`** (feat-config-1): the kit
  hands a project its own part of the shared config file, kit knob keys and
  kit table sections removed. Replaces nineteen hand-written lines per
  consumer, one of which — removing `notify` — rested on undocumented
  knowledge and would have broken silently when the kit gained a second
  section.
- **`Counter` and `Gauge`** (feat-metrics-1): enough to take Prometheus text
  formatting out of a consumer. Label values and names are escaped and
  sanitised, label sets canonicalised, so one quote in a label can no longer
  invalidate the whole scrape — which takes the kit's own metrics with it.
- **`docs/KIT.md` says what each feature brings with it** (feat-docs-1): the
  feature chain with what it pulls in and what it weighs, and which secrets a
  feature makes mandatory with what fails on a machine without them. The same
  table is in `docs/MIGRATION.md`.

### Changed
- **The Clients table carries one button per row** (feat-clients-4). Name,
  Issued, Last used, State and the project's own columns stay; the token
  column and the row's up-to-eight controls move into a
  `<dialog class="kp-dialog client-dialog">` per row, with a fixed head and
  foot and a scrolling middle. The token gets a line of its own there, so
  revealing it — twelve bullets becoming forty-eight characters — moves
  nothing beside it. The requests load when the dialog opens instead of behind
  a toggle. Every control keeps the `data-*` attribute its handler already
  listened for, so the modal is a place rather than a new mechanism. The old
  `data-requests` panel toggle is gone; a project's registered actions render
  in the dialog under **Actions**.
- **A timestamp is rendered for a person** (feat-ui-1). Six render sites now
  emit `<time datetime="<exact RFC 3339>">` with a `YYYY-MM-DD HH:MM` fallback
  from the new `human_time` filter, and `chassis.js` replaces the text with
  the viewer's own locale, keeping the exact value in the tooltip. What the
  filter cannot read it returns unchanged.
- **A busy button holds its box** (feat-clients-5). A busy label narrower than
  the rest label used to let the actions row unwrap and re-lay out under the
  cursor; the button now measures itself once and holds that as a floor until
  it wears its rest label again.
- **kp-themes 5.1.0** (ask-1 amendment). Three vendored files move
  (`dist/kp-themes.css`, `js/effects.js`, `js/theme-registry.js`); the other
  112 are unchanged, and every one is verified against the release's own
  `SHA256SUMS` (`sha256sum -c --ignore-missing` — the manifest also names the
  fonts the consumer tarball omits). The interim `.state-badge` rule is gone:
  `.kp-badge` now reads `overflow-wrap: var(--kp-badge-wrap, anywhere)`, so
  the kit declares `.state-cell { --kp-badge-wrap: normal; }` on the state
  column and leaves the badges plain. A project's own badges keep the
  package's protection — kp-themes measured one unbroken value 485 px wide on
  a 360 px viewport without it. `chassis sync` reports the `kp_themes` record
  as drift and `--write` corrects it.
- **The scaffold builds one shape for everyone** (feat-build-1): a static
  musl binary on `gcr.io/distroless/static`, which removes the dependency on
  the container's glibc that blocked three rollouts on 2026-09-09. `passkeys`
  leaves the scaffold's default feature list because it pulls OpenSSL, which a
  musl build would have to vendor per release; no consumer built it.
- **CI runs on every branch again** (feat-ci-1) after the narrowed trigger
  made `main` unreachable without a pull request.
- **The kit says Clients** (feat-clients-1): every surface it renders or
  prints uses the project's vocabulary or the word `client`, never `caller`.
- **`ClientsFile::issue` is deprecated** in favour of `issue_with_fields`, and
  stays for one version (feat-api-2, the first use of the transition window).

### Fixed
- **The generated `docs/KIT.md` describes the features the project builds**
  (K35). `chassis sync` reads the feature list off the `chassis` dependency
  in the project's `Cargo.toml` (implications expanded, `default-features =
  false` honoured), names it in one line under the title, and leaves out the
  sections for features this binary does not carry. A headless service is no
  longer handed a document about a login page that answers 404 there
  (standing rule 43). `chassis new` renders the same list into the
  `Cargo.toml` it writes, so a new project's document and its features have
  one source.
- **Every new project ships a kit smoke test** (K34). `chassis new` writes
  `tests/kit_smoke.rs` on `chassis::testing` — start on a free port, log in,
  issue a client, one API call with that client's token, one dashboard page
  — and puts the harness on the `chassis` dev-dependency. The file is
  kit-owned, so `chassis sync` keeps it current. A project built without the
  dashboard gets neither the file nor the dev-dependency: the test logs in,
  and the `testing` feature implies `dashboard`.
- **`chassis::admin::AdminApi`: a client token from another service** (K38).
  Part of `core`, so a headless service reaches it without compiling a
  dashboard: `new`/`from_env`, `issue_client(name, fields)` (issue and
  reveal in one call), `list_clients`, `client_id`, `reveal_token`,
  `revoke_client`, `delete_client`. A refusal keeps the other service's own
  message and remedy; a wrong admin token is `Unauthorized` rather than a
  followed redirect to a login page. kyu-runner hand-wrote thirty lines of
  this to test against a real kyu hub.
- **`--knobs` lists the knobs this binary can act on** (K36).
  `AppSpec::knobs_markdown` now filters on the compiled features, and
  `AppSpec::knobs_markdown_for(features)` renders the table for a named set
  (what `chassis sync` uses from outside the service). `knobs()` and
  `knob_keys()` are unchanged: a knob of a feature the binary lacks is still
  accepted and ignored in the config file, exactly as `docs/KIT.md` says.

### Changed
- **`docs/MIGRATION.md` says the test harness is for services with a
  dashboard** (K37) and carries a per-version list of claims a kit upgrade
  may have made false in a project's own README and runbook (HK5). Both come
  from consumer sessions on 1.8.0.

### Fixed
- **`chassis::testing` reads the environment the app actually starts with**
  (K25, CF-12). `TestApp::token()` (and with it `login()` and
  `session_cookie()`) and `TestApp::state_dir()` captured the harness's own
  generated token and temporary directory *before* the `extra_env` overlay
  was applied, so a test that pinned `<PREFIX>_TOKEN` or
  `<PREFIX>_STATE_DIR` to a known value ran the app on that value while the
  harness kept logging in with the one it had generated
  ("login as the admin failed"). Both are now read from the assembled
  environment after the overlay, which is what `start_with_env`'s
  documentation always promised. Reported independently by kyu and by
  Almanac on 1.8.0; both worked around it in their own suites and can drop
  the workaround.

## [1.8.0] - 2026-09-09

Kit batch 3 (F1–F8, weighed by Kenny 2026-09-06; built in parallel worktrees
on 2026-09-07) and kp-themes 5.0.0 (adopted 2026-09-09). Additive only;
nothing a 1.7.x consumer must change — `docs/MIGRATION.md` "1.8.0 additions"
lists what each consumer can adopt.

### Added
- **`chassis::testing`** (K25, feature `testing`, implies `dashboard`; for a
  project's dev-dependencies): `TestApp::start` / `start_with` /
  `start_with_env` / `start_open` bring a service up in-process — temporary
  state dir, fresh `<P>_TOKEN` and `<P>_SECRET_KEY`, port 0 — with `login`,
  `issue_client` (K16 form fields included), `bearer`, `page`,
  `get_json` / `post_json` / `delete`, `as_browser` / `as_cross_site_browser`
  (Chrome's form-submit headers, CF-7) and `shutdown`. It is the harness kyu,
  Almanac and the inbox example each wrote by hand; the kit's own in-process
  suites now run on it. `FakeReleaseServer` (with `self-update`) is the update
  suite's signed fake release, made public. `docs/TESTING.md` carries the
  worked example, which the suite compiles and runs.
- **Project vocabulary** (K28): `App::vocabulary(singular, plural)` names what
  this service calls a client ("source"/"sources" for Almanac). Every kit
  sentence on the login, clients and status pages and every refusal from the
  clients API use it; the heading and nav label default to the capitalised
  plural (`clients_label` still wins when set). Presentation only: paths,
  JSON keys, cookies, metrics and log fields keep saying `client`.
- **Row and section actions** (K29): `App::client_action(ClientAction)` puts a
  project button on every active client row (`{id}` in the route becomes the
  client's id); `StatusSection::actions()` (a default method) puts buttons
  under a section on `/`. Both render through the kit's `[data-post]`
  mechanism with arm-before-act and a busy label on destructive ones; the
  route is the project's own, behind the admin login. Almanac's stand-alone
  "Reload profiles from disk" form becomes one `SectionAction`.
- **`chassis clients`** (K30): `chassis clients <list|issue|reissue|revoke|
  delete|reveal> --url <base> --token-env <VAR> [--field k=v]... [--json]
  [--timeout-secs N]` manages a running service's client tokens over its own
  `/api/clients`, for headless services (http-switchboard, kyu-runner) that
  need a token for a caller like Alertmanager. The admin token comes from the
  environment only; `issue`, `reissue` and `reveal` print the token once on
  stdout and nothing else; every refusal names a remedy; exit codes 0/1/2.
- **The knob table from the spec** (K31): every kit knob carries a
  one-sentence meaning and the feature that reads it; `AppSpec::knobs_markdown()`
  renders the list as a Markdown table and the new control `<name> --knobs`
  prints it — answered before any configuration is read, like `--version`.
  The hand-written knob tables in CONFIGURATION.md are gone; they point at
  `--knobs`.
- **`docs/KIT.md` in every project** (K27): `chassis new` writes and `chassis
  sync` keeps a generated, kit-owned document describing what the project gets
  from the kit — the door (client tokens, the two secrets, `gen-secret`), the
  dashboard pages, `/healthz` and `/metrics`, self-update, notifications, the
  control commands, the full knob table for the pinned kit version, and where
  state lives.
- **`chassis sync` reports drift that is not a file** (K32): the kit tag
  `Cargo.toml` pins vs `.chassis.toml`'s `chassis_tag` (a path dependency is a
  note), `kp_themes` vs the version the kit vendors (`--write` corrects the
  record before rendering, since `docs/KIT.md` names it; a test pins the CLI's
  constant to `KP_THEMES.sha256`), and behind the new `--remote` flag main's
  branch protection (checks, `strict`, `enforce_admins`) vs the scaffold's CI
  job names — one list shared with `--protect`. Every difference is one
  `! <what>: <project> vs <expected> — <remedy>` line and exits 1; sync stays
  offline without `--remote`. Measured 2026-09-06 on Almanac (1.7.0 vs 1.7.1)
  and kyu (`gates` still required).

### Changed
- **kp-themes 5.0.0** (K15): the kit vendors the new release under the
  package's own paths — `/static/kp/dist/kp-themes.css` (the release's own
  bundle: 25 themes, components, layout and utility classes, every theme's
  register), `/static/kp/css/fonts.css` + `/static/kp/fonts/…` (kp-themes'
  own fonts, 73 faces, 5 MB in the binary, fetched per theme), and seven
  JavaScript modules including `js/effects.js` (the terminal theme's block
  cursor, the themes' arrivals). Themes renamed: `topo` → `forest`,
  `tazhib` → `lapis`, `nishiki` → `woodblock` (a stored old name is migrated
  by `theme-boot.js`); `cyberpunk` is a different theme under the same
  name. The templates' inline layout styles are gone. Confirmations on
  Re-issue / Revoke / Delete and on project actions are kp-themes' native
  `<dialog>` (default since kp-themes 4.0.0). Fonts reached without the
  `?v=` hash are cached a day instead of a year. The minified `dist/` twins
  are deliberately not vendored (docs/DASHBOARD.md says why). A project
  that linked `/static/themes.css` or `/static/fonts/…` itself moves to the
  `kp/` paths; a project on the kit's layout changes nothing.

### Fixed
- `chassis new` drops `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_PREFIX`
  and `GIT_COMMON_DIR` for every tool it runs: from a pre-commit hook in a
  linked worktree, its `git init` + first commit landed in the caller's
  repository (and set `core.bare` on the shared config). Both `gates.sh`
  (the kit's and the scaffold's) unset the same variables, so any test that
  spawns git stays in its own directory. The scaffold copy reaches projects
  through `chassis sync`.
- A refusal on a `[data-post]` button (Re-issue, Revoke, Delete, and now
  project actions) was never visible: the remedy flashed during the button's
  busy spell was overwritten the same tick by the busy restore, and the button
  came back reading "Working…". The flash now outlives the busy spell and
  shows the kit's error and remedy for five seconds; Reveal reads "Hide" while
  a token is shown, as DASHBOARD.md always said.
- A wrong bearer on the admin routes (`/api/clients*`, pages) is answered with
  a JSON 401 and a remedy naming `<PREFIX>_TOKEN` instead of a redirect to
  `/login`; requests without any credential are still redirected (K30).
- The client-name `pattern` on the Clients page was invalid under the `v`
  flag browsers compile it with (a bare `-` inside the class), so Chromium
  logged an error and ignored it — any name passed the browser and only the
  server refused. The hyphen is escaped; a test pins the shape. Found in the
  kp-themes 5.0.0 browser drill.
- `chassis sync` exits 1 whenever a difference is still there when the run
  ends — also under `--write`, for the drift it cannot fix (the kit tag in
  Cargo.toml, a branch protection without `--protect`). Before, `--write`
  exited 0 after printing the red line, so a script read green over an
  unresolved difference (K32, D1).

## [1.7.1] - 2026-09-06

### Fixed
- `.chassis.toml` gains `vmid`: `service.yml` and its hostname come from it,
  so a sync no longer resets an adopted project's stack file to vmid 0
  (Almanac's and kyu's did on their first sync).

## [1.7.0] - 2026-09-06

### Added
- **Issue-form fields and hooks** (K16): `App::client_form_field` adds a
  text or select field (options asked for at render time) to the clients
  page's issue form; `App::on_client_issued(client, fields)` runs before a
  token exists and may refuse; `App::on_client_deleted(client)` runs before
  a delete and may refuse — either error reaches the page with its remedy.
  Almanac's sources become one page: name + calendar → profile and token in
  one click. `POST /api/clients` accepts the extra fields as JSON keys next
  to `name`.
- **`deny_ignore` in `.chassis.toml`**: reviewed RUSTSEC exceptions reach
  the kit-owned `deny.toml`, so a sync keeps them — the first kit-CI run on
  Almanac was red on three advisories with nowhere to record the decision.

### Fixed
- The scaffold units set `<PREFIX>_STATE_DIR` explicitly from
  `.chassis.toml` instead of relying on the binary's compiled-in default —
  Almanac's rendered unit lacked the line CT 112 actually runs with.

## [1.6.0] - 2026-09-06

### Added
- **Project-owned gates** (M1): the scaffold's `gates.sh` and CI run
  `.claude/hooks/gates.project.sh` when it exists — a project keeps its own
  checks (a module-boundary grep, a version script, a SQL guard) in a file
  `chassis sync` never touches.
- **Measured deploy paths** (M2): `.chassis.toml` gains `env_file` (default
  `/etc/<name>/<name>.env`) and `latch_env` (default `prod`; `""` = no
  `--env`); the unit, the latch unit and `service.yml` render them, so a
  migrated project's deploy files can equal what its LXC actually runs.
- **`.gitignore` additions survive a sync** (M3): everything under
  `# --- project additions below (kept by chassis sync) ---` is kept.

## [1.5.1] - 2026-09-06

### Fixed
- The self-updater's `--check` probe retries a spawn that fails with
  `ETXTBSY` (the staged binary still held open for a moment) instead of
  declaring the release unusable — seen once in the kit's own CI.
- **Dashboard forms were refused from Chrome** (CF-7, found live on
  CT 112 with Almanac 3.0.0): under `referrer-policy: no-referrer` a
  browser sends `Origin: null` on every form submit, and the CSRF rule
  refused it — login included. The CSRF guard now reads `Sec-Fetch-Site`
  first (`same-origin`/`none` pass, `cross-site`/`same-site` refused) and
  falls back to `Origin` vs `Host` only without it; the header is
  `referrer-policy: same-origin`. `tests/browser_forms.rs` sends what
  Chrome sends.
- A refusal answered to a browser navigation renders as a page in the
  dashboard layout (`templates/error.html`, same status, error and
  remedy, a way back) instead of a bare JSON document; scripts and API
  callers keep the JSON shape.
- `chassis release` (also `--dry-run`) refuses a repository whose
  `release.yml` builds a container image but has no `Dockerfile`, with the
  `chassis sync --write` remedy — kyu-runner's first v0.2.0 Release run
  failed on exactly that (CF-6 b).

### Changed
- `/healthz` keeps a failed store write until a write to that **same path**
  succeeds; a good write elsewhere no longer clears it (it also made the
  health check race between parallel writers in the kit's own tests).
- The scaffold end-to-end test also runs `cargo deny check` on the
  generated project when cargo-deny is installed (the kit's CI installs
  it); the first remote project was red on cargo-deny while every local
  gate was green (CF-6 a).

## [1.5.0] - 2026-09-06

### Added

- **An open dashboard, as an opt-in.** `AppSpec::open_dashboard = true`
  lets a service run its dashboard without `<P>_TOKEN` and
  `<P>_SECRET_KEY`: no login, every page and every API route answers
  whoever reaches the port, a banner on every page, a warning at every
  start and at `--check`, nothing sealed on disk (clients live in memory,
  no session is minted, passkeys stay off). Off by default — a service
  that does not opt in refuses to start exactly as before, and the remedy
  now names the opt-in. Asked for by Kenny at kyu's step-2 form (K2-4,
  2026-09-06): "a dashboard without a token must stay possible; for kyu we
  ask for one anyway". Tests: `tests/open_dashboard.rs`.

## [1.4.1] - 2026-09-06

Two faults that the first remote `chassis new` and the first `chassis
release` on a real machine found within an hour of each other.

### Fixed

- **`chassis release` refused a machine with minisign installed.** The
  tool check ran `minisign --version`, which minisign 0.12 answers with
  exit 2; `-v` is accepted now. Test:
  `a_tool_that_only_answers_dash_v_counts_as_available`.
- **A generated project's CI was red on cargo-deny.** `wildcards = "deny"`
  flags a git dependency without a version requirement, and the scaffold's
  `Cargo.toml` had only the tag. It now carries `version = "<tag without
  v>"` next to the tag — what kyu-runner's migration had already added by
  hand. Test: `the_git_dependency_pins_a_version_next_to_its_tag`.

### Changed

- MIGRATION.md §10 step 1 makes `.chassis.toml` a required part of the
  copy: the three projects migrated on 2026-09-05 lacked it and `chassis
  release` refused all three.

## [1.4.0] - 2026-09-06

The two items Kenny put on the table after the Phase 10 retrospective.

### Added
- `update_notify_after_failures` (default 3): `update.failed` is emitted
  once, on the N-th consecutive failed release check, and `update.ok` once
  on recovery — not at every interval while a release host is down. This
  is Almanac's AR24 ("three strikes before notifying"), lost in its
  migration and now the kit's for every consumer. Until now a failed check
  emitted no event at all, only a log line.
- `passkey_ceremony_cap` (64), `passkey_ceremony_ttl_secs` (300) and
  `passkey_ceremonies_per_ip` (8): the pending-ceremony table's bounds are
  knobs (rule 27).

### Security
- **S6 closed.** The passkey ceremony table no longer refuses when full:
  the oldest ceremony makes room, one client IP can evict only its own
  share, and `/passkeys/login/*` sits behind the same per-IP limiter as
  `/login`. Before, one unauthenticated machine could start 64 ceremonies
  and block passkey login and registration for everyone for five minutes.

### Changed
- `scripts/release-kit.sh`: the kit's own verified publish chain (standing
  rule 36) — every step asserts its postcondition, the tag is cut from the
  verified `origin/main` SHA, the GitHub release comes last.

## [1.3.0] - 2026-09-05

Asked for by the Almanac migration and ratified as D-A1.

### Added
- `App::on_update_event(|event| …)`: a project's listener on the kit's
  update events (`update.installed`, `update.ok`, `update.failed`,
  `update.rolled_back`, `update.held`), from the autonomous loop, the
  read-only watch and the `update` subcommand alike. The kit still handles
  each event itself (the `notify` feature's webhooks, or a log line); the
  hook runs alongside, so a project without a config file can speak its own
  vocabulary to its own notifier — Almanac's `almanac-update`, `-reverted`
  and `-unverified` to Home Assistant. `chassis::UpdateEvent` is the event
  type (`kind`, `version`, `detail`).

## [1.2.0] - 2026-09-05

Found while migrating kyu-runner, http-switchboard and kyu (AFK round 2, A2).

### Added
- `AppSpec.help_extra`: text appended to `--help` for the project's own
  environment variables and subcommands (kyu's `KYU_TOKEN`, Almanac's
  `ALMANAC_BOOTSTRAP_TOKEN` — the kit cannot know them).
- `App::needs_project_config()`: true only for a real start and `--check`.
  `--version`, `--help`, `gen-secret`, `--healthcheck`, `--print-config`,
  `update` and `rekey` are the kit's alone and must work without the
  project's configuration; two projects broke their `--healthcheck` on a
  box without a config file by reading it first.
- `App::update_gate(|| Option<String>)`: the project's veto on an
  autonomous update check — `Some(reason)` defers it to the next interval
  (Almanac's "never restart while captures are retained", AR25).
  Supervised updates are not gated.
- Feature `assets` (implied by `dashboard`): `chassis::shell::assets::ASSETS`
  for a project with its own dashboard, so it serves the vendored fonts
  (`fonts.css`, `fonts/*.woff2`) and kp-themes files itself and the kit's
  CSP (`font-src 'self'`) holds without a CDN.

### Fixed
- `--help` printed on stderr with exit 1, as if it were a refusal. It is an
  answer now: stdout, exit 0 (`Control::Help`). The unknown-flag refusal
  still points at `--help`.

## [1.1.0] - 2026-09-05

### Added
- `App::on_start(f)`: runs once after the socket is bound and readiness
  was announced, on the serving path only — where a service spawns its
  background workers (a pump, a poller). `--check` never reaches it. Found
  by the first migration (kyu-runner): a pump spawned before `run()` would
  start before logging and also under `--check`.
- `AppSpec::knob_keys()` and a public `App::spec`: a service that parses
  the shared config file with `deny_unknown_fields` strips the kit's keys
  first (see `docs/MIGRATION.md`).

## [1.0.0] - 2026-09-05

First release: the library (features `core`, `dashboard`, `passkeys`,
`self-update`, `notify`), the `chassis` command (`new`, `sync`, `release`)
and the `inbox` example. Consumers pin `tag = "v1.0.0"`. What is proven
where, and what is deliberately not, is `docs/TEST_PLAN.md`; the
Migration notes below apply to services built against the unreleased
0.1.x tree during development.

### Migration
- Release signatures must carry the trusted comment `<repo> v<version>`
  (`scaffold/scripts/sign-release.sh` and `chassis release` do this); a
  manifest signed without it is refused as "for another version".
- A plain `http://` `update_url` needs `<P>_UPDATE_ALLOW_INSECURE=true`.
- Secrets are no longer accepted as `--token` / `--secret-key` flags: set
  `<P>_TOKEN` and `<P>_SECRET_KEY` in the environment file.
- Services install to `/opt/<name>/bin/<name>`; the generated unit's
  `ReadWritePaths` covers only that directory (S2). Move the binary and
  update `service.yml` when taking the new unit.
- `--check` and start refuse a missing or unwritable state directory.
- `render_project` takes `(active_nav, source, ctx: impl Serialize)`;
  project pages get the `Dashboard` as an axum `Extension`.

### Added (Phase 7 hardening)
- `<P>_UPDATE_PUBKEY` (trust-root override, logged and shown on the card),
  `<P>_UPDATE_ALLOW_INSECURE`, `<P>_UPDATE_MAX_DOWNLOAD_BYTES`,
  `<P>_TIMEOUT_STOP_SECS` (mirrors the unit's `TimeoutStopSec` so `--check`
  can warn).
- `rekey` subcommand: re-seal every store from `<P>_OLD_SECRET_KEY` to
  `<P>_SECRET_KEY`.
- Read-only version watch in `off` and `supervised`; the update card shows a
  newer release without installing it.
- Skip list after an autonomous rollback (`update-skip.json`): a version
  that crashed is never reinstalled by the same process (CF-3).
- Built-in `store` subsystem in `/healthz`; state-dir probe at `--check`
  and start.
- Per-client-token API rate limit (429 + Retry-After), limiter pruning.
- Startup warnings: empty `trusted_proxies` on a non-loopback listen, short
  `TimeoutStopSec`; untrusted `X-Forwarded-*` noted once on the problems
  card; the self-update mode decision logged at start.
- Security headers on every response (CSP `script-src 'self'`, nosniff,
  DENY, no-referrer); fonts vendored; no inline script in the layout.
- Scaffold: `.dockerignore`, journald drop-in, compose example with log
  rotation, `--locked` release build, read-only CI token, SHA-pinned
  actions, systemd hardening set, lockfile in the first commit.

### Fixed
- Oversized bodies on captured API routes answered with an empty body; now
  413 with the kit's JSON error (both declared and streamed bodies).
- Webhook URLs were logged in full on failure; now scheme and host only.
- The SIGTERM listener was registered after the bind; a signal in that
  window killed the process instead of draining (found by the E2E suite
  under load).
- `main.rs` template was not rustfmt-clean; `Cargo.lock` was missing from a
  new project's first commit (both found by the generated-project gates E2E).


### Added
- The kit: `core` (configuration with provenance, errors with a remedy,
  logging, request-id, `/healthz` with `version`, `/metrics`, guards,
  graceful shutdown with `Type=notify`), `dashboard` (token + session
  login, Clients with tokens and last requests, status page, kp-themes
  3.1.0), `passkeys` (WebAuthn behind a trusted TLS proxy),
  `self-update` (off / supervised / autonomous, minisign-verified,
  staged probe, link+rename swap, rollback), `notify` (per-event webhooks
  with retries and a fallback).
- The `chassis` command: `new`, `sync`, `release`, and the scaffold they
  render (CI and Release workflows, Dockerfile, golden systemd unit,
  homelab `service.yml`, hooks).
- `examples/inbox`, the example service, and `examples/minimal.rs`.
