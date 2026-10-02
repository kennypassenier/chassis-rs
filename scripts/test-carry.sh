#!/usr/bin/env bash
# The release's test suite, carried forward instead of rerun from scratch
# (homelab fix-187, ported 2026-10-02). Kenny's question that morning: "are
# we doing double work?" Measured yes: a release whose suite went red once
# ran the whole suite again after a one-test fix (chassis-rs 3.3.0: two full
# runs of ~60 s of scaffold E2E for one assertion).
#
# After every run this records, outside the tree (.git/test-carry/), the
# tree it tested and which tests failed. The next run picks:
#   - nothing to do when the same tree already passed;
#   - the full suite when nothing is recorded, the last run was green on
#     another tree, or what changed since is foundational: the lock file,
#     a Cargo.toml, the toolchain, this script, the gate scripts, or the
#     `chassis` library itself (every other crate in the workspace depends
#     on it, so a change there can break any test);
#   - otherwise only the tests that failed last time plus every test of the
#     crates that changed since, and the tree counts as green when those
#     pass, exactly as the failed run plus the targeted rerun covered it.
# GATE_TESTS_FULL=1 forces the full suite.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
state="$(git rev-parse --git-dir)/test-carry"
mkdir -p "$state"
tree=$(git write-tree 2>/dev/null || git rev-parse 'HEAD^{tree}')
log=$(mktemp)
# Kenny, 2026-10-02: every test run says how long it took, measured.
started=$(date +%s)
took() {
  local s=$(( $(date +%s) - started ))
  if [ "$s" -ge 60 ]; then printf '%d min %d s' $((s / 60)) $((s % 60)); else printf '%d s' "$s"; fi
}
trap 'echo "test-carry: tests took $(took)"; rm -f "$log"' EXIT

record() { # record <green|red> ; failures from $log
  printf '%s\n' "$tree" > "$state/tree"
  printf '%s\n' "$1" > "$state/result"
  grep -E '^test .* \.\.\. FAILED$' "$log" | sed -E 's/^test (.*) \.\.\. FAILED$/\1/' | sort -u > "$state/failed"
}

full() {
  echo "test-carry: full suite ($1)"
  cargo test --workspace --all-features --no-fail-fast 2>&1 | tee "$log"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 0 ]; then record green; else record red; fi
  return "$rc"
}

[ "${GATE_TESTS_FULL:-0}" = 1 ] && { full "GATE_TESTS_FULL=1"; exit $?; }
[ -s "$state/tree" ] || { full "no earlier run recorded"; exit $?; }
last_tree=$(cat "$state/tree"); last=$(cat "$state/result" 2>/dev/null)
if [ "$last_tree" = "$tree" ] && [ "$last" = green ]; then
  echo "test-carry: this tree already passed; nothing to run"
  exit 0
fi
[ "$last" = red ] || { full "the last run was green on another tree"; exit $?; }

changed=$(git diff --name-only "$last_tree" "$tree")
if printf '%s\n' "$changed" | grep -qE '(^|/)Cargo\.(toml|lock)$|^rust-toolchain|^scripts/test-carry\.sh$|^\.githooks/|^\.claude/hooks/|^crates/chassis/'; then
  why=$(printf '%s\n' "$changed" | grep -E '(^|/)Cargo\.(toml|lock)$|^rust-toolchain|^scripts/test-carry\.sh$|^\.githooks/|^\.claude/hooks/|^crates/chassis/' | head -3 | tr '\n' ' ')
  full "foundational change since the red run: $why"
  exit $?
fi

# Targeted: the tests that failed, and every test of a crate that changed.
rc=0
: > "$log"
crates=$(printf '%s\n' "$changed" | sed -nE 's#^crates/([^/]+)/.*#\1#p; s#^examples/([^/]+)/.*#\1#p' | sort -u)
for c in $crates; do
  echo "test-carry: crate $c changed since the red run: its whole suite"
  cargo test -p "$c" --all-features --no-fail-fast 2>&1 | tee -a "$log" || rc=1
done
while IFS= read -r t; do
  [ -n "$t" ] || continue
  echo "test-carry: rerun $t (failed last time)"
  cargo test --workspace --all-features --no-fail-fast -- --exact "$t" 2>&1 | tee -a "$log" || rc=1
done < "$state/failed"
if [ "$rc" -eq 0 ]; then
  echo "test-carry: the failures of the last run pass now; tree recorded green"
  record green
else
  record red
fi
exit "$rc"
