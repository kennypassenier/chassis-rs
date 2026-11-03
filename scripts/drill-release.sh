#!/usr/bin/env bash
# Build and sign a DRILL release of the example service (H1, K18–K21) and
# serve it over HTTP so a scratch LXC can run the live update drills:
# supervised swap, autonomous rollback, broken-after-ready.
#
#   scripts/drill-release.sh 0.1.1                 # sign with $MINISIGN_KEY (Kenny's key, password prompt)
#   scripts/drill-release.sh 0.1.1 --drill-key     # sign with a password-less drill key (A1, AFK run)
#   scripts/drill-release.sh 0.1.1 --serve 9000    # ... and serve dist/ on http://<pc>:9000/
#   scripts/drill-release.sh 0.1.1 --build glibc   # force the target (musl | glibc)
#
# The drill builds what `chassis release` would ship, so the target follows
# the project the same way: `[release] build` in .chassis.toml ("musl" is the
# default, "glibc" uses [release] glibc_image or rust:<toolchain>-slim-bookworm).
# This repository has no .chassis.toml, and the inbox example enables
# `passkeys` (OpenSSL, which a static musl build cannot link), so without a
# record or --build it falls back to glibc for that feature and musl otherwise.
#
# The trusted comment is "<repo> v<version>" exactly as scaffold/scripts/
# sign-release.sh writes it, because the kit binds the signature to the
# version (S1). With --drill-key the target service needs
#   <P>_UPDATE_PUBKEY=<contents of the drill key's .pub, base64 line>
#   <P>_UPDATE_ALLOW_INSECURE=true       (the PC serves plain http)
# and the update card then says "TRUST ROOT OVERRIDDEN", on purpose.
set -euo pipefail

version="${1:?usage: drill-release.sh X.Y.Z [--drill-key] [--serve PORT]}"
shift
repo="kennypassenier/chassis-rs"
asset="inbox"
drill_key=false
serve_port=""
build=""
while [ $# -gt 0 ]; do
  case "$1" in
    --drill-key) drill_key=true ;;
    --serve) serve_port="${2:?--serve needs a port}"; shift ;;
    --build) build="${2:?--build needs musl or glibc}"; shift ;;
    *) echo "unknown argument $1. What now: see the header of this script" >&2; exit 1 ;;
  esac
  shift
done

root=$(cd "$(dirname "$0")/.." && pwd)
dist="$root/dist/drill-$version"
mkdir -p "$dist"
for tool in docker minisign sha256sum; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed. What now: install it, then rerun." >&2; exit 1; }
done

# `[release] build` from a project record, as release_config.rs reads it:
# the first `build = "..."` line under a `[release]` table.
record_build() {
  [ -f "$1" ] || return 0
  sed -n '/^\[release\]/,/^\[/{s/^build *= *"\(musl\|glibc\)".*/\1/p}' "$1" | head -1
}
record_glibc_image() {
  [ -f "$1" ] || return 0
  sed -n '/^\[release\]/,/^\[/{s/^glibc_image *= *"\([^"]*\)".*/\1/p}' "$1" | head -1
}
record="$root/.chassis.toml"
if [ -z "$build" ]; then
  build=$(record_build "$record")
fi
if [ -z "$build" ]; then
  if grep -q '"passkeys"' "$root/examples/$asset/Cargo.toml"; then build=glibc; else build=musl; fi
fi
case "$build" in
  musl|glibc) ;;
  *) echo "unknown build target '$build'. What now: use musl or glibc." >&2; exit 1 ;;
esac

