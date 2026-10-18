// The shortcut engine: one list that both handles the keys and fills the help sheet [kpadopt5].
//
// Moved out of homelab's admin/web/js/shortcuts.js (the chords "g o", `CHORD_MS`, the sheet drawn from the same table),
// so the sheet cannot promise a key that does nothing. It extends the palette's sheet (`?`, js/palette.js) and the
// caps of js/keys.js; it does not replace either.
//
//   const stop = registerShortcuts('page', [
//       { keys: 'g s', what: 'Go to Stacks', group: 'Anywhere', run: () => go('/stacks') },
//       { keys: 'j', what: 'Next row', group: 'In the table', run: () => rows.next(), when: () => rows.count() > 0 },
//   ]);
//
//   <dialog class="kp-shortcuts" data-kp-shortcuts data-kp-shortcuts-live aria-labelledby="sheet-title">…</dialog>
//
// `keys` is a chord of steps separated by spaces ("g s"), each step the key alone ("j", "?", "ArrowDown") or modifiers
// then the key ("Mod K", "Shift L"); `Mod` is Ctrl or ⌘. A letter never fires while a person types in a field; a step
// with `Mod` still does. The scope is a name (a page's keys) or an element (keys that only live while that element is on
// screen, such as a table's j/k/x). Kenny, 2026-10-17: a key that needs AltGr on his AZERTY keyboard (`[`, `]`, `{`, `@`)
// is warned about at registration, not refused (`layoutGuard`, default `warn`). Two registrations of one key in one
// scope are a fault: in development they throw and list both, elsewhere they log and the first one wins. Nothing runs on
// import; the key listener is added with the first registration and removed with the last.
//
// The small cap a chord shows while it waits ("g …") stands in the middle of the screen by default; `bottom-centre`
// puts it at the foot, as homelab had it (Kenny, 2026-10-18 18:42: "ik dacht dat die onderaan in het midden kwam, of
// misschien moet die centraal in het midden komen te staan?"). The option is `data-kp-shortcuts-hint="centre |
// bottom-centre"` on <html> or `configureShortcuts({ hintPlace })`, switched at runtime; never the top. A page that shows
// only part of itself (a frame taller than what is in view) sets `--kp-shortcuts-view-top` and `--kp-shortcuts-view-height`
// on the root, so the cap stands in what can be seen.
//
// A page embedded in another (a frame) can ask `shortcutClaims(event)` whether a key is the engine's before it hands the
// key up, and hears `kp-shortcut-pending` on the document while a chord waits, so the page around it can send the next
// key down (research/_review/review.js does both for the review dialog's lanes).

import { getStrings } from './strings.js';

/** The chord's wait for its second key, in ms (homelab's tested value). */
export const CHORD_MS = 1500;
/** How long the "no shortcut on g x" line stays, in ms. */
export const UNKNOWN_MS = 1500;
/** A sheet that is filled from the registry. */
export const SHORTCUTS_LIVE_SHEET = '[data-kp-shortcuts][data-kp-shortcuts-live]';
/** Fired on the document, bubbling, when a registered shortcut ran: `{ keys, what }`. */
export const SHORTCUT_EVENT = 'kp-shortcut-run';
/** Fired on the document when a chord starts or stops waiting for its next key: `{ keys, waiting, ms }`. */
export const SHORTCUT_PENDING_EVENT = 'kp-shortcut-pending';
/** Where the chord's cap stands: the middle of the screen (default) or the middle of its foot. */
export const SHORTCUT_HINT_PLACES = /** @type {const} */ (['centre', 'bottom-centre']);

/** Keys that need AltGr on an AZERTY keyboard. */
export const ALTGR_KEYS = Object.freeze(['[', ']', '{', '}', '@', '#', '\\', '|', '~', '€', '`', '^']);

const MODIFIERS = new Set(['mod', 'ctrl', 'control', 'alt', 'shift', 'meta', 'cmd']);
/** The keys the palette and the sheet own. */
const RESERVED = ['mod+k', '?'];

