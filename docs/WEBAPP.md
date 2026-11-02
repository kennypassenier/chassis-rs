# A browser app, a live channel and a gate in front (`webapp`, `live`, `request-guard`)

Three optional features for a project whose dashboard is a static browser
application rather than server-rendered pages. Both are off by default; a
service that does not name them compiles none of their code.

```toml
chassis = { version = "…", git = "…", tag = "…", features = ["core", "webapp", "live"] }
```

## `webapp`: static files behind the login

```rust
use chassis::shell::webapp::WebApp;

const FILES: &[(&str, &[u8])] = &[
    ("index.html", include_bytes!("../web/index.html")),
    ("js/main.js", include_bytes!("../web/js/main.js")),
    ("css/app.css", include_bytes!("../web/css/app.css")),
];

app.webapp(WebApp::embedded(FILES));            // served at the root (3.1.0)
// app.webapp(WebApp::dir("web").at("/admin")); // from disk, under a path
```

- **Login.** The app sits behind the same admin login as the kit's pages:
  a browser without a session is redirected to `/login`, a script sending a
  wrong bearer gets a 401. After logging in the browser lands on `/`.
- **Routing at the root** (the default since 3.1.0, feat-pages-1). The app
  is the router's fallback: every route the kit or the project registered
  wins, and the app answers the rest. A path whose last segment has no
  extension and matches no file answers `index.html`, so `/` is the app's
  home and `/overview` or `/stacks/media` are its own routes. A missing file
  with an extension (`/js/gone.js`) is a 404, never HTML. The kit's
  prefixes (`/api`, `/static`, `/status`, `/login`, `/logout`, `/clients`,
  `/passkeys`, `/healthz`, `/readyz`, `/metrics`) never fall through to the
  app. `/app` and `/app/…` from before 3.1.0 answer 308 to the same path at
  the root. Load the app's own files by absolute path (`/js/main.js`) or
  put `<base href="/">` in `index.html`: a relative URL breaks under
  `/stacks/media`.
- **Routing under a path.** `.at("/admin")` keeps the old shape: `/admin`
  redirects to `/admin/`, the app answers below it, and `/` stays the kit's
  status page.
- **Caching.** Every response carries a strong `ETag` and `no-cache`: the
  browser revalidates and gets a 304 until the file changes, so an edited
  module is picked up on the next load without a build step. A URL with
  `?v=…` is cached for a year (`immutable`), as the kit's own assets are;
  `index.html` never is.
- **Content-Security-Policy.** The kit's policy by default
  (`chassis::shell::webapp::DEFAULT_CSP`: scripts, styles, fonts and
  connections from this origin only). `.csp("…")` replaces it for the
  app's responses only. kp-themes' framework-free modules run under the
  default, and the vendored kp-themes files are served at `/static/kp/…`
  (`/static/kp/dist/kp-themes.css`, `/static/kp/js/…`). Every build that
  serves the kit's pages (`dashboard`, and so `webapp`) serves the whole
  framework-free module set of the vendored release (the wizard, the data
  table, the palette, the date picker, `auto.js`, …) since 3.9.0; before, only
  `webapp` did and a page under `dashboard` alone got a 404 for them. A
  build without `dashboard` carries none.
- **Refusals at start and `--check`.** A mount that starts with one of the
  kit's routes (`/status`, `/login`, `/logout`, `/static`, `/api`,
  `/clients`, `/passkeys`, `/healthz`, `/readyz`, `/metrics`); an embedded
  app without `index.html`; a directory without `index.html`.

## The kp-themes runtime is loaded for you (feat-webapp-3)

Every HTML page the web app serves (`index.html` and the client-route
fallback) gets `<script type="module" src="/static/chassis/webapp-runtime.js?v=…">`
right before `</head>` (else before `</body>`, else at the end). The module
attaches kp-themes' effects (the dark theme's background glow that follows
the pointer, the reveals, the caret hook) and routes `data-kp-remember`
through the database store when the server provides one. Theme pickers,
confirmations, contracts and skip links are not attached: they rewrite or
demand specific markup, so a page that wants them still calls them.

- Only `text/html` is touched; every other file is served byte for byte. The
  `ETag` is computed over the injected bytes.
- The path is absolute (`/static/…`), so an app mounted with `.at("/ui")`
  works. It is the same origin, so the default CSP allows it; a custom
  `.csp(…)` must keep `script-src 'self'`.
