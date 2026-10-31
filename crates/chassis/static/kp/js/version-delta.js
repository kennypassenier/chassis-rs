// The version jump chip: "10.11 → 12.1", the size of the jump in words and tone, and a link to the release notes
// [kpadopt6-ops; homelab's `uf-ver` chips and its `admin/web/js/staleimages.js`].
//
// A `.kp-badge.kp-badge--version` with the old version struck and lighter, the new one strong and, for a jump that needs
// care, the word "major" with a "!" so the risk is never colour alone. Only the risky jump is loud; a list of quiet
// chips is what makes the loud one visible.
//
//   <span class="kp-badge kp-badge--version" data-kp-version-from="10.11.11" data-kp-version-to="12.1"
//         data-kp-version-href="https://github.com/jellyfin/jellyfin/releases/tag/v12.1"></span>
//
// What counts as a big jump (Kenny, 2026-10-17: "Eerste getal, plus een lijstje apps waarvan ook het tweede getal groot
// telt"): the first number differs, as the host's own pin check reads it (`10.11.11` to `v12.1`, linuxserver's
// `5.2.3_v2.0.14-ls474`); for the apps in `data-kp-version-big-minor` (a list on the chip or on anything above it, or the
// `bigMinorApps` option) a change of the second number is big as well, the chip naming its app in
// `data-kp-version-app`. A version with no number is never called big. Options, as attributes and as the second
// argument of attachVersionDeltas():
//
//   data-kp-version-from / -to   the versions (`to` alone is a moving tag: the chip says only where it is going)
//   data-kp-version-app          the app's name, for the big-minor list
//   data-kp-version-big-minor    apps whose second number counts as big too ("jellyfin immich")
//   data-kp-version-big-at       `first` (default) or `second`: which number's change is big for this chip alone
//   data-kp-version-scheme       `numbers` (default: every number in order), `semver` (the first three numbers only),
//                                `calver` (nothing is major: the first number is a year) or `none` (never decides)
//   data-kp-version-level        `auto` (default), `major`, `minor`, `patch` or `other`: one app's own say
//   data-kp-version-tones        "major:warning,minor:none": the tone of each level (default major warning, older destructive)
//   data-kp-version-show         `both` (default: from, arrow, to), `to` or `level` (the word alone, for a tight table)
//   data-kp-version-arrow        the arrow's glyph (default →)
//   data-kp-version-href         the release notes: a URL, or a template with `{to}` (opens in a new tab, `rel` set)
//   data-kp-version-digest       `short` (default: a `sha256:` tag shows its first 12 characters) or `full`
//   data-kp-state                `loading` (a skeleton at the final width), `error` (could not check), `empty` (not tracked)
//
// The chip carries `data-kp-level` and a sort value (`data-kp-sort-value`: 4 older, 3 major, 2 minor, 1 patch, 0 other,
// so an update list sorts the risky first), says in words "from 10.11 to 12.1, major update" to a screen reader, and
// Shift+click copies "10.11 → 12.1". `summarizeDeltas(list)` counts a list exactly for its heading ("2 major, 5 minor, 3
// patch"). Nothing runs on import.
//
// Each chip is one VersionChip (js/version-delta/controller.js over view.js and core.js, on js/controller.js); the pure level and link helpers are
// level.js and links.js, and the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { VersionChip } from './version-delta/controller.js';
import { VERSION_DELTA } from './version-delta/values.js';

export { VERSION_DELTA, VERSION_COPY_EVENT, VERSION_LEVELS, VERSION_SORT } from './version-delta/values.js';
export { versionNumbers, versionLevel, summarizeDeltas } from './version-delta/level.js';
export { githubRepo, releaseUrl } from './version-delta/links.js';

/** @typedef {'same' | 'other' | 'patch' | 'minor' | 'major' | 'downgrade' | 'unknown'} VersionLevel */

/**
 * @typedef {object} LevelOptions
 * @property {'numbers' | 'semver' | 'calver' | 'none'} [scheme]
 * @property {'first' | 'second'} [bigAt] which number's change is a big jump
 * @property {string} [app] the app's name
 * @property {readonly string[]} [bigMinorApps] apps whose second number counts as big too
 * @property {VersionLevel | 'auto'} [level] one app's own say
 */

/**
 * Set a chip's versions and draw it again.
 * @param {HTMLElement} el
 * @param {{ from?: string | null, to?: string | null, app?: string, href?: string | null, state?: 'loading' | 'error' | 'empty' | 'ready', error?: string }} change
 */
export function setVersionDelta(el, { from, to, app, href, state, error } = {}) {
    /** @param {string} name @param {string | null | undefined} value */
    const write = (name, value) => {
        if (value === undefined) return;
        if (value === null || value === '') el.removeAttribute(name);
        else el.setAttribute(name, value);
    };
    write('data-kp-version-from', from);
    write('data-kp-version-to', to);
    write('data-kp-version-app', app);
    write('data-kp-version-href', href);
    write('data-kp-version-error', error);
    if (state !== undefined) write('data-kp-state', state === 'ready' ? null : state);
    // The attribute watch redraws; a chip not yet attached is drawn by attachVersionDeltas().
}

/**
 * Draw every version chip under `root` and keep it in step with its attributes.
 * @param {ParentNode} [root]
 * @param {{ bigMinorApps?: readonly string[], href?: string | null }} [options]
 * @returns {() => void} detach
 */
export function attachVersionDeltas(root = document, options = {}) {
    return attachAll(root, VERSION_DELTA, VersionChip, options);
}