/**
 * One shortcut.
 * @typedef {object} Shortcut
 * @property {string} keys "g s", "Mod K", "?", "j"
 * @property {string} what the sheet's words for it
 * @property {string} [group] the sheet's heading for it (default "Shortcuts")
 * @property {(event: KeyboardEvent) => unknown} run called when the keys are pressed; returning `false` leaves the browser's own handling alone
 * @property {() => boolean} [when] false: the key does nothing now and the sheet shows it dimmed
 * @property {string} [reason] the sheet's sentence for why it is not available now
 */

/**
 * @typedef {object} EngineOptions
 * @property {number} [chordMs] the wait for a chord's next key (default 1500)
 * @property {'warn' | 'refuse' | 'off'} [layoutGuard] what to do with a key that needs AltGr on AZERTY (default `warn`)
 * @property {string} [typingSelector] where letters never fire (default the palette's)
 * @property {boolean} [unknownHint] show "No shortcut on g x" after a chord that does nothing (default false)
 * @property {boolean} [dev] throw on a conflict instead of logging it (default: on localhost)
 * @property {(message: string) => void} [onWarn] where warnings go (default the console)
 * @property {string[]} [groupOrder] the sheet's group order; others follow in registration order
 * @property {'centre' | 'bottom-centre'} [hintPlace] where the chord's cap stands (default: the root's
 *   `data-kp-shortcuts-hint`, else `centre`)
 */

/** @type {Required<Pick<EngineOptions, 'chordMs' | 'layoutGuard' | 'typingSelector' | 'unknownHint'>> & EngineOptions} */
const config = {
    chordMs: CHORD_MS,
    layoutGuard: 'warn',
    typingSelector: 'input, textarea, select, [role="textbox"]',
    unknownHint: false,
};

/**
 * Change the engine's defaults for the whole page.
 * @param {EngineOptions} next
 */
export function configureShortcuts(next) {
    Object.assign(config, next);
    placeHint();
    queueSheets();
}

/** @returns {boolean} */
function inDevelopment() {
    if (config.dev !== undefined) return config.dev;
    try {
        return /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
    } catch {
        return false;
    }
}

/** @param {string} message */
function warn(message) {
    if (config.onWarn) config.onWarn(message);
    else console.warn(`[kp-shortcuts] ${message}`);
}

/**
 * @typedef {object} Step
 * @property {string[]} mods sorted modifier names: `alt`, `mod`, `shift`
 * @property {string} key the key, as `KeyboardEvent.key` spells it
 */

/**
 * Read "g s" or "Mod K" into steps.
 * @param {string} keys
 * @returns {Step[]}
 */
export function parseShortcutKeys(keys) {
    /** @type {Step[]} */
    const steps = [];
    /** @type {Set<string>} */
    let mods = new Set();
    for (const token of keys.trim().split(/\s+/)) {
        if (token === '') continue;
        const lower = token.toLowerCase();
        if (MODIFIERS.has(lower)) {
            mods.add(lower === 'ctrl' || lower === 'control' || lower === 'meta' || lower === 'cmd' ? 'mod' : lower);
            continue;
        }
        steps.push({ mods: [...mods].sort(), key: token });
        mods = new Set();
    }
    if (mods.size > 0) throw new RangeError(`The keys "${keys}" end on a modifier.`);
    if (steps.length === 0) throw new RangeError('A shortcut needs keys.');
    return steps;
}

/** @param {Step[]} steps */
const normal = (steps) => steps.map((s) => [...s.mods, s.key.toLowerCase()].join('+')).join(' ');

/** Whether this is a Mac, where `Mod` is ⌘. */
function isMac() {
    if (typeof navigator === 'undefined') return false;
    const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad/i.test(platform);
}

/** The keys as the sheet spells them. @param {string} keys */
export function displayShortcutKeys(keys) {
    return keys
        .trim()
        .split(/\s+/)
        .map((t) => (t.toLowerCase() === 'mod' ? (isMac() ? '⌘' : 'Ctrl') : t))
        .join(' ');
}

/**
 * Does this event press this step?
 * @param {Step} step @param {KeyboardEvent} event
 */