- A page that already mentions `webapp-runtime.js` is left alone, and the
  module attaches once per page however it was loaded
  (`window.chassisRuntime = { effects }` reaches the effects handle).
- `.without_kit_runtime()` opts out, for an app that runs the
  runtime itself.

## The refresh control for a web app's pages (ux-chassis-10)

The runtime above also gives every page `window.chassisRefresh`: the kit's one
refresh control, one freshness line and one remembered interval, the same ones
Status and Storage use. Do not draw a bar of your own. Put
`<div data-chassis-refresh></div>` in the header row of the page (a
single-page app may add it whenever its header is drawn) and listen to the
kit's tick. The runtime is injected after your own head scripts, so register
in a `DOMContentLoaded` handler (or load your script at the end of `<body>`):

```js
const off = chassisRefresh.onTick(async ({ interval, reason }) => {
  await reload();                  // throw or return false: the control says the read failed
});
chassisRefresh.markFresh(new Date(serverTime));
```

A server-rendered fragment follows the tick with
`<section data-chassis-refresh-section="/fragments/queue">…</section>`. The
full API (`onTick`, `onInterval`, `interval`, `setInterval`, `now`,
`markFresh`, the `chassis:refresh` event) and the migration steps are in
docs/DASHBOARD.md, "The refresh control and the freshness line".
`WebApp::without_kit_runtime()` also leaves this out.

## Installable (PWA) (feat-webapp-4)

A web app is installable with no code of its own, at the root or below it
(see "Mounted below the root"): the kit serves a manifest, icons and a
service worker, and adds the tags to the pages. `WebApp::without_pwa()` opts
out.

```rust
use chassis::shell::webapp::{Display, Pwa, WebApp};

// Defaults are complete; change only what should differ.
app.webapp(WebApp::embedded(FILES).pwa(
    Pwa::new()
        .name("Medicine Cabinet")        // default: the brand title
        .short_name("Meds")              // default: the name cut at 12 characters
        .display(Display::Standalone)    // or Fullscreen, MinimalUi
        .theme_color("#223659")          // default: kp-themes formal's navy
        .background_color("#faf8f5"),    // default: formal's paper
));
```

- **Routes (public, no login).** `/manifest.webmanifest`
  (`application/manifest+json`: `start_url` and `scope` `/`, the display
  mode, colours, icons 192, 512, a maskable 192 and 512 and a monochrome 512),
  `/sw.js` (`Cache-Control: no-cache`, scope `/`),
  `/pwa/icon-{180,192,512,maskable-192,maskable-512,monochrome-512}.png`,
  `/pwa/icon.svg` (only when the web app ships an SVG there, else 404),
  `/favicon.ico` (a 308 to `/pwa/icon-192.png`, unless the web app ships its
  own `favicon.ico`, which is then served), `/pwa/offline` and
  `/pwa/offline.js`. The files named by shortcut icons and screenshots (see
  below) are public too, and nothing else is. The browser fetches these without a
  session, and a worker is installed before any login. The app and its other
  files still ask for the login.
- **Tags.** Every HTML page gets `<link rel="manifest">`, `<meta
  name="theme-color">`, an `apple-touch-icon` and a tab icon
  (`<link rel="icon" href="/pwa/icon-192.png">`, or `/pwa/icon.svg` ahead of
  it when the web app ships one) before `</head>`; a tag the page already has
  is skipped, so a page's own `rel="icon"` wins. The same tags and the
  worker registration (`/static/chassis/pwa-boot.js`) are on every page
  rendered through the kit layout (`render_project`, Clients, Storage and so
  on), so do not add them again there. A page the project writes completely
  itself (its own HTML, outside the kit layout) calls
  `app.pwa_page_head()` and puts the result inside `<head>`; it returns
  `None` when no web app is installable. The kit's login page links the manifest too, so
  an installed app can sign in. The worker is registered by
  `webapp-runtime.js`, so the CSP stays `script-src 'self'`, and only on a page
  that links the manifest.
- **Own icons.** Put PNG files in the web app at `pwa/icon-180.png`,
  `pwa/icon-192.png`, `pwa/icon-512.png`, `pwa/icon-maskable-192.png`,
  `pwa/icon-maskable-512.png` and `pwa/icon-monochrome-512.png` (the
  monochrome one is the shape for themed launcher icons; the maskable ones need its artwork inside the central 60 %, the rest is
  cropped). Each file you supply replaces the generated one, independently;
  a file that is not a PNG is ignored. Without them the kit draws the brand's
  first letter on the theme colour (the monochrome one on a transparent
  ground; generated at start, no image library). An optional `pwa/icon.svg`
  is listed in the manifest as a scalable icon and used as the tab icon.
