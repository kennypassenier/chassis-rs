#!/usr/bin/env bash
# Release the kit itself — the verified publish chain of standing rule 36.
#
# `chassis release` runs this chain for a scaffolded project; the kit is a
# workspace (two crates + the inbox example pinning the crate) without a
# `.chassis.toml`, so it has its own script. Every step asserts its
# postcondition before the next one runs — CF-5 (2026-09-05) is why: a
# blocked commit went unnoticed and tag + release landed on the wrong SHA.
#
#   scripts/release-kit.sh 1.4.0
#
# Preconditions: on main, clean tree, CHANGELOG.md has a `## [X.Y.Z]`
# section. The kit publishes no binary, so there is nothing to sign.
set -euo pipefail
version="${1:?usage: scripts/release-kit.sh <version>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
repo="kennypassenier/chassis-rs"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "release-kit: not on main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "release-kit: working tree not clean"; exit 1; }
grep -q "^## \[$version\]" CHANGELOG.md || { echo "release-kit: CHANGELOG.md has no ## [$version] section"; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "release-kit: local main is not origin/main"; exit 1; }

current="$(grep -m1 '^version = ' crates/chassis/Cargo.toml | cut -d'"' -f2)"
echo "release-kit: $current -> $version"
sed -i "s/^version = \"$current\"/version = \"$version\"/" crates/chassis/Cargo.toml crates/chassis-cli/Cargo.toml
sed -i "s/version = \"$current\", default-features = false/version = \"$version\", default-features = false/" crates/chassis-cli/Cargo.toml
sed -i "s|crates/chassis\", version = \"$current\"|crates/chassis\", version = \"$version\"|" examples/inbox/Cargo.toml
cargo update -w --offline >/dev/null 2>&1 || cargo update -w >/dev/null
grep -q "^version = \"$version\"" crates/chassis/Cargo.toml || { echo "release-kit: bump did not apply"; exit 1; }

before="$(git rev-parse HEAD)"
git add CHANGELOG.md Cargo.lock crates/chassis/Cargo.toml crates/chassis-cli/Cargo.toml examples/inbox/Cargo.toml
git commit -q -m "chore(release): $version [meta]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
after="$(git rev-parse HEAD)"
[ "$after" != "$before" ] || { echo "release-kit: the commit did not happen (gate blocked it?)"; exit 1; }
git show --stat --oneline HEAD | grep -q 'crates/chassis/Cargo.toml' || { echo "release-kit: the release commit does not touch the crate manifest"; exit 1; }

branch="release-$version"
git push -q origin "HEAD:refs/heads/$branch"
echo "release-kit: pushed $after as $branch; waiting for its checks (rule 6b: by SHA)"
deadline=$((SECONDS + 1500))
while :; do
  json="$(gh api "repos/$repo/commits/$after/check-runs" --jq '[.check_runs[] | {status, conclusion}]' 2>/dev/null || echo '[]')"
  total="$(echo "$json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
  done_ok="$(echo "$json" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(int(bool(r) and all(x["status"]=="completed" and x["conclusion"]=="success" for x in r)))')"
  failed="$(echo "$json" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(int(any(x["status"]=="completed" and x["conclusion"] not in ("success",None) for x in r)))')"
  if [ "$failed" = "1" ]; then echo "release-kit: a check failed on $after — nothing published"; exit 1; fi
  if [ "$total" -gt 0 ] && [ "$done_ok" = "1" ]; then break; fi
  [ $SECONDS -lt $deadline ] || { echo "release-kit: checks did not finish in time"; exit 1; }
  sleep 30
done
echo "release-kit: checks green"

git push -q origin "HEAD:main"
git fetch -q origin main
[ "$(git rev-parse origin/main)" = "$after" ] || { echo "release-kit: origin/main is not the release commit"; exit 1; }
git push -q origin --delete "$branch" || true
git tag -a "v$version" "$after" -m "chassis-rs $version"
git push -q origin "v$version"
[ "$(git ls-remote --tags origin "v$version^{}" | cut -f1)" = "$after" ] || { echo "release-kit: the remote tag does not point at the release commit"; exit 1; }
notes="$(awk -v v="$version" '$0 ~ "^## \\["v"\\]" {p=1; next} /^## \[/ {p=0} p' CHANGELOG.md)"
gh release create "v$version" --title "chassis-rs $version" --notes "$notes" >/dev/null
echo "release-kit: released v$version at $after — $(gh release view "v$version" --json url --jq .url)"
