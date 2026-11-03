#!/usr/bin/env bash
# Vendor one kp-themes release under crates/chassis/static/kp/.
#
#   scripts/vendor-kp-themes.sh 12.0.0
#   scripts/vendor-kp-themes.sh 12.2.0-pre.00408fb91 --from-dir ~/.cache/kp-split-src2
#
# --from-dir <path> skips the download and takes the tree from a built
# kp-themes checkout (or `git archive` export) instead, so a release that is
# not published yet can be prepared. The directory must hold the package
# layout (dist/, css/, fonts/, js/) and a SHA256SUMS made by kp-themes' own
# `node gates/checksums.mjs --write`; the same checks run against it.
#
# Why a script: every bump used to be done by hand (copy files, rewrite
# KP_THEMES.sha256, bump KP_THEMES_VERSION), and kp-themes 12 splits modules
# into folders, so a hand copy of the facade files alone would ship 404s.
# The embedded asset tables follow static/ by themselves (build.rs), so this
# is the whole bump on the file side.
#
# What is vendored (the rule reproduces the 11.3.0 set exactly, 213 files,
# and gives 1206 for kp-themes main before 12.0.0): dist/kp-themes.css and
# the bundle, the base stylesheet dist/kp-themes-base.min.css, every
# dist/css/*-register.min.css, the split module folder dist/js/ (js and
# maps, not the .d.ts), css/fonts.css, everything under fonts/ and
# everything under js/, from the release's consumer.tar and fonts.tar. Every
# file is checked against the release's own SHA256SUMS before anything under
# static/kp/ is touched; a mismatch or a missing line stops the script.
# The source maps may come with their own SHA256SUMS.maps (kp-themes after
# 12.2.0); it is checked the same way. dist/css/_density and _print were
# never vendored (the rule takes only *-register.min.css), so their removal
# upstream changes nothing here.
set -euo pipefail

usage="usage: scripts/vendor-kp-themes.sh <version, e.g. 12.0.0> [--from-dir <kp-themes tree>]"
version="${1:?$usage}"
version="${version#v}"
from_dir=""
if [ "${2:-}" = "--from-dir" ]; then
  from_dir="${3:?$usage}"
  [ -d "$from_dir/dist" ] && [ -f "$from_dir/SHA256SUMS" ] ||
    { echo "vendor-kp-themes: $from_dir needs dist/ and a SHA256SUMS (npm run checksums)" >&2; exit 1; }
  from_dir="$(cd "$from_dir" && pwd)"
elif [ -n "${2:-}" ]; then
  echo "$usage" >&2; exit 1
fi
repo="kennypassenier/kp-themes"
root="$(cd "$(dirname "$0")/.." && pwd)"
kp="$root/crates/chassis/static/kp"
manifest="$kp/KP_THEMES.sha256"
assets_rs="$root/crates/chassis/src/shell/assets.rs"
# The CLI records the kp-themes version it scaffolds against (K32); it must
# move with the vendored files or the drift check refuses the release.
cli_rs="$root/crates/chassis-cli/src/recorded.rs"

# Scratch under ~/.cache, never /tmp (a small tmpfs on the dev PC).
mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}/vendor-kp-themes"
work="$(mktemp -d -p "${XDG_CACHE_HOME:-$HOME/.cache}/vendor-kp-themes")"
trap 'rm -rf "$work"' EXIT

if [ -n "$from_dir" ]; then
  echo "vendor-kp-themes: taking $version from $from_dir (no download)"
  work_tree="$from_dir"
  cp "$from_dir/SHA256SUMS" "$work/SHA256SUMS"
else
  echo "vendor-kp-themes: downloading v$version"
  gh release download "v$version" --repo "$repo" --dir "$work" \
    -p consumer.tar -p fonts.tar -p SHA256SUMS
  mkdir -p "$work/tree"
  tar -xf "$work/consumer.tar" -C "$work/tree"
  tar -xf "$work/fonts.tar" -C "$work/tree"
  work_tree="$work/tree"
  # From the release after 12.2.0 on, the source maps carry their own sums in
  # an optional SHA256SUMS.maps asset; older releases list them in SHA256SUMS.
  if gh release view "v$version" --repo "$repo" --json assets --jq '.assets[].name' |
    grep -qx 'SHA256SUMS.maps'; then
    gh release download "v$version" --repo "$repo" --dir "$work" -p SHA256SUMS.maps
  fi