- **The worker never serves a stale page.** It handles only two kinds of
  request, an allow-list: pages (a navigation, a document request or one that
  accepts HTML) and static files (`/static/**`, `/pwa/**`, or a path ending
  in js, mjs, css, map, woff2, ttf, png, svg, ico, jpg, jpeg, webp, gif or
  webmanifest). Those go network first: the cache is used only when the
  network fails. Everything else goes straight to the network untouched, so
  the app's own data (for example `/data/tasks.json`) is never kept and never
  shown stale offline. Never handled: `/api`, `/login`, `/logout`, non-GET and
  range requests, and anything asking for `text/event-stream`. Never stored:
  anything but a plain 200 of this origin (no 303, no opaque answer, nothing
  reached through a redirect such as the login page, no event stream, no
  `application/json`, no `Cache-Control: no-store` or `private`). The cache
  is named after the kit's asset version and the web app's own build (a hash
  of its files), so a release drops the old caches when its worker activates;
  at most 200 entries are kept. An offline navigation without a stored copy
  shows a small offline page that retries by itself.
- **Updates.** The worker activates at once (`skipWaiting`, `clients.claim`)
  and tells open pages; a page that was already controlled reloads once per
  release (remembered in `sessionStorage`), so there is no reload loop.
  `Pwa::reload(Reload::Ask)` turns the automatic reload off: the page fires
  `chassis-pwa-update` on `window` with `detail: { version, apply() }`, and
  the app calls `apply()` at a moment it chooses (not while someone is
  typing); `apply()` reloads once. `Reload::Auto` is the default.
- **Conditions.** The web app has the kit runtime (`without_kit_runtime()` also leaves the install
  out, because the runtime registers the worker). Android offers the install
  only over HTTPS (or `localhost`): behind Traefik with a certificate that is
  the case; plain `http://` on a LAN address is not.
- **Privacy note.** A page the user saw while logged in can be shown again
  offline from the cache; `/api` data is never kept. A shared device should
  clear site data after logging out.

### Shortcuts and the share target

Two optional manifest members, set on the `Pwa` builder and checked at
start (a path outside the app, an empty name or more than four shortcuts
refuses the start with the remedy):

```rust
use chassis::shell::webapp::{Pwa, ShareTarget, Shortcut, WebApp};

app.webapp(WebApp::embedded(FILES).pwa(
    Pwa::new()
        .shortcut(Shortcut::new("Inbox", "/inbox"))      // long press on the icon
        .shortcut(Shortcut::new("Focus", "/focus").short_name("Focus"))
        .share_target(ShareTarget::get("/capture")),   // the system Share sheet
));
```

`ShareTarget::get(action)` receives the shared `title`, `text` and `url` as
query parameters; `ShareTarget::post(action)` as a form POST;
`.params(title, text, url)` renames the three fields and `.files(field,
&["image/*"])` also accepts files, which makes it a multipart POST. The
action is the app's own route; the kit adds nothing behind it, with one
exception: a GET share target changes data on a GET, and the login cookie
rides a link from any website, so the kit answers 403 to a request for that
path when `Sec-Fetch-Site` is present and is not `none` or `same-origin`, or,
without that header, when the `Referer` names another host. A request with
neither header (the share sheet of an installed app) passes. A POST share
target is covered by the normal cross-site rule instead.

The service worker never handles a request that asks for
`text/event-stream`, so a live channel mounted anywhere stays a direct
connection.

### Mounted below the root

A web app mounted with `.at("/app/hsb")` is installable too, and the whole
service is then the installed app. The manifest, `/sw.js`, `/pwa/*` and
`/favicon.ico` stay at the root with scope `/`, so the kit's pages and the
project's own routes are inside the app. Icons, shortcut icons and
screenshots are read from the web app's own files: `pwa/icon-192.png` in the
mount's files serves `/pwa/icon-192.png`. The installed app opens on the
mount (`/app/hsb/`); `Pwa::start_url("/")` picks another path of the app.
`app.webapp(..)` may be called more than once, but only one of the web apps
can be installable: with two the start and `--check` refuse and name the
mounts (add `.without_pwa()` to all but one). Two web apps on the same mount
path are refused as well.

