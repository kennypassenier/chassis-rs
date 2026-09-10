# Adopting chassis 2.0.0 — the prompt for almanac and kyu

chassis-rs 2.0.0 is released (tag `v2.0.0`). It is a **major**, and it asks
one change of two of the four consumers. This file is what those two sessions
need; hand it to them as is.

http-switchboard and kyu-runner need nothing: measured on 2026-09-10 with
`grep -rn 'clients::Client' src tests`, neither imports the type.

## When

Whenever it suits you. chassis 2.0.0 is released; your project pins a fixed
tag, so nothing reaches you until you move that pin yourself.

That is a change from what this file said an hour earlier, and the reason is
Kenny's: a foundation may not hold its own release hostage to four other
projects' schedules. Standing rule 46 was rewritten the same evening — the
frozen contract is what refuses a release now, and building the consumers
tells the foundation what a change will cost them rather than forbidding it.

So: bump the pin to `v2.0.0`, make the one change below, and you are done.

## The change

`chassis::core::clients::Client` is now `#[non_exhaustive]`: it can no longer
be built field by field from outside the kit. That is deliberate — it is what
stops the next added field from breaking anyone. Build one with
`Client::adopted(id, name, token, issued_at)` instead; every other field gets
its default, including ones the kit adds later.

**almanac** — `src/shell/kit.rs`, around line 271:

```rust
// before
clients.push(Client {
    id: format!("source-{source_id}"),
    name: source_id,
    token: Some(token),
    issued_at,
    revoked_at: None,
    last_used_at: None,
    uses: 0,
});

// after
clients.push(Client::adopted(
    format!("source-{source_id}"),
    source_id,
    token,
    issued_at,
));
```

**kyu** — `src/kit.rs`, around line 237, the same shape:

```rust
// after
clients.clients.push(Client::adopted(
    format!("app-{}", app.name),
    app.name.clone(),
    app.token.clone(),
    now.clone(),
));
```

## What is NOT affected

Reading a `Client` is unchanged — every field is still public to read. The
on-disk format is unchanged too: a store written by 1.8.0 reads here without
conversion, and `CLIENTS_FORMAT` stays at 2.

## What else 2.0.0 brings you

The full list is in `CHANGELOG.md` under `[2.0.0]`. The two that most likely
touch your own code:

- `chassis::testing::TestApp` starts a real instance for your own tests, and
  its `extra_env` now wins for `token()` and `state_dir()` (CF-12). If you
  hand-wrote a login POST, you can drop it for `TestApp::login()`.
- `update_cmd` in `deploy/service.yml` now reproduces the unit's own
  `Environment=` lines (fix-3). Regenerate that file with `chassis sync
  --write`; a supervised `update --check` was otherwise running against the
  binary's compiled-in default state directory.

Both of those have a measurement waiting on your report, so say in your
adoption report whether they behaved.
