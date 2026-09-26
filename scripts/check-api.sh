#!/usr/bin/env bash
# feat-api-1: the kit's public surface, compared against what is recorded.
#
# A change to the shape of a public item is invisible here until a consumer
# compiles, and that is after the release — the four consumers live in their
# own repositories. This prints the surface and diffs it against
# docs/API_SURFACE.txt, so a change has to be acknowledged by updating the
# record in the same commit that makes it.
#
# Kenny, 2026-09-10: this runs LOCALLY and never at a commit. It is a step in
# the gates a person starts and a precondition of scripts/release-kit.sh; the
# commit hook stays fast.
#
# Since 2.0.0 (Kenny, 2026-09-10, after the chain refused a mislabelled minor)
# the record is a CONTRACT, frozen for the life of a major. Comparing is no
# longer enough: `scripts/contract_check.py` judges each difference, and the
# generator records `[sealed]` so it can tell a field that cannot be felt from
# one that breaks every caller. See CF-15.
#
# It also holds the transition window (feat-api-2): every `#[deprecated]` item
# has a row in docs/REMOVALS.md naming the major it goes at, and every row still
# points at an item that exists. Both halves run here, and the exit status is
# red when either is.
#
#   scripts/check-api.sh                compare against the contract, report
#   scripts/check-api.sh --for 1.9.1    judge as that release would
#   scripts/check-api.sh --write        re-freeze (a major, or the first time)
#   scripts/check-api.sh --ci           judge as the next release would (CI)
#
# --ci (Kenny, 2026-09-26, dev-procedure api-stability): CI fails when the
# surface changes in a way a caller can feel while nothing declares a major.
# A planned major is declared by a `## [X.0.0]` section at the top of
# CHANGELOG.md, the same section release-kit.sh already requires with its
# ### Migration. Any other state is judged as the next patch, which allows
# additive items and refuses breaking ones. This is CI, not the commit hook:
# the 2026-09-10 decision that commits stay fast still holds.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

record="docs/API_SURFACE.txt"
current="$(mktemp)"
deprecated="$(mktemp)"
trap 'rm -f "$current" "$deprecated"' EXIT

cargo run -q -p chassis-cli --example api_snapshot -- crates/chassis/src chassis > "$current"
cargo run -q -p chassis-cli --example api_snapshot -- crates/chassis/src chassis --deprecated > "$deprecated"

if [ "${1:-}" = "--write" ]; then
  # The contract carries its own identity: one line a release note or a
  # consumer's report can quote without reproducing 800 of them. It is not
  # what the judging uses — a hash says the contract moved and nothing more
  # (Kenny asked; measured 2026-09-10: 20 full comparisons take 13 ms and 20
  # hashes take 24 ms, so there was no speed to win either).
  id=$(python3 scripts/contract_check.py --hash "$current" | cut -c1-16)
  { echo "# contract identity: sha256:$id"; cat "$current"; } > "$record"
  trap - EXIT
  echo "froze $(grep -vc '^#' "$record") items as sha256:$id"
  exit 0
fi

if [ ! -f "$record" ]; then
  echo "no $record yet; run scripts/check-api.sh --write once and commit it" >&2
  exit 1
fi

# Without a version there is nothing to judge against, so the report is what a
# person reads while developing; with one it is the release gate.
version="${2:-0.0.1}"
[ "${1:-}" = "--for" ] || version="0.0.1"
if [ "${1:-}" = "--ci" ]; then
  current_version="$(grep -m1 '^version = ' crates/chassis/Cargo.toml | cut -d'"' -f2)"
  declared="$(grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | tr -d '#[] ' || true)"
  if [ -n "$declared" ] && [ "$declared" != "$current_version" ] && [ "${declared#*.}" = "0.0" ]; then
    version="$declared"
    echo "contract: CHANGELOG.md declares $version, judged as that major"
  else
    IFS=. read -r ma mi pa <<< "$current_version"
    version="$ma.$mi.$((pa + 1))"
    echo "contract: no major declared after $current_version, judged as $version"
  fi
fi

# Both checks always run, and both are reported: stopping at the first would
# hide the second until the first is fixed, and a release has to see all of it.
status=0
python3 scripts/contract_check.py "$record" "$current" "$version" || status=1
python3 scripts/removals_check.py docs/REMOVALS.md "$deprecated" "$version" || status=1
exit "$status"
