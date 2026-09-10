# Adopting chassis 2.0.0 — the prompt for almanac and kyu

chassis-rs 2.0.0 is a **major**, and it needs one change in two of the four
consumers before it can be released at all. This file is what those two
sessions need; hand it to them as is.

http-switchboard and kyu-runner need nothing: measured on 2026-09-10 with
`grep -rn 'clients::Client' src tests`, neither imports the type.

## Why the order is unusual

The kit's release chain builds all four consumers against its own working
tree before publishing anything (standing rule 46). For a breaking change
that check is red by construction until the consumer's own source changes —
and a session touches only its own project (rule 7a). So:

1. The kit's change is on `main`, unreleased. **(done — `f8fbacf`)**
2. Each affected consumer makes the change below **on a branch**, not merged,
   because `Client::adopted` does not exist in the 1.8.0 they still pin.
3. `scripts/check-consumers.sh` runs against those branches and goes green.
4. The kit releases 2.0.0.
5. Each consumer bumps its pin to `v2.0.0` and merges.

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
