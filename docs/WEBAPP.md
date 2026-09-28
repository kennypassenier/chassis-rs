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

app.webapp(WebApp::embedded(FILES));            // served under /app/
// app.webapp(WebApp::dir("web").at("/admin")); // from disk while developing
```

- **Login.** The app sits behind the same admin login as the kit's pages:
  a browser without a session is redirected to `/login`, a script sending a
  wrong bearer gets a 401. After logging in the browser lands on `/`; add
  `app.nav_entry("App", "/app/")` for a link in the kit's navigation.
- **Routing.** `/app` redirects to `/app/`. A path whose last segment has no
  extension and matches no file answers `index.html`, so the app's own
  router handles `/app/stacks/media`. A missing file with an extension
  (`/app/js/gone.js`) is a 404, never HTML.
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
- **Refusals at start and `--check`.** A mount that is `/` or starts with
  one of the kit's routes (`/login`, `/logout`, `/static`, `/api`,
  `/clients`, `/passkeys`, `/healthz`, `/metrics`); an embedded app without
  `index.html`; a directory without `index.html`.
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