function matches(step, event) {
    const wantsMod = step.mods.includes('mod');
    if (wantsMod !== (event.ctrlKey || event.metaKey)) return false;
    if (step.mods.includes('alt') !== event.altKey) return false;
    const key = event.key;
    const letter = key.length === 1 && key.toLowerCase() !== key.toUpperCase();
    // A symbol such as "?" is typed with Shift on most keyboards; a letter must say it.
    if (letter && step.mods.includes('shift') !== event.shiftKey) return false;
    if (!letter && step.mods.includes('shift') && !event.shiftKey) return false;
    return key.toLowerCase() === step.key.toLowerCase();
}

/**
 * @typedef {object} Entry
 * @property {Shortcut} shortcut
 * @property {Step[]} steps
 * @property {string} normal
 * @property {string | Element} scope
 * @property {number} order
 */

/** @type {Set<Entry>} */
const entries = new Set();
let order = 0;
/** @type {{ candidates: Entry[], index: number, at: number, shown: string } | null} */
let pending = null;
let listening = false;
/** @type {HTMLElement | null} */
let hint = null;
/** @type {number} */
let hintTimer = 0;

/** @param {Entry} entry */
function scopeActive(entry) {
    const scope = entry.scope;
    if (typeof scope === 'string') return true;
    if (!scope.isConnected) return false;
    const hidden = scope.closest('[hidden], [inert]');
    return hidden === null && (scope.getClientRects().length > 0 || scope.hasAttribute('data-kp-keys-always'));
}

/** @param {Entry} entry */
function available(entry) {
    try {
        return entry.shortcut.when ? entry.shortcut.when() !== false : true;
    } catch {
        return false;
    }
}

/** @param {EventTarget | null} target */
function typing(target) {
    return target instanceof HTMLElement && (target.isContentEditable || target.matches(config.typingSelector));
}

/** @param {string} text @param {string} [role] */
function showHint(text, role = 'status') {
    if (typeof document === 'undefined') return;
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'kp-shortcuts-pending';
        hint.setAttribute('role', role);
    }
    // Over a modal dialog the page is inert and below it, so the hint stands inside the top one.
    const modal = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).pop();
    const home = modal ?? document.body;
    if (hint.parentElement !== home) home.append(hint);
    placeHint();
    hint.textContent = text;
    hint.hidden = false;
}

/** The cap's place: the engine's option, else the root's attribute (read by the stylesheet as well), else centre. */
function placeHint() {
    if (!hint) return;
    const wanted = config.hintPlace ?? document.documentElement.getAttribute('data-kp-shortcuts-hint') ?? 'centre';
    hint.setAttribute('data-kp-shortcuts-place', SHORTCUT_HINT_PLACES.includes(/** @type {any} */ (wanted)) ? wanted : 'centre');
}

/** Tells the page whether a chord waits for its next key. */
function announcePending() {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(
        new CustomEvent(SHORTCUT_PENDING_EVENT, { detail: { keys: pending?.shown ?? '', waiting: pending !== null, ms: pending ? config.chordMs : 0 } }),
    );
}

/**
 * Whether the engine would take this key: a chord waits for its next key, or a registered shortcut that is on screen
 * starts with it (a letter not while a person types in a field). For a page embedded in another, which hands its
 * keys up to the page around it unless they are its own.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function shortcutClaims(event) {
    if (!listening || event.isComposing) return false;
    const now = event.timeStamp || Date.now();
    if (pending && now - pending.at <= config.chordMs) return true;
    const hits = [...entries].filter(scopeActive).filter((entry) => entry.steps[0] && matches(entry.steps[0], event));
    if (hits.length === 0) return false;
    return !typing(event.target) || hits.every((entry) => entry.steps[0].mods.includes('mod'));
}

function hideHint() {
    window.clearTimeout(hintTimer);
    if (hint) hint.hidden = true;
}

/** @param {string[]} typed @param {boolean} unknown */
function chordHint(typed, unknown) {
    if (!hint) showHint('');
    if (!hint) return;
    placeHint();
    hint.replaceChildren();
    for (const key of typed) {
        const cap = document.createElement('kbd');
        cap.className = 'kp-kbd';
        cap.textContent = key;
        hint.append(cap);
    }
    if (unknown) {
        hint.replaceChildren(getStrings().shortcutsUnknown(typed.join(' ')));
    } else {
        const more = document.createElement('kbd');
        more.className = 'kp-kbd kp-kbd--wait';
        more.textContent = '…';
        more.setAttribute('aria-hidden', 'true');
        hint.append(more);
        const sr = document.createElement('span');
        sr.className = 'kp-sr-only';
        sr.textContent = getStrings().shortcutsPending;
        hint.append(sr);
    }
    hint.hidden = false;
}

