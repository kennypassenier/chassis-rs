#!/usr/bin/env bash
# Project quality gates for chassis-rs (Kenny's Q9, 2026-09-05): format,
# clippy with warnings as errors, the full test suite across the
# workspace, and the clean-tree check. Called by .githooks/pre-commit for
# every commit and by .claude/hooks/check-commit.sh before Claude's
# commits; non-zero exit blocks the commit. cargo-deny runs in CI only.
set -euo pipefail

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

cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features

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