### More manifest members, icons and screenshots

All optional, all written to the manifest only when set:

```rust
Pwa::new()
    .categories(&["health", "lifestyle"])
    .orientation(Orientation::Portrait)
    .lang("nl").dir(Dir::Ltr)
    .display_override(&[Display::Standalone, Display::MinimalUi])
    .launch_handler(ClientMode::FocusExisting)
    .start_url("/")
    .reload(Reload::Ask)             // see "Updates" above
    .shortcut(Shortcut::new("Water", "/water").icon("/img/water-96.png"))
    .screenshot(Screenshot::new("/img/today.png", "1080x1920", FormFactor::Narrow)
        .label("Today's habits"));
```

A shortcut icon is a 96x96 PNG file of the web app; a screenshot is a `.png`
or `.webp` file of the web app with its size as `WxH`. Both are served
outside the login (the launcher and the install prompt fetch them without a
session); a missing file or the wrong image type is a 404, and no other path
becomes public. A path with a scheme, a query, `#` or `..`, or a size that is
not digits, refuses the start. `Pwa::screenshot` can be called more than once.

The page script also keeps `<meta name="theme-color">` in step with the kit
header's colour at start and on every `kp-theme-change` (installable pages
only); the value in the HTML is only the first-paint colour.

## Web Push (feature `push`)

With the `push` feature (it implies `webapp`) an installable web app can send
notifications to subscribed phones and browsers: `app.push().send(Push::new(..))`
from the server, `window.chassisPush.state() | subscribe() | unsubscribe()`
on the page (no UI of its own; it exists only on installable pages of a build
with the feature). The service worker shows the notification and handles its
buttons. Setup, the five `push_*` knobs, the routes and the limits are in
docs/PUSH_DESIGN.md.

## Pages and the navigation (feat-pages-1)

One list holds every page the service shows, the kit's and the project's,
and every navigation renders from it: the kit's layout, and a web app
through `GET /api/kit/pages`. A page registered later shows up in both
without touching either.

```rust
use chassis::shell::pages::Page;

app.page(Page::new("home", "Home", "/"))
   .page(Page::new("overview", "Overview", "/overview").hidden()) // routable, not listed
   .page(Page::new("stacks", "Stacks", "/stacks").group("Fleet"))
   .kit_page("clients", |p| p.title("Sources").order(5))         // the kit's own pages
   .brand("/overview")                                            // the brand link
   .brand_title("Homelab");                                       // its text (default: the binary's name)
```

- **Order.** Ascending `order`; ties keep registration order. Project pages
  default to 0 and the kit's to 1000 and up (`status` at `/status`,
  `clients` at `/clients`, `passkeys` at `/passkeys` when passkeys are on),
  so the project's pages come first. `kit_page` may change a kit page's
  title, order, group or listing, never its id or path.
- **`/`.** With a web app at the root, the app's. Otherwise the status page,
  or a redirect to `app.home("/somewhere")`. The status page also lives at
  `/status`.
- **`GET /api/kit/pages`** (behind the login, `no-cache`): `{"app", "brand":
  {"title", "href"}, "home", "pages": [{"id", "title", "path", "group",
  "order", "nav", "secondary", "help", "source": "kit"|"app", "render":
  "kit"|"app"}], "more": [ids]}`, sorted.
  A web app renders its navigation from the pages with `nav: true`.
- **Secondary pages and the More tab** (ux-chassis-7, ux-chassis-8).
  `Page::new(id, title, path).secondary()` marks a page for the header's one
  overflow menu; the kit's Passkeys and Storage are secondary by default
  (`kit_page("storage", |p| p.primary())` undoes it). `more` lists the ids
  of the listed secondary pages in order. An app with its own tab bar (the
  phone) draws the pages with `nav: true` and not `secondary` as tabs and
  hosts ONE last tab "More" that opens a drawer or list with the pages named
  by `more` (title, `hint` under it, link to `path`), plus whatever of its
  own it keeps there. Because the kit pages are already in that tab, the app
  does not draw the kit's hamburger drawer next to it: one tab, no copy.
- **Help for a page** (ux-chassis-9). `Page::help("<p>…</p>")` is trusted
  HTML in plain English, for a "?" button in the app's header that opens a
  drawer: what the page shows and what each action does. The kit's own pages
  arrive with theirs in `help`; read it from `/api/kit/pages` and show it as
  is.