/** @param {KeyboardEvent} event */
function onKey(event) {
    const before = pending;
    handleKey(event);
    if (pending !== before) announcePending();
}

/** @param {KeyboardEvent} event */
function handleKey(event) {
    if (
        event.isComposing ||
        event.repeat ||
        event.key === 'Dead' ||
        event.key === 'Shift' ||
        event.key === 'Control' ||
        event.key === 'Alt' ||
        event.key === 'Meta'
    )
        return;
    const now = event.timeStamp || Date.now();
    if (event.key === 'Escape' && pending) {
        pending = null;
        hideHint();
        return;
    }
    const live = pending && now - pending.at <= config.chordMs ? pending : null;
    /** @type {Entry[]} */
    const pool = live ? live.candidates : [...entries].filter(scopeActive);
    const index = live ? live.index : 0;
    // Scoped shortcuts first: a table's own key beats the page's.
    const hits = pool
        .filter((entry) => entry.steps[index] && matches(entry.steps[index], event))
        .sort((a, b) => Number(typeof a.scope === 'string') - Number(typeof b.scope === 'string') || a.order - b.order);
    const needsMod = hits.length > 0 && hits.every((e) => e.steps[index].mods.includes('mod'));
    if (typing(event.target) && !needsMod) {
        pending = null;
        hideHint();
        return;
    }
    if (hits.length === 0) {
        if (live) {
            const typed = live.shown;
            pending = null;
            if (config.unknownHint) {
                chordHint([...typed.split(' '), event.key], true);
                window.clearTimeout(hintTimer);
                hintTimer = window.setTimeout(hideHint, UNKNOWN_MS);
            } else hideHint();
            // The key may begin a shortcut of its own.
            onKeyFresh(event, now);
        }
        return;
    }
    const done = hits.filter((entry) => entry.steps.length === index + 1);
    const more = hits.filter((entry) => entry.steps.length > index + 1);
    if (more.length > 0 && done.length === 0) {
        pending = { candidates: more, index: index + 1, at: now, shown: [live?.shown, event.key].filter(Boolean).join(' ') };
        chordHint(pending.shown.split(' '), false);
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => {
            pending = null;
            hideHint();
            announcePending();
        }, config.chordMs);
        return;
    }
    pending = null;
    hideHint();
    const first = done.find(available);
    if (!first) return;
    const result = first.shortcut.run(event);
    if (result !== false) event.preventDefault();
    document.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { bubbles: true, detail: { keys: first.shortcut.keys, what: first.shortcut.what } }));
}

/** @param {KeyboardEvent} event @param {number} now */
function onKeyFresh(event, now) {
    pending = null;
    const pool = [...entries].filter(scopeActive).filter((entry) => entry.steps[0] && matches(entry.steps[0], event));
    if (pool.length === 0 || typing(event.target)) return;
    const more = pool.filter((entry) => entry.steps.length > 1);
    if (more.length > 0 && pool.every((entry) => entry.steps.length > 1)) {
        pending = { candidates: more, index: 1, at: now, shown: event.key };
        return;
    }
    const first = pool.filter((entry) => entry.steps.length === 1).find(available);
    if (first) {
        const result = first.shortcut.run(event);
        if (result !== false) event.preventDefault();
    }
}

function listen() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('keydown', onKey);
}

function unlisten() {
    if (!listening || entries.size > 0) return;
    listening = false;
    document.removeEventListener('keydown', onKey);
    pending = null;
    hideHint();
}

/**
 * What to say about a key that needs AltGr.
 * @param {Step[]} steps
 * @returns {string | null}
 */
function altGrProblem(steps) {
    const bad = steps.find((s) => ALTGR_KEYS.includes(s.key));
    if (!bad) return null;
    const suggestion =
        bad.key === '[' || bad.key === ']'
            ? 'Shift ArrowLeft / Shift ArrowRight, or a digit'
            : 'a letter, a digit, an arrow key or a chord such as "g s"';
    return getStrings().shortcutsAltGr(bad.key, suggestion);
}

