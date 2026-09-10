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
#   scripts/check-api.sh           compare, exit 1 on a difference
#   scripts/check-api.sh --write   record the current surface
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

record="docs/API_SURFACE.txt"
current="$(mktemp)"
trap 'rm -f "$current"' EXIT

cargo run -q -p chassis-cli --example api_snapshot -- crates/chassis/src chassis > "$current"

if [ "${1:-}" = "--write" ]; then
  mv "$current" "$record"
  trap - EXIT
  echo "recorded $(grep -c '^' "$record") lines in $record"
  exit 0
fi

if [ ! -f "$record" ]; then
  echo "no $record yet; run scripts/check-api.sh --write once and commit it" >&2
  exit 1
fi

if diff -u "$record" "$current" > /dev/null; then
  echo "public surface unchanged ($(grep -vc '^#' "$record") items)"
  exit 0
fi

echo "PUBLIC SURFACE CHANGED — a consumer compiles against these lines." >&2
echo >&2
diff -u "$record" "$current" | sed -n '1,80p' >&2
echo >&2
echo "What now: if this change is intended, say so in the version (a removal" >&2
echo "or a changed signature is a major; a new item is a minor), give the old" >&2
echo "shape one version beside the new one where a consumer would otherwise" >&2
echo "break, and record the new surface with: scripts/check-api.sh --write" >&2
exit 1