fi
if [ -n "$from_dir" ] && [ -f "$from_dir/SHA256SUMS.maps" ]; then
  cp "$from_dir/SHA256SUMS.maps" "$work/SHA256SUMS.maps"
fi
# One list to check against: the maps group joins the main sums when present.
if [ -f "$work/SHA256SUMS.maps" ]; then
  cat "$work/SHA256SUMS.maps" >> "$work/SHA256SUMS"
  echo "vendor-kp-themes: source maps checked against SHA256SUMS.maps"
fi

# The vendored set, by rule.
(cd "$work_tree" && find dist css fonts js -type f | sort) |
  grep -E '^(dist/kp-themes\.css|dist/kp-themes\.min\.js(\.map)?|dist/kp-themes-base\.min\.css(\.map)?|dist/css/[a-z0-9-]+-register\.min\.css(\.map)?|dist/js/.+\.js(\.map)?|css/fonts\.css|fonts/.+|js/.+\.js)$' |
  grep -vE '(^|/)types\.js$' > "$work/files"
count=$(wc -l < "$work/files")
[ "$count" -gt 0 ] || { echo "vendor-kp-themes: the rule selected no files" >&2; exit 1; }

# SHA256SUMS must not list a path twice (a duplicate means a broken release), and
# each selected file must have exactly one line in it, matching its content.
dups=$(awk '{print $2}' "$work/SHA256SUMS" | sort | uniq -d)
if [ -n "$dups" ]; then
  echo "vendor-kp-themes: SHA256SUMS lists paths twice:" >&2; echo "$dups" >&2; exit 1
fi
awk 'NR==FNR { want[$0] = 1; next } ($2 in want)' "$work/files" "$work/SHA256SUMS" > "$work/sums"
listed=$(wc -l < "$work/sums")
if [ "$listed" -ne "$count" ]; then
  echo "vendor-kp-themes: $count files selected, only $listed listed in SHA256SUMS:" >&2
  awk '{print $2}' "$work/sums" | sort | comm -23 "$work/files" - >&2
  exit 1
fi
(cd "$work_tree" && sha256sum --quiet -c "$work/sums") ||
  { echo "vendor-kp-themes: a file does not match SHA256SUMS; nothing changed" >&2; exit 1; }

# Replace the vendored trees wholesale, so a file the release dropped goes too.
header="$(grep '^#' "$manifest" | sed -E "s/v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?/v$version/g")"
rm -rf "$kp/dist" "$kp/css" "$kp/fonts" "$kp/js"
while IFS= read -r f; do
  mkdir -p "$kp/$(dirname "$f")"
  cp "$work_tree/$f" "$kp/$f"
done < "$work/files"
{ printf '%s\n' "$header"; cat "$work/sums"; } > "$manifest"

sed -i -E "s/^pub const KP_THEMES_VERSION: &str = \"[^\"]+\";/pub const KP_THEMES_VERSION: \&str = \"$version\";/" "$assets_rs"
grep -q "KP_THEMES_VERSION: &str = \"$version\"" "$assets_rs" ||
  { echo "vendor-kp-themes: could not set KP_THEMES_VERSION in $assets_rs" >&2; exit 1; }

sed -i -E "s/^pub\(crate\) const KP_THEMES: &str = \"[^\"]+\";/pub(crate) const KP_THEMES: \&str = \"$version\";/" "$cli_rs"
grep -q "KP_THEMES: &str = \"$version\"" "$cli_rs" ||
  { echo "vendor-kp-themes: could not set KP_THEMES in $cli_rs" >&2; exit 1; }

echo "vendor-kp-themes: v$version vendored, $count files checked against SHA256SUMS"
echo "vendor-kp-themes: next, check the core module list in crates/chassis/build.rs (CORE_KP_JS) against the new js/ tree"