- **One bar on every page: `app.kit_pages_in_webapp()`.** The web app (at
  the root) draws the kit's pages too, inside its own bar. The kit then
  claims no GET page at `/status`, `/clients` or `/passkeys`, so the app's
  fallback serves them, and their registry entries say `render: "app"`.
  The data comes from `GET /api/kit/status`, `/api/kit/clients` and
  `/api/kit/passkeys` (behind the login, `no-cache`, exactly what the kit's
  templates render); every action stays the kit's existing endpoint
  (`/api/clients…`, `/passkeys/register/start|finish`, `/api/passkeys/{id}`,
  `POST /logout`). A service without a web app keeps the kit's layout.
- **Every kit page is optional** (2026-10-02): `app.disable_kit_page("status")`,
  `"clients"`, `"passkeys"` or `"storage"` switches that page off for this
  service: no navigation entry, no route (404), no `/api/kit/…` data; `clients`
  also drops the client management API, `passkeys` the ceremonies and the login
  button, `storage` the Storage JSON API. Pages are on unless switched off.
- **`nav_entry(label, href)`** from before 3.1.0 still works: it is a
  visible project page.
- **Refused at start:** a page path that is not absolute, two pages with one
  id, a project page with a kit id, `kit_pages_in_webapp()` without a web
  app at the root.
- **Directory source.** Read on every request; a path that leaves the
  directory, including through a symlink, is a 404.

## `live`: Server-Sent Events

```rust
use chassis::shell::live::Live;

let live = Live::new(256);
app.dashboard_routes(live.router("/events"));   // behind the login
// later, wherever state changes:
live.publish("stack", &serde_json::json!({ "name": "media", "state": "deploying" }))?;
```

In the browser:

```js
const events = new EventSource('/events');
events.addEventListener('stack', (e) => update(JSON.parse(e.data)));
events.addEventListener('resync', () => reloadEverything());
```

- Events carry an `id` counted from 1 per process.
- A browser more than `capacity` events behind receives one `resync` event
  (data: how many it missed) and should fetch the state again. A browser
  that reconnects (the `EventSource` sends `Last-Event-ID`) starts with a
  `resync` too: nothing is kept to replay.
- A comment line goes out every 15 seconds so an idle connection is not
  closed by a proxy.
- The router is not protected by itself: mount it with `dashboard_routes`
  (admin login) or `api_routes` (client token), whichever fits what it
  carries.
- Mounted that way, an open stream asks again every 5 seconds
  (`Live::new(256).recheck_every(…)` changes it) whether its caller is still
  allowed: a logged-out or expired session, or a revoked client token, ends
  the stream, and `EventSource`'s reconnect then meets the login like any
  other request. The check reads the session without extending it, so an
  open tab does not keep a session alive by itself.

## `request-guard`: a gate in front of every route

For a service that must refuse a request before the kit does anything with
it: before `/login` renders, before `/static` answers, before a token is
read. The homelab admin dashboard's case: a valid Cloudflare Access
assertion and the house's public address, then the kit's login.

```rust
use axum::http::StatusCode;
use axum::response::IntoResponse;

app.request_guard(|r| async move {
    // A proxy's header counts only from a trusted proxy.
    let ip = r.headers.get("cf-connecting-ip")
        .filter(|_| r.from_trusted_proxy)
        .and_then(|v| v.to_str().ok());
    if ip == Some("203.0.113.7") {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, "not from the house").into_response())
    }
});
app.request_guard(check_cloudflare_access);   // runs second
```

- A guard gets a `GuardRequest` (`method`, `path`, `headers`, `peer`,
  `from_trusted_proxy`, `client_ip`) and answers `Ok(())` or
  `Err(response)`; the response is sent as it is, and nothing behind it runs.
- Guards run in registration order; the first refusal wins.
- They sit inside the kit's proxy handling and in front of every route, the
  kit's own included, and in front of the web app and the live channel.
- `/healthz` is always exempt, so a monitor can probe;
  `app.request_guard_exempt("/metrics")` exempts more (a whole path
  segment: `/metrics` and `/metrics/…`, not `/metricsx`).
- `from_trusted_proxy` is true only when the TCP peer is in
  `<PREFIX>_TRUSTED_PROXIES`; set it to Traefik's address, or every
  `Cf-*` header is whatever the client sent.
- Without the feature, or with it and no guard registered, nothing is added
  to the router.
