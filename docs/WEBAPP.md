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
  (`/static/kp/dist/kp-themes.css`, `/static/kp/js/…`). With `webapp` that
  is the whole framework-free module set of the vendored release (the
  wizard, the data table, the palette, the date picker, `auto.js`, …), not
  only the modules the kit's own pages use; without it those modules are
  not in the binary.
- **Refusals at start and `--check`.** A mount that starts with one of the
  kit's routes (`/status`, `/login`, `/logout`, `/static`, `/api`,
  `/clients`, `/passkeys`, `/healthz`, `/readyz`, `/metrics`); an embedded
  app without `index.html`; a directory without `index.html`.

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
  "order", "nav", "source": "kit"|"app", "render": "kit"|"app"}]}`, sorted.
  A web app renders its navigation from the pages with `nav: true`.
- **One bar on every page: `app.kit_pages_in_webapp()`.** The web app (at
  the root) draws the kit's pages too, inside its own bar. The kit then
  claims no GET page at `/status`, `/clients` or `/passkeys`, so the app's
  fallback serves them, and their registry entries say `render: "app"`.
  The data comes from `GET /api/kit/status`, `/api/kit/clients` and
  `/api/kit/passkeys` (behind the login, `no-cache`, exactly what the kit's
  templates render); every action stays the kit's existing endpoint
  (`/api/clients…`, `/passkeys/register/start|finish`, `/api/passkeys/{id}`,
  `POST /logout`). A service without a web app keeps the kit's layout.
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
