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

import { getStrings } from './strings.js';

/** The chips this module draws. */
export const VERSION_DELTA = '[data-kp-version-to], [data-kp-version-from], .kp-badge--version[data-kp-state]';
/** Fired on the chip after Shift+click copied it: `{ text }`. */
export const VERSION_COPY_EVENT = 'kp-version-copy';
/** The levels a jump has, loudest last in a sort. */
export const VERSION_LEVELS = /** @type {const} */ (['same', 'other', 'patch', 'minor', 'major', 'downgrade', 'unknown']);
/** The sort value of each level: the risky first when sorted down. */
export const VERSION_SORT = Object.freeze({ downgrade: 4, major: 3, minor: 2, patch: 1, other: 0, same: 0, unknown: 0 });

/** @typedef {'same' | 'other' | 'patch' | 'minor' | 'major' | 'downgrade' | 'unknown'} VersionLevel */

/**
 * The numbers in a version, in order: `v10.11.11` gives [10, 11, 11], linuxserver's `5.2.3_v2.0.14-ls474` gives
 * [5, 2, 3, 2, 0, 14, 474]. The same reading the host's pin check uses.
 * @param {string} version
 * @returns {number[]}
 */
export function versionNumbers(version) {
    return (String(version ?? '').match(/\d+/g) ?? []).map(Number);
}

/**
 * `owner/repo` of an upstream as the fleet check names it (`github.com/owner/repo`, with a scheme, `www.` or `.git`
 * allowed); null for anything that is not a GitHub repository.
 * @param {string} upstream
 * @returns {{ owner: string, repo: string } | null}
 */
export function githubRepo(upstream) {
    const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(upstream ?? '').trim());
    if (!m || m[1] === '.' || m[1] === '..' || m[2] === '.' || m[2] === '..') return null;
    return { owner: m[1], repo: m[2] };
}

/**
 * The newer version's release page, absolute; null when the upstream is not a GitHub repository or there is no tag.
 * @param {string} upstream
 * @param {string} latest
 * @returns {string | null}
 */
export function releaseUrl(upstream, latest) {
    const r = githubRepo(upstream);
    const tag = String(latest ?? '').trim();
    if (!r || !tag) return null;
    return `https://github.com/${r.owner}/${r.repo}/releases/tag/${encodeURIComponent(tag)}`;
}

/**
 * @typedef {object} LevelOptions
 * @property {'numbers' | 'semver' | 'calver' | 'none'} [scheme]
 * @property {'first' | 'second'} [bigAt] which number's change is a big jump
 * @property {string} [app] the app's name
 * @property {readonly string[]} [bigMinorApps] apps whose second number counts as big too
 * @property {VersionLevel | 'auto'} [level] one app's own say
 */

/**
 * How big a jump is: `major` (the first number rose, or the second for an app that asks for it), `minor` (the second),
 * `patch` (any later number), `downgrade` (a number fell), `same`, `other` (something changed that has no numbers in
 * it, such as a digest) or `unknown` (a version is missing, or the scheme does not read numbers).
 *
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 * @param {LevelOptions} [options]
 * @returns {VersionLevel}
 */
export function versionLevel(from, to, { scheme = 'numbers', bigAt = 'first', app = '', bigMinorApps = [], level = 'auto' } = {}) {
    if (level !== 'auto' && VERSION_LEVELS.includes(level)) return level;
    const a = String(from ?? '').trim();
    const b = String(to ?? '').trim();
    if (!a || !b) return 'unknown';
    if (a === b) return 'same';
    if (scheme === 'none' || /^sha\d+:/i.test(a) || /^sha\d+:/i.test(b)) return 'other';
    const cut = scheme === 'semver' ? 3 : Infinity;
    const x = versionNumbers(a).slice(0, cut);
    const y = versionNumbers(b).slice(0, cut);
    if (x.length === 0 || y.length === 0) return 'other';
    const at = x.findIndex((n, i) => n !== (y[i] ?? -1));
    const index = at >= 0 ? at : x.length < y.length ? x.length : -1;
    if (index < 0) return 'same';
    const was = x[index] ?? 0;
    const now = y[index] ?? 0;
    if (now < was) return 'downgrade';
    if (scheme === 'calver') return index <= 1 ? 'minor' : 'patch';
    const big = bigAt === 'second' || (app !== '' && bigMinorApps.some((name) => name.toLowerCase() === app.toLowerCase())) ? 1 : 0;
    if (index <= big) return 'major';
    return index === 1 ? 'minor' : 'patch';
}

/**
 * The level of each jump of a list counted exactly, and the words for a heading ("2 major, 5 minor, 3 patch").
 * @param {readonly { from?: string | null, to?: string | null, app?: string, level?: VersionLevel | 'auto' }[]} list
 * @param {LevelOptions} [options]
 * @returns {{ total: number, counts: Record<VersionLevel, number>, text: string }}
 */