/**
 * Register a list of shortcuts under a scope.
 *
 * @param {string | Element} scope a name (the page's keys) or an element (keys that live while it is on screen)
 * @param {readonly Shortcut[]} list
 * @param {EngineOptions} [options] overrides the page's defaults for this list
 * @returns {() => void} unregister
 */
export function registerShortcuts(scope, list, options = {}) {
    const guard = options.layoutGuard ?? config.layoutGuard;
    /** @type {Entry[]} */
    const added = [];
    const fault = (/** @type {string} */ message) => {
        if ((options.dev ?? inDevelopment()) === true) {
            for (const entry of added) entries.delete(entry);
            throw new Error(message);
        }
        console.error(`[kp-shortcuts] ${message}`);
    };
    for (const shortcut of list) {
        const steps = parseShortcutKeys(shortcut.keys);
        const id = normal(steps);
        const reserved = RESERVED.includes(id);
        if (reserved) {
            fault(`The keys "${shortcut.keys}" belong to the palette and the shortcut sheet.`);
            continue;
        }
        const problem = guard === 'off' ? null : altGrProblem(steps);
        if (problem) {
            if (guard === 'refuse') {
                fault(problem);
                continue;
            }
            (options.onWarn ?? warn)(problem);
        }
        const clash = [...entries, ...added].find(
            (other) => other.scope === scope && (other.normal === id || other.normal.startsWith(`${id} `) || id.startsWith(`${other.normal} `)),
        );
        if (clash) {
            fault(`The keys "${shortcut.keys}" (${shortcut.what}) clash with "${clash.shortcut.keys}" (${clash.shortcut.what}) in the same scope.`);
            continue;
        }
        const entry = { shortcut, steps, normal: id, scope, order: order++ };
        added.push(entry);
        entries.add(entry);
    }
    listen();
    queueSheets();
    return () => {
        for (const entry of added) entries.delete(entry);
        added.length = 0;
        unlisten();
        queueSheets();
    };
}

/**
 * The registered shortcuts, for a consumer's own listing.
 * @returns {{ keys: string, what: string, group: string, scope: string, available: boolean }[]}
 */
export function listShortcuts() {
    return [...entries].map((entry) => ({
        keys: entry.shortcut.keys,
        what: entry.shortcut.what,
        group: entry.shortcut.group ?? 'Shortcuts',
        scope: typeof entry.scope === 'string' ? entry.scope : 'element',
        available: scopeActive(entry) && available(entry),
    }));
}

/* ---------------------------------------------------------------- the sheet */

let queued = false;
function queueSheets() {
    if (queued || typeof document === 'undefined') return;
    queued = true;
    queueMicrotask(() => {
        queued = false;
        for (const sheet of document.querySelectorAll(SHORTCUTS_LIVE_SHEET)) renderShortcutSheet(/** @type {HTMLElement} */ (sheet));
    });
}

/**
 * Write the sheet's body from the registry: groups of rows, the scope's own keys first, the palette's and the sheet's
 * keys in a fixed first group, a dimmed row for a key that is not available now, an empty plate when nothing is
 * registered.
 *
 * @param {HTMLElement} sheet
 */
