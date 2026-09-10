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
# The kit held its consumers to a rule it did not apply to itself: `chassis
# release` refuses a major bump without a Migration section, and this script
# did not. Found while turning 1.9.0 into 2.0.0 (CF-15) — the rule is written
# at the top of CHANGELOG.md and is the reason a consumer can trust a minor.
case "$version" in
  *.0.0)
    # No `| grep -q` here: grep leaves on its first match, awk takes SIGPIPE,
    # and `set -o pipefail` then calls the whole pipeline failed — the check
    # refused a CHANGELOG that did carry the section. Read the section into a
    # variable and match on it instead.
    section=$(awk -v v="## [$version]" 'index($0, v) == 1 {inside=1; next} /^## \[/ {inside=0} inside' CHANGELOG.md)
    case "$section" in
      *"### Migration"*) ;;
      *) echo "release-kit: $version is a major and its CHANGELOG section has no ### Migration."
         echo "What now: write what a consumer has to change, with the before and after, under ## [$version]."
         exit 1 ;;
    esac
    ;;
esac
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "release-kit: local main is not origin/main"; exit 1; }

# Standing rule 46: the kit proves its consumers before it releases. A
# precondition, so nothing is committed, tagged or published if a project
# downstream stops building. Local by Kenny's condition (2026-09-09) — it
# runs here, never on a commit. Pass --image to also build each consumer's
# container, which is where the Debian-versus-Arch question is answered:
# the Dockerfiles build inside rust:1.97-slim-trixie, so that artifact is
# the one that ships.
# Kenny, 2026-09-10: a red consumer NEVER blocks. Their pins are fixed tags —
# measured that day, all seven chassis dependency lines across the four — so a
# new tag reaches nobody until they move it themselves. Holding the kit until
# four other projects have time is what a major version number exists to
# avoid. What a failure IS: the measured list of what a consumer will have to
# change, which belongs in the Migration section. The contract check below is
# what refuses a release.
if ! "$root/scripts/check-consumers.sh" ${CHECK_CONSUMERS_ARGS:-}; then
  echo
  echo "release-kit: consumers above did not build against this tree."
  case "$version" in
    *.0.0) echo "release-kit: $version is a major, so this is expected — check that each"
           echo "             failing consumer is named in the ### Migration section." ;;
    *)     echo "release-kit: $version is NOT a major. The contract check below decides,"
           echo "             but read those failures first: they are what a consumer feels." ;;
  esac
  echo
fi

# Standing rule 46, the second third (feat-api-1): the public surface is
# compared against what is recorded, so a shape change cannot ride out in a
# release nobody marked as breaking. A consumer compiles against these lines
# and lives in another repository, so this is the only place left to notice.
# Local as well, never on a commit.
# The contract is what refuses a release now, not the consumers. For a major
# it re-freezes; for anything else every recorded line must still be there and
# a new one is only allowed when a caller cannot feel it (CF-15).
"$root/scripts/check-api.sh" --for "$version" || {
  echo "release-kit: the contract refuses $version; nothing released" >&2
  exit 1
}

current="$(grep -m1 '^version = ' crates/chassis/Cargo.toml | cut -d'"' -f2)"
echo "release-kit: $current -> $version"
sed -i "s/^version = \"$current\"/version = \"$version\"/" crates/chassis/Cargo.toml crates/chassis-cli/Cargo.toml
sed -i "s/version = \"$current\", default-features = false/version = \"$version\", default-features = false/" crates/chassis-cli/Cargo.toml
sed -i "s|crates/chassis\", version = \"$current\"|crates/chassis\", version = \"$version\"|" examples/inbox/Cargo.toml
# Every requirement inside this workspace on the kit moves to the new version,
# not only the ones that happened to equal the old one. A dev-dependency in
# chassis-cli had sat at 1.7.1 since that release and the bump walked past it,
# so `cargo` refused 2.0.0 against a `^1.7.1` requirement (2026-09-10).
sed -i -E "s|(chassis = \{ path = \"\.\./chassis\", version = \")[0-9.]+|\1$version|" crates/chassis-cli/Cargo.toml
cargo update -w --offline >/dev/null 2>&1 || cargo update -w >/dev/null
grep -q "^version = \"$version\"" crates/chassis/Cargo.toml || { echo "release-kit: bump did not apply"; exit 1; }
stale=$(grep -n 'path = "\.\./chassis", version = "' crates/chassis-cli/Cargo.toml | grep -v "\"$version\"" || true)
if [ -n "$stale" ]; then
  echo "release-kit: a requirement on the kit inside this workspace still names another version:"
  printf '%s\n' "$stale"
  echo "What now: they all track the release; fix the line above and rerun."
  exit 1
fi

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