export function summarizeDeltas(list, options = {}) {
    const s = getStrings();
    /** @type {Record<VersionLevel, number>} */
    const counts = { same: 0, other: 0, patch: 0, minor: 0, major: 0, downgrade: 0, unknown: 0 };
    for (const item of list) counts[versionLevel(item.from, item.to, { ...options, app: item.app ?? '', level: item.level ?? 'auto' })] += 1;
    const words = { major: s.versionMajor, minor: s.versionMinor, patch: s.versionPatch, other: s.versionOther, downgrade: s.versionDowngrade };
    const parts = /** @type {(keyof typeof words)[]} */ (['major', 'minor', 'patch', 'other', 'downgrade'])
        .filter((level) => counts[level] > 0)
        .map((level) => `${counts[level]} ${words[level]}`);
    return { total: list.length, counts, text: parts.length > 0 ? parts.join(', ') : s.versionNoUpdates };
}

/** @param {string} version @param {'short' | 'full'} digest */
const shown = (version, digest) =>
    digest === 'short' && /^sha256:[0-9a-f]{13,}$/i.test(version) ? `${version.slice(0, 'sha256:'.length + 12)}` : version;

/** One version as text parts a long value may break between (after a dot, a hyphen or an underscore). @param {Document} doc @param {string} text */
function breakable(doc, text) {
    const frag = doc.createDocumentFragment();
    const parts = text.split(/(?<=[._:-])/);
    parts.forEach((part, i) => {
        if (i > 0) frag.append(doc.createElement('wbr'));
        frag.append(part);
    });
    return frag;
}

/** @param {string | undefined} text @returns {Record<string, string>} */
function toneMap(text) {
    /** @type {Record<string, string>} */
    const map = {};
    for (const pair of (text ?? '').split(',')) {
        const [level, tone] = pair.split(':').map((x) => x.trim());
        if (level && tone) map[level] = tone;
    }
    return map;
}

/** @param {Element} el @param {string} name */
const near = (el, name) => el.closest(`[${name}]`)?.getAttribute(name) ?? null;

/**
 * Draw one chip from its attributes.
 * @param {HTMLElement} el
 * @param {{ bigMinorApps?: readonly string[], href?: string | null }} [defaults]
 */
