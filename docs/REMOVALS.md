# Removals — the transition window (feat-api-2)

A shape that is replaced does not disappear the moment the new one exists:
it stands beside it, marked `#[deprecated]`, and this file says when it
goes. Standing rule 46 gives the window its length — the recorded surface
is a contract frozen for the life of a major, so a deprecated item can only
be removed at the next major, never in a minor.

Every row is checked at every release by `scripts/check-api.sh`, which
compares this table with the `#[deprecated]` attributes the compiler
actually sees:

- a deprecation missing from this table refuses the release — a window
  nobody wrote down is a surprise removal waiting to happen;
- a row whose item is no longer in the code refuses it too, so this file
  can never promise to remove something already gone;
- `Since` must match the attribute, and `Goes at` must be a major above
  the version being released.

Removing a row is part of the commit that removes the item.

| Item | Since | Goes at | Replaced by |
|---|---|---|---|
| `chassis::core::clients::ClientsFile::issue` | 2.0.0 | 3.0.0 | `issue_with_fields`, which carries the project's declared client fields |

## Nothing has been removed yet

The table above is the whole history: 2.0.0 is the first major with a
deprecation in it. When 3.0.0 lands, the items it removes move into a
dated section here with the commit that removed them, so a consumer
reading this file sees both what is going and what already went.