echo "== building $asset $version ($build) in docker"
# The version the binary reports must be the version the release claims:
# patch it into a scratch copy of the example's Cargo.toml for this build.
work=$(mktemp -d); trap 'rm -rf "$work" 2>/dev/null || true' EXIT
cp -r "$root/Cargo.toml" "$root/Cargo.lock" "$root/rust-toolchain.toml" "$root/crates" "$root/examples" "$root/scaffold" "$work/" 2>/dev/null || true
sed -i -E "0,/^version = \"[0-9.]+\"/s//version = \"$version\"/" "$work/examples/inbox/Cargo.toml"
toolchain=$(sed -nE 's/^channel = "([0-9.]+)"/\1/p' "$root/rust-toolchain.toml")
user=(--user "$(id -u):$(id -g)" -e HOME=/tmp)
if [ "$build" = musl ]; then
  # The static build, as `chassis release` runs it (release/build_args.rs):
  # root inside the container for apt, then a chown back to the caller.
  target_dir=target-musl
  built="$work/$target_dir/x86_64-unknown-linux-musl/release/$asset"
  # The lockfile is refreshed for the bumped version (only that line moves).
  docker run --rm -v "$work":/w -w /w -e CARGO_TARGET_DIR=/w/$target_dir -e CARGO_HOME=/w/$target_dir/cargo-home \
    "rust:${toolchain}-slim-trixie" sh -c "apt-get update -qq >/dev/null && apt-get install -y -qq musl-tools >/dev/null \
      && cargo update -q -p inbox && cargo build --release --locked --target x86_64-unknown-linux-musl -p inbox 2>&1 | tail -2; \
      status=\$?; chown -R $(id -u):$(id -g) /w; exit \$status" || {
    echo "docker build failed. What now: read the lines above; the work copy is $work" >&2; exit 1; }
else
  target_dir=target-glibc
  built="$work/$target_dir/release/$asset"
  image=$(record_glibc_image "$record")
  image="${image:-rust:${toolchain}-slim-bookworm}"
  # One builder image (the chosen rust image + pkg-config + libssl-dev) so
  # cargo can run as the caller: the work copy stays removable and nothing
  # is root-owned.
  builder="chassis-drill-builder:$(printf '%s' "$image" | tr -c 'A-Za-z0-9.\n' '-')"
  if ! docker image inspect "$builder" >/dev/null 2>&1; then
    printf 'FROM %s\nRUN apt-get update -qq && apt-get install -y -qq --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*\n' "$image" \
      | docker build -q -t "$builder" - >/dev/null
  fi
  docker run --rm "${user[@]}" -v "$work":/w -w /w \
    -e CARGO_TARGET_DIR=/w/$target_dir -e CARGO_HOME=/w/$target_dir/cargo-home "$builder" \
    sh -c 'cargo update -q -p inbox && cargo build --release --locked -p inbox 2>&1 | tail -2' || {
    echo "docker build failed. What now: read the lines above; the work copy is $work" >&2; exit 1; }
fi
cp "$built" "$dist/$asset"
if [ "$build" = musl ] && ldd "$dist/$asset" 2>&1 | grep -q '=>'; then
  echo "the musl binary links dynamically. What now: a dependency (passkeys pulls OpenSSL) needs --build glibc." >&2; exit 1
fi
"$dist/$asset" --version | grep -q " $version\$" || { echo "the built binary does not report $version. What now: check the sed above." >&2; exit 1; }

echo "== manifest"
(cd "$dist" && sha256sum "$asset" > SHA256SUMS && cat SHA256SUMS)
printf '%s\n' "$version" > "$dist/VERSION"

if $drill_key; then
  key="$root/dist/drill-minisign.key"
  pub="$root/dist/drill-minisign.pub"
  if [ ! -f "$key" ]; then
    echo "== generating a password-less DRILL key (never for production)"
    minisign -G -W -s "$key" -p "$pub" -c "chassis-rs drill key (not the ecosystem key)" >/dev/null
  fi
  echo "== signing with the drill key; the service must trust it via UPDATE_PUBKEY:"
  tail -1 "$pub"
else
  key="${MINISIGN_KEY:-$HOME/.minisign/minisign.key}"
  [ -f "$key" ] || { echo "no minisign secret key at $key. What now: set MINISIGN_KEY, or use --drill-key." >&2; exit 1; }
  echo "== signing with $key (password prompt)"
fi
rm -f "$dist/SHA256SUMS.minisig"
minisign -S -s "$key" -m "$dist/SHA256SUMS" -x "$dist/SHA256SUMS.minisig" -t "$repo v$version"
minisign -V -p "${pub:-$HOME/.minisign/minisign.pub}" -m "$dist/SHA256SUMS" -x "$dist/SHA256SUMS.minisig" >/dev/null && echo "== signature verifies"
echo "== release directory: $dist"
ls -la "$dist"

if [ -n "$serve_port" ]; then
  echo "== serving $dist on port $serve_port (Ctrl-C to stop); on the LXC:"
  echo "   <P>_UPDATE_URL=http://<this pc>:$serve_port <P>_UPDATE_ALLOW_INSECURE=true inbox update"
  (cd "$dist" && python3 -m http.server "$serve_port" --bind 0.0.0.0)
fi