function draw(el, defaults = {}) {
    const doc = el.ownerDocument;
    const s = getStrings();
    const from = (el.getAttribute('data-kp-version-from') ?? '').trim();
    const to = (el.getAttribute('data-kp-version-to') ?? '').trim();
    const state = el.getAttribute('data-kp-state');
    const digest = el.getAttribute('data-kp-version-digest') === 'full' ? 'full' : 'short';
    const show = ['both', 'to', 'level'].includes(el.getAttribute('data-kp-version-show') ?? '') ? el.getAttribute('data-kp-version-show') : 'both';
    const arrow = el.getAttribute('data-kp-version-arrow') ?? '→';
    const scheme = /** @type {'numbers' | 'semver' | 'calver' | 'none'} */ (el.getAttribute('data-kp-version-scheme') ?? 'numbers');
    const listed = (near(el, 'data-kp-version-big-minor') ?? '').split(/[\s,]+/).filter(Boolean);
    const level = state
        ? 'unknown'
        : versionLevel(from, to, {
              scheme,
              bigAt: el.getAttribute('data-kp-version-big-at') === 'second' ? 'second' : 'first',
              app: el.getAttribute('data-kp-version-app') ?? '',
              bigMinorApps: [...listed, ...(defaults.bigMinorApps ?? [])],
              level: /** @type {VersionLevel | 'auto'} */ (el.getAttribute('data-kp-version-level') ?? 'auto'),
          });

    el.classList.add('kp-badge', 'kp-badge--version');
    for (const name of ['kp-badge--warning', 'kp-badge--destructive', 'kp-badge--info', 'kp-badge--success']) el.classList.remove(name);
    /** @type {Record<string, string>} */
    const tones = { major: 'warning', downgrade: 'destructive', ...toneMap(el.getAttribute('data-kp-version-tones') ?? undefined) };
    const tone = tones[level];
    if (tone && tone !== 'none') el.classList.add(`kp-badge--${tone}`);
    el.setAttribute('data-kp-level', state ? 'none' : level);
    el.setAttribute('data-kp-sort-value', String(VERSION_SORT[level]));
    el.removeAttribute('aria-busy');
    el.removeAttribute('title');

    /** @param {string} className @param {string} [tag] */
    const part = (className, tag = 'span') => {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    };
    const levelWord = {
        major: s.versionMajor,
        minor: s.versionMinor,
        patch: s.versionPatch,
        other: s.versionOther,
        downgrade: s.versionDowngrade,
        same: s.versionSame,
        unknown: s.versionUnknown,
    }[level];

    if (state === 'loading') {
        el.setAttribute('aria-busy', 'true');
        const bone = part('kp-skeleton kp-version__bone');
        bone.setAttribute('role', 'img');
        bone.setAttribute('aria-label', s.versionLoading);
        el.replaceChildren(bone);
        return;
    }
    if (state === 'error') {
        const why = el.getAttribute('data-kp-version-error');
        if (why) el.title = why;
        el.setAttribute('data-kp-level', 'none');
        el.replaceChildren(part('kp-version__word', 'span'));
        /** @type {HTMLElement} */ (el.firstElementChild).textContent = s.versionFailed;
        return;
    }
    if (state === 'empty' || (!from && !to)) {
        el.setAttribute('data-kp-level', 'none');
        const word = part('kp-version__word');
        word.textContent = s.versionNone;
        el.replaceChildren(word);
        return;
    }

    const url = el.getAttribute('data-kp-version-href') ?? defaults.href ?? null;
    const href = url ? url.replace('{to}', encodeURIComponent(to)) : null;
    /** The new version, a link when it has notes. */
    const toNode = href ? part('kp-version__to', 'a') : part('kp-version__to');
    toNode.append(breakable(doc, shown(to, digest)));
    if (href && toNode instanceof HTMLAnchorElement) {
        toNode.href = href;
        toNode.target = '_blank';
        toNode.rel = 'noopener noreferrer';
        const note = part('kp-sr-only');
        note.textContent = ` (${s.versionNotes})`;
        toNode.append(note);
    }
    const fromNode = part('kp-version__from');
    fromNode.append(breakable(doc, shown(from, digest)));
    const arrowNode = part('kp-version__arrow');
    arrowNode.setAttribute('aria-hidden', 'true');
    arrowNode.textContent = arrow;

    /** @type {Node[]} */
    const children = [];
    if (level === 'same' && from) {
        const word = part('kp-version__word');
        word.textContent = s.versionSame;
        children.push(toNode, word);
    } else if (show === 'level' && !['unknown', 'other'].includes(level)) {
        const word = part('kp-version__level');
        word.textContent = levelWord;
        if (level === 'major') word.prepend(Object.assign(part('kp-version__bang'), { textContent: '!' }));
        children.push(word);
    } else if (show === 'to' || !from) {
        children.push(toNode);
    } else {
        children.push(fromNode, arrowNode, toNode);
        if (['major', 'downgrade'].includes(level)) {
            const word = part('kp-version__level');
            word.textContent = levelWord;
            if (level === 'major') word.prepend(Object.assign(part('kp-version__bang'), { textContent: '!' }));
            children.push(word);
        } else if (level === 'unknown' || level === 'other') {
            // A version without numbers is neither big nor small: the raw strings, quietly.
            fromNode.setAttribute('data-kp-raw', '');
        }
    }
    // What a screen reader hears, in words and not in glyphs.
    const spoken = part('kp-sr-only');
    spoken.textContent =
        level === 'same'
            ? `, ${s.versionSpokenSame(to)}`
            : !from
              ? `, ${s.versionSpokenTo(to)}`
              : level === 'downgrade'
                ? `, ${s.versionSpokenDown(from, to)}`
                : level === 'other' || level === 'unknown'
                  ? `, ${s.versionSpokenChanged(from, to)}`
                  : `, ${s.versionSpoken(from, to, levelWord)}`;
    el.replaceChildren(...children, spoken);
    if (show === 'level' || !from) el.title = from ? [from, arrow, to].join(' ') : to;
}

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
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(VERSION_DELTA) ? [root] : []),
        ...root.querySelectorAll(VERSION_DELTA),
    ]).filter((el) => el.dataset.kpVersionAttached === undefined);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) {
        el.dataset.kpVersionAttached = '';
        const before = el.className;
        draw(el, options);
        const watch = new MutationObserver(() => draw(el, options));
        watch.observe(el, { attributes: true, attributeFilter: [...ATTRIBUTES] });
        /** @param {MouseEvent} event */
        const onClick = async (event) => {
            if (!event.shiftKey || (event.target instanceof Element && event.target.closest('a'))) return;
            const from = el.getAttribute('data-kp-version-from') ?? '';
            const to = el.getAttribute('data-kp-version-to') ?? '';
            const text = from ? `${from} ${el.getAttribute('data-kp-version-arrow') ?? '→'} ${to}` : to;
            event.preventDefault();
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                return;
            }
            el.dispatchEvent(new CustomEvent(VERSION_COPY_EVENT, { bubbles: true, detail: { text } }));
        };
        el.addEventListener('click', onClick);
        undo.push(() => {
            watch.disconnect();
            el.removeEventListener('click', onClick);
            el.replaceChildren();
            el.className = before;
            for (const name of ['data-kp-level', 'data-kp-sort-value', 'data-kp-version-attached']) el.removeAttribute(name);
        });
    }
    return () => undo.forEach((u) => u());
}

/** The attributes that redraw a chip. */
const ATTRIBUTES = [
    'data-kp-version-from',
    'data-kp-version-to',
    'data-kp-version-app',
    'data-kp-version-href',
    'data-kp-version-scheme',
    'data-kp-version-level',
    'data-kp-version-tones',
    'data-kp-version-show',
    'data-kp-version-arrow',
    'data-kp-version-digest',
    'data-kp-version-big-at',
    'data-kp-version-error',
    'data-kp-state',
];
