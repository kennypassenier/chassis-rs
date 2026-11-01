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

A web app at the root is installable with no code of its own: the kit
serves a manifest, icons and a service worker, and adds the tags to the
pages. `WebApp::without_pwa()` opts out.

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
  mode, colours, icons 192, 512 and a maskable 512), `/sw.js`
  (`Cache-Control: no-cache`, scope `/`), `/pwa/icon-{180,192,512,maskable-512}.png`,
  `/pwa/offline` and `/pwa/offline.js`. The browser fetches these without a
  session, and a worker is installed before any login. Nothing else becomes
  public; the app and its files still ask for the login.
- **Tags.** Every HTML page gets `<link rel="manifest">`, `<meta
  name="theme-color">` and an `apple-touch-icon` before `</head>`; a tag the
  page already has is skipped. The kit's login page links the manifest too, so
  an installed app can sign in. The worker is registered by
  `webapp-runtime.js`, so the CSP stays `script-src 'self'`, and only on a page
  that links the manifest.
- **Own icons.** Put PNG files in the web app at `pwa/icon-180.png`,
  `pwa/icon-192.png`, `pwa/icon-512.png` and `pwa/icon-maskable-512.png`
  (the maskable one needs its artwork inside the central 60 %, the rest is
  cropped). Each file you supply replaces the generated one, independently;
  a file that is not a PNG is ignored. Without them the kit draws the brand's
  first letter on the theme colour (generated at start, no image library).
- **The worker never serves a stale page.** Network first for pages, scripts,
  styles and other same-origin GETs: the cache is used only when the network
  fails. Never handled: `/api`, `/login`, `/logout`, non-GET requests and range
  requests. Never stored: anything but a plain 200 of this origin (no 303, no
  opaque answer, nothing reached through a redirect such as the login page,
  no event stream, no `Cache-Control: no-store`). The cache is named after the
  kit's asset version and the web app's own build (a hash of its files), so
  a release drops the old caches when its worker activates; at most 200 entries
  are kept. An offline navigation without a stored copy shows a small offline
  page that retries by itself.
- **Updates.** The worker activates at once (`skipWaiting`, `clients.claim`)
  and tells open pages; a page that was already controlled reloads once per
  release (remembered in `sessionStorage`), so there is no reload loop.
- **Conditions.** Only an app at the root (`.at("/x")` has no scope to claim)
  and with the kit runtime (`without_kit_runtime()` also leaves the install
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
action is the app's own route; the kit adds nothing behind it.

The service worker never handles a request that asks for
`text/event-stream`, so a live channel mounted anywhere stays a direct
connection.

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
