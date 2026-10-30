# Homelab shared pieces (homelab-shared)

What chassis-rs offers so the homelab project stops carrying its own copies.
Each section says what homelab has, what chassis lacked, and what was added.

## C. Tokens with scopes

Homelab host tokens: `[[tokens]] {name, scope, sha256}` in host.toml; only the
SHA-256 of the token is stored; issue and revoke rewrite the file and take
effect without a restart; a failed-auth counter (count, last peer, last time)
feeds doctor.

`core::clients` (what chassis has):

| Topic | homelab | chassis |
|---|---|---|
| Token at rest | SHA-256 only, token shown once | the token itself, encrypted (sealed by `core::crypto`), so the dashboard can reveal and copy it (K12) |
| Scope | `read` / `operate` / `all` per token | none before this change |
| Issue / revoke without a restart | yes | yes (in-memory snapshot, persisted) |
| Constant-time compare | yes, over digests | yes, `ct_eq` over every active token |
| Failed-auth counter | yes | none |

Added (additive): a scope is the declared client field `scope`
(`SCOPE_FIELD`). `Client::scope()`, `Client::has_scope_in(&[..])` and
`ClientsFile::issue_scoped()` read and write it. The field is persisted by the
existing `fields` column, so there is no store migration. A client without a
scope is allowed nothing. A bearer request resolves to `Caller::Client { id, .. }`;
homelab looks the scope up with `state.clients.snapshot().get(id)`.

Not added, decided: hashed-only storage conflicts with the revealable token the
dashboard promises (K12); homelab keeps showing a token once, so the kit's
revealable token is a superset it may simply not display. A failed-auth
counter is a separate feature (it needs a place in `identify`); it is left for
homelab to ask for with its own consumer report.
