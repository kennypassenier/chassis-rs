#!/usr/bin/env bash
# Build and sign a DRILL release of the example service (H1, K18–K21) and
# serve it over HTTP so a scratch LXC can run the live update drills:
# supervised swap, autonomous rollback, broken-after-ready.
#
#   scripts/drill-release.sh 0.1.1                 # sign with $MINISIGN_KEY (Kenny's key, password prompt)
#   scripts/drill-release.sh 0.1.1 --drill-key     # sign with a password-less drill key (A1, AFK run)
#   scripts/drill-release.sh 0.1.1 --serve 9000    # ... and serve dist/ on http://<pc>:9000/
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
while [ $# -gt 0 ]; do
  case "$1" in
    --drill-key) drill_key=true ;;
    --serve) serve_port="${2:?--serve needs a port}"; shift ;;
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

echo "== building $asset $version for Debian trixie (glibc) in docker"
# The version the binary reports must be the version the release claims:
# patch it into a scratch copy of the example's Cargo.toml for this build.
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
cp -r "$root/Cargo.toml" "$root/Cargo.lock" "$root/rust-toolchain.toml" "$root/crates" "$root/examples" "$root/scaffold" "$work/" 2>/dev/null || true
sed -i -E "0,/^version = \"[0-9.]+\"/s//version = \"$version\"/" "$work/examples/inbox/Cargo.toml"
toolchain=$(sed -nE 's/^channel = "([0-9.]+)"/\1/p' "$root/rust-toolchain.toml")
docker run --rm -v "$work":/w -w /w -e CARGO_TARGET_DIR=/w/target-trixie -e CARGO_HOME=/w/target-trixie/cargo-home "rust:${toolchain}-slim-trixie" \
  sh -c 'apt-get update -qq >/dev/null && apt-get install -y -qq pkg-config libssl-dev >/dev/null && cargo build --release --locked -p inbox' >/dev/null
cp "$work/target-trixie/release/$asset" "$dist/$asset"
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
