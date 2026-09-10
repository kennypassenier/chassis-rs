#!/usr/bin/env bash
# Prove the projects that build on this kit before releasing it
# (standing rule 46, Kenny 2026-09-09).
#
# His words for the shape he wants: release the kit, bump the dependency
# in the consumers, everything works. Today nothing checks that. The four
# consumers depend on a git TAG rather than a version, nothing guards the
# public surface, and this repository's workflow names no consumer at all
# — so a release can go out without knowing whether anything downstream
# still builds.
#
# Two layers, both local, because that was Kenny's condition: it runs on
# his machine and it does not fire on every commit.
#
#   source    each consumer is compiled and tested against the WORKING
#             TREE of this kit, patched in with cargo's own --config
#             override. This answers "does the API still fit", which is a
#             source question and needs nothing but this machine.
#
#             That override DOES rewrite the consumer's Cargo.lock: the
#             patched kit resolves to a path, so cargo drops the
#             `source = "git+..."` line from the lock in their working
#             tree. The comment here used to promise that no consumer file
#             was touched, and it was wrong — http-switchboard reported the
#             disappearing line as a nameless defect on 2026-09-10 and it
#             was this script twice over (CF-18). Every lockfile is saved
#             before the run and restored after, including when a check
#             fails or the script is interrupted, so a consumer's tree is
#             exactly as it was.
#
#   runtime   with --image, each consumer's container is built. That
#             matters because the machine here runs glibc 2.44 while the
#             LXC containers run Debian trixie — a binary built on the
#             host would not be the binary that ships. The Dockerfiles
#             already build inside rust:1.97-slim-trixie, so the image
#             build is the honest runtime check and it is local too.
#
#   scripts/check-consumers.sh [--image]
#
# CONSUMER_ROOT overrides where consumers are looked for.
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
consumer_root="${CONSUMER_ROOT:-$(dirname "$root")}"
crate="$root/crates/chassis"
with_image=0
[ "${1:-}" = "--image" ] && with_image=1

# Discovered, never hardcoded: a list in this file would go stale the
# first time a project is added or retired.
mapfile -t consumers < <(
  grep -ls '^chassis = .*chassis-rs' "$consumer_root"/*/Cargo.toml 2>/dev/null \
    | xargs -r -n1 dirname | grep -v "^$root$" | sort
)

if [ "${#consumers[@]}" -eq 0 ]; then
  echo "check-consumers: no project depends on this kit under $consumer_root" >&2
  exit 0
fi

patch="patch.\"https://github.com/kennypassenier/chassis-rs\".chassis.path=\"$crate\""
failed=0

# CF-18: the lockfiles are this script's only write into another project, so
# they are put back no matter how it ends — a failing consumer, a Ctrl-C, or
# the release script stopping on the contract check.
declare -A saved=()
restore_locks() {
  for d in "${!saved[@]}"; do
    [ -f "${saved[$d]}" ] && cp -p "${saved[$d]}" "$d/Cargo.lock"
    rm -f "${saved[$d]}"
  done
}
trap restore_locks EXIT INT TERM

for dir in "${consumers[@]}"; do
  if [ -f "$dir/Cargo.lock" ]; then
    saved[$dir]="$(mktemp)"
    cp -p "$dir/Cargo.lock" "${saved[$dir]}"
  fi
  name="$(basename "$dir")"
  printf '%-22s ' "$name"
  if out=$(cd "$dir" && cargo test --quiet --config "$patch" 2>&1); then
    printf 'source ok'
  else
    printf 'SOURCE FAILED'
    failed=$((failed + 1))
    printf '\n%s\n' "$out" | tail -15 | sed 's/^/    /'
    continue
  fi
  if [ "$with_image" = 1 ]; then
    if [ -f "$dir/Dockerfile" ]; then
      if (cd "$dir" && docker build -q -t "check-consumers/$name:local" . >/dev/null 2>&1); then
        printf '  ·  image ok'
      else
        printf '  ·  IMAGE FAILED'
        failed=$((failed + 1))
      fi
    else
      printf '  ·  no Dockerfile'
    fi
  fi
  printf '\n'
done

if [ "$failed" -gt 0 ]; then
  echo "check-consumers: $failed consumer check(s) failed — do not release" >&2
  exit 1
fi
echo "check-consumers: ${#consumers[@]} consumer(s) build and pass against this working tree"
