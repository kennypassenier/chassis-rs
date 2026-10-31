#!/usr/bin/env bash
# Vendor one kp-themes release under crates/chassis/static/kp/.
#
#   scripts/vendor-kp-themes.sh 12.0.0
#
# Why a script: every bump used to be done by hand (copy files, rewrite
# KP_THEMES.sha256, bump KP_THEMES_VERSION), and kp-themes 12 splits modules
# into folders, so a hand copy of the facade files alone would ship 404s.
# The embedded asset tables follow static/ by themselves (build.rs), so this
# is the whole bump on the file side.
#
# What is vendored (the rule reproduces the 11.3.0 set exactly, 213 files,
# and gives 1206 for kp-themes main before 12.0.0): dist/kp-themes.css,
# css/fonts.css, everything under fonts/ and
# everything under js/, from the release's consumer.tar and fonts.tar. Every
# file is checked against the release's own SHA256SUMS before anything under
# static/kp/ is touched; a mismatch or a missing line stops the script.
set -euo pipefail

version="${1:?usage: scripts/vendor-kp-themes.sh <version, e.g. 12.0.0>}"
version="${version#v}"
repo="kennypassenier/kp-themes"
root="$(cd "$(dirname "$0")/.." && pwd)"
kp="$root/crates/chassis/static/kp"
manifest="$kp/KP_THEMES.sha256"
assets_rs="$root/crates/chassis/src/shell/assets.rs"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "vendor-kp-themes: downloading v$version"
gh release download "v$version" --repo "$repo" --dir "$work" \
  -p consumer.tar -p fonts.tar -p SHA256SUMS

mkdir -p "$work/tree"
tar -xf "$work/consumer.tar" -C "$work/tree"
tar -xf "$work/fonts.tar" -C "$work/tree"

# The vendored set, by rule.
(cd "$work/tree" && find . -type f | sed 's#^\./##' | sort) |
  grep -E '^(dist/kp-themes\.css|css/fonts\.css|fonts/.+|js/.+)$' > "$work/files"
count=$(wc -l < "$work/files")
[ "$count" -gt 0 ] || { echo "vendor-kp-themes: the rule selected no files" >&2; exit 1; }

# Each selected file must have its line in SHA256SUMS, and match it.
awk 'NR==FNR { want[$0] = 1; next } ($2 in want)' "$work/files" "$work/SHA256SUMS" > "$work/sums"
listed=$(wc -l < "$work/sums")
if [ "$listed" -ne "$count" ]; then
  echo "vendor-kp-themes: $count files selected, only $listed listed in SHA256SUMS:" >&2
  awk '{print $2}' "$work/sums" | sort | comm -23 "$work/files" - >&2
  exit 1
fi
(cd "$work/tree" && sha256sum --quiet -c "$work/sums") ||
  { echo "vendor-kp-themes: a file does not match SHA256SUMS; nothing changed" >&2; exit 1; }

# Replace the vendored trees wholesale, so a file the release dropped goes too.
header="$(grep '^#' "$manifest" | sed -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v$version/g")"
rm -rf "$kp/dist" "$kp/css" "$kp/fonts" "$kp/js"
while IFS= read -r f; do
  mkdir -p "$kp/$(dirname "$f")"
  cp "$work/tree/$f" "$kp/$f"
done < "$work/files"
{ printf '%s\n' "$header"; cat "$work/sums"; } > "$manifest"

sed -i -E "s/^pub const KP_THEMES_VERSION: &str = \"[^\"]+\";/pub const KP_THEMES_VERSION: \&str = \"$version\";/" "$assets_rs"
grep -q "KP_THEMES_VERSION: &str = \"$version\"" "$assets_rs" ||
  { echo "vendor-kp-themes: could not set KP_THEMES_VERSION in $assets_rs" >&2; exit 1; }

echo "vendor-kp-themes: v$version vendored, $count files checked against SHA256SUMS"
echo "vendor-kp-themes: next, check the core module list in crates/chassis/build.rs (CORE_KP_JS) against the new js/ tree"
