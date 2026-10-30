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

## B. Install with `.prev` and roll back

Homelab's `install_binary` (client/release.rs) is a plain write + rename with
no `.prev`; its host and native-service installs keep a `.prev` by their own
code. chassis had the hard-link + rename mechanism, but only inside `Updater`
and only for the running binary. It now lives in `chassis::shell::install_binary`
(`install_binary`, `rollback_binary`, `prev_path`) for any path, and `Updater`
calls it.

## A. Release verification

Compared with homelab `core/src/release_sig.rs` (`verify_release`) and
`client/src/release.rs` (`sha_listed`, `stage_asset_proven`):

| Check | homelab | chassis before | now |
|---|---|---|---|
| Missing/blank `SHA256SUMS.minisig` refused as "not signed" | yes | a blank signature read as "malformed" | `ReleaseError::NotSigned` |
| Signature over SHA256SUMS before any hash | yes | yes (`verify_signature`) | same |
| Asset listed with the matching hash, `*name`, any hash case | yes | `hash_for` + `hash_matches` (first line for the name) | `NotListed` / `HashMismatch`, separate |
| Trusted comment bound to repo and version | no | only inside `Updater` | `verify_release_asset_for` |
| Proof recording per installed binary (`record_proof`, `running_verdict`) | yes (host state) | none | not added: homelab policy about its state dir, built on `verify_release_asset` |
| Pre-release tolerant `version_newer` | yes | `Version::parse` refuses suffixes ("a release is a release") | not changed |

`chassis::shell::release_verify::verify_release_asset` is the single call.
