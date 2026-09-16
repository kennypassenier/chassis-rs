#!/usr/bin/env bash
# Project quality gates for chassis-rs (Kenny's Q9, 2026-09-05): format,
# clippy with warnings as errors, the full test suite across the
# workspace, and the clean-tree check. Called by .githooks/pre-commit for
# every commit and by .claude/hooks/check-commit.sh before Claude's
# commits; non-zero exit blocks the commit. cargo-deny runs in CI only.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Git exports GIT_DIR (absolute in a linked worktree), GIT_INDEX_FILE and
# friends to this hook. The suite below spawns git itself (the scaffold E2E
# runs `chassis new`, which inits and commits a fresh repository); a child
# inheriting them acts on THIS repository instead — the first commit from a
# worktree under .claude/worktrees/ put the scaffold on the committer's
# branch (2026-09-07). The toplevel is resolved above, so drop them here.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR

# ── Standing rule 7: a gate that does not predict the build is not a gate ──
# The checks below rewrite files (cargo refreshes Cargo.lock). Anything
# rewritten AFTER `git add` is green here and absent from the commit, so
# the tree is fingerprinted before and after and a moved tree is refused.
gate_tree_fingerprint() {
  { git status --porcelain; git diff; } | sha256sum | cut -d' ' -f1
}
gate_tree_before=$(gate_tree_fingerprint)

# Kenny, 2026-09-16 (commit-floor and rust-suite). Format and lint always
# run: measured at 0.19 s and 0.21 s here, which is cheaper than deciding
# whether to run them. The test suite is 9.35 s of the 9.3 s gate — that
# is execution, not compilation, since clippy finishes in a fifth of a
# second — and it is skipped when no Rust source moved. Measured over the
# last 150 commits of this repository: 88 of them (58%) touched no .rs
# file at all and paid those 9.35 s for nothing.
#
# Per crate was measured and rejected: `cargo test -p chassis` took 13.0 s
# against 12.6 s for the whole workspace, because cargo runs every test
# binary either way. The axis that pays is whether any Rust changed at
# all, not which crate it was in.
. "$(git rev-parse --show-toplevel)/.githooks/gate-cache.sh"

cargo fmt --all -- --check || exit 1
cargo clippy --workspace --all-targets --all-features -- -D warnings || exit 1
gate_glob suite '*.rs' 'Cargo.toml' 'Cargo.lock' '*/Cargo.toml' -- \
  cargo test --workspace --all-features || exit 1
gate_cache_done

if [ "$(gate_tree_fingerprint)" != "$gate_tree_before" ]; then
  {
    echo "gates: the checks rewrote the working tree while they ran."
    echo "A file changed after it was staged, so what this commit carries is"
    echo "NOT what was just tested. Most often this is cargo refreshing"
    echo "Cargo.lock; the changed paths are listed below."
    echo
    git status --porcelain
    echo
    echo "What now: stage the changed files and commit again."
  } >&2
  exit 1
fi