export function renderShortcutSheet(sheet) {
    const doc = sheet.ownerDocument;
    const s = getStrings();
    let body = /** @type {HTMLElement | null} */ (sheet.querySelector('[data-kp-shortcuts-body]'));
    if (!body) {
        body = doc.createElement('div');
        body.setAttribute('data-kp-shortcuts-body', '');
        sheet.append(body);
    }
    /** @type {Map<string, { group: string, rows: { keys: string, what: string, off: boolean, reason: string }[], scoped: boolean }>} */
    const groups = new Map();
    /** @param {string} name @param {boolean} scoped */
    const groupFor = (name, scoped) => {
        let g = groups.get(name);
        if (!g) groups.set(name, (g = { group: name, rows: [], scoped }));
        if (scoped) g.scoped = true;
        return g;
    };
    const fixed = sheet.getAttribute('data-kp-shortcuts-reserved-group') ?? 'Anywhere';
    const fixedGroup = groupFor(fixed, false);
    if (doc.querySelector('[data-kp-palette]')) fixedGroup.rows.push({ keys: 'Mod K', what: s.shortcutsPalette, off: false, reason: '' });
    fixedGroup.rows.push({ keys: '?', what: s.shortcutsSheet, off: false, reason: '' });
    // `data-kp-shortcuts-scope="page, table"` lists only the shortcuts registered under those scope names.
    const only = (sheet.getAttribute('data-kp-shortcuts-scope') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const sorted = [...entries]
        .filter((e) => only.length === 0 || (typeof e.scope === 'string' && only.includes(e.scope)))
        .sort((a, b) => a.order - b.order);
    for (const entry of sorted) {
        const scopeOn = scopeActive(entry);
        if (!scopeOn) continue;
        const group = groupFor(entry.shortcut.group ?? 'Shortcuts', typeof entry.scope !== 'string');
        const on = available(entry);
        group.rows.push({ keys: entry.shortcut.keys, what: entry.shortcut.what, off: !on, reason: entry.shortcut.reason ?? s.shortcutsUnavailable });
    }
    const wanted = (sheet.getAttribute('data-kp-shortcuts-group') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .concat(config.groupOrder ?? []);
    const list = [...groups.values()].filter((g) => g.rows.length > 0);
    const rank = (/** @type {{ group: string, scoped: boolean }} */ g) => {
        if (g.group === fixed) return wanted.includes(fixed) ? wanted.indexOf(fixed) + 1 : 0;
        if (g.scoped) return 0.5;
        const at = wanted.indexOf(g.group);
        return at < 0 ? 1000 : at + 1;
    };
    // The scope's keys first, then the sheet's fixed group, then the wanted order, then registration order.
    list.sort((a, b) => (a.scoped === b.scoped ? rank(a) - rank(b) : a.scoped ? -1 : 1));
    const registered = sorted.some(scopeActive);
    body.replaceChildren();
    if (!registered && sheet.getAttribute('data-kp-shortcuts-empty') !== 'off') {
        const empty = doc.createElement('div');
        empty.className = 'kp-empty kp-shortcuts__empty';
        const title = doc.createElement('p');
        title.className = 'kp-empty__title';
        title.textContent = s.shortcutsEmptyTitle;
        const text = doc.createElement('p');
        text.className = 'kp-empty__body';
        text.textContent = s.shortcutsEmptyText;
        empty.append(title, text);
        body.append(empty);
        return;
    }
    for (const g of list) {
        const section = doc.createElement('section');
        const heading = doc.createElement('h3');
        heading.className = 'kp-shortcuts__group-label';
        heading.textContent = g.group;
        const dl = doc.createElement('dl');
        dl.className = 'kp-shortcuts__list';
        for (const row of g.rows) {
            const wrap = doc.createElement('div');
            wrap.className = row.off ? 'kp-shortcuts__row kp-shortcuts__row--off' : 'kp-shortcuts__row';
            const dt = doc.createElement('dt');
            const kbd = doc.createElement('kbd');
            kbd.className = 'kp-palette__keys';
            kbd.textContent = displayShortcutKeys(row.keys);
            dt.append(kbd);
            const dd = doc.createElement('dd');
            dd.append(row.what);
            if (row.off) {
                const why = doc.createElement('span');
                why.className = 'kp-shortcuts__reason';
                why.textContent = row.reason;
                dd.append(why);
            }
            wrap.append(dt, dd);
            dl.append(wrap);
        }
        section.append(heading, dl);
        body.append(section);
    }
}

/**
 * Keep every live sheet under `root` filled from the registry, and fresh each time it opens.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachShortcuts(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const found of root.querySelectorAll(SHORTCUTS_LIVE_SHEET)) {
        const sheet = /** @type {HTMLElement} */ (found);
        if (sheet.dataset.kpShortcutsLiveAttached !== undefined) continue;
        sheet.dataset.kpShortcutsLiveAttached = '';
        const refresh = () => renderShortcutSheet(sheet);
        sheet.addEventListener('kp-palette-open', refresh);
        refresh();
        cleanups.push(() => {
            sheet.removeEventListener('kp-palette-open', refresh);
            sheet.querySelector('[data-kp-shortcuts-body]')?.remove();
            delete sheet.dataset.kpShortcutsLiveAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}
