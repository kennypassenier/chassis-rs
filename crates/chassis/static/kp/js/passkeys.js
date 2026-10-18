// The list of ways to sign in: passkeys, magic links, passwords and tokens
// [kpadopt5-people; chassis-rs `passkeys.html` + `passkeys.js`, JobTracker
// `pages/Account.jsx` rows].
//
//   <div class="kp-passkeys" data-kp-passkeys></div>
//
//   setPasskeys(el, {
//       rows: [{ key: 'pk1', label: 'Work laptop', kind: 'passkey', createdAt: 1760000000000,
//                lastUsedAt: 1760900000000, current: true }],
//       remove: async (row) => { await fetch(`/passkeys/${row.key}`, { method: 'DELETE' }); },
//       rename: async (row, label) => { … },
//   });
//
// One row per way in: the way's icon (four glyphs, one set), its name, when it
// was added and, in words, when it was last used (the exact moment in the
// tooltip, dd/mm/yyyy HH:mm in Europe/Brussels), a "This device" badge on the
// one in use, and Rename and Remove in two fixed columns so the buttons line up
// from row to row. The list is sorted with the one in use on top, then by last
// use.
//
// Options (each a JS option of setPasskeys() and an attribute of the root; the
// option wins):
//   protectLast   `data-kp-protect-last`   `refuse` (default) | `confirm` | `off`:
//                 removing the last way in locks the owner out. `refuse` keeps
//                 Remove pressed-in with the reason beside it ("Your only way
//                 to sign in. Add another way first."); `confirm` lets it
//                 through behind a typed name and a warning; `off` treats it as
//                 any other [Kenny, 2026-10-17: "Weigeren"];
//   confirm       `data-kp-confirm`        `dialog` (default) | `type-name`: how a
//                 removal is confirmed. The one in use, and the last way in under
//                 `confirm`, always need the exact name typed;
//   refuseLook    `data-kp-refuse-look`  how the refusal reads: `button` (default,
//                 Remove stays on the row, held off, with the reason under the name) or
//                 `note` (the button gives way to the reason in its place);
//   markCurrent   `data-kp-mark-current`   on by default, `off` leaves the badge out;
//   neverUsedAfter `data-kp-never-used-after` days (default 90): a way not used for
//                 that long is flagged as a candidate to remove (0 = never flag).
//
// Removing asks `remove(row)`; when it rejects, its message is the server's why
// and is shown on the row ("Not removed: …") and the row stays; when it resolves,
// the row leaves the list at once. Without `remove` the component fires
// `kp-passkeys-remove` (cancelable: preventDefault means the page does the
// removal itself and calls setPasskeys() again). The same for `rename` and
// `kp-passkeys-rename`.
//
// States: `loading` keeps the rows' geometry as waiting rows under the busy card
// (js/busy-card.js); `empty` ("No passkey registered yet" and a Register button,
// `kp-passkeys-register`) and `error` (what failed and a Retry,
// `kp-passkeys-retry`) are the package's empty state filling the list's whole
// footprint, centred; `insecure: true` puts a warning with what to do next above
// the list (passkeys need https). Every word is in js/strings.js.

import { getStrings } from './strings.js';
import { agoMoment, agoText } from './freshness.js';
import { openBusyCard } from './busy-card.js';
import { openConfirmation } from './components.js';

/** A passkey list the page fills with setPasskeys(). */
export const PASSKEYS = '[data-kp-passkeys]';
/** Fired on the root when Register (the empty list's button) is pressed. */
export const PASSKEYS_REGISTER_EVENT = 'kp-passkeys-register';
/** Fired on the root when the Retry of a failed list is pressed. */
export const PASSKEYS_RETRY_EVENT = 'kp-passkeys-retry';
/** Fired on the root, cancelable, when a removal was confirmed and the page gave no `remove`: `{ key, row }`. */
export const PASSKEYS_REMOVE_EVENT = 'kp-passkeys-remove';
/** Fired on the root, cancelable, when a new name was saved and the page gave no `rename`: `{ key, row, label }`. */
export const PASSKEYS_RENAME_EVENT = 'kp-passkeys-rename';
/** The kinds of way in, each with its glyph. */
export const PASSKEY_KINDS = Object.freeze(['passkey', 'magic-link', 'password', 'token']);

/**
 * @typedef {'passkey' | 'magic-link' | 'password' | 'token'} PasskeyKind
 * @typedef {object} PasskeyRow
 * @property {string} key
 * @property {string} label
 * @property {PasskeyKind} [kind] default `passkey`
 * @property {number} [createdAt] ms
 * @property {number | null} [lastUsedAt] ms; null or missing: never used
 * @property {boolean} [current] the way this session signed in with
 * @typedef {object} PasskeysSpec
 * @property {PasskeyRow[]} [rows]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message] the sentence of a failed list
 * @property {boolean} [retry] false leaves Retry out of a failed list
 * @property {string} [emptyTitle]
 * @property {string} [emptyText]
 * @property {boolean} [register] false leaves the Register button out of the empty list
 * @property {boolean} [insecure] the page is not served over https: a warning with what to do next
 * @property {'refuse' | 'confirm' | 'off'} [protectLast]
 * @property {'dialog' | 'type-name'} [confirm]
 * @property {'button' | 'note'} [refuseLook]
 * @property {boolean} [markCurrent]
 * @property {number} [neverUsedAfter] days
 * @property {() => number} [now] the clock (a test gives its own)
 * @property {(row: PasskeyRow) => Promise<unknown> | unknown} [remove] reject with an Error to refuse; its message is shown
 * @property {(row: PasskeyRow, label: string) => Promise<unknown> | unknown} [rename]
 * @property {number} [loadingRows] how many waiting rows (default: the rows shown last, else 3)
 * @property {string} [loadingWords] what the busy card says
 */

/**
 * @typedef {object} Memory
 * @property {PasskeysSpec} spec
 * @property {PasskeyRow[]} rows
 * @property {number} rowCount
 * @property {number} height
 * @property {import('./busy-card.js').BusyCard | null} card
 * @property {boolean} drawn
 * @property {PasskeysSpec | null} pending
 * @property {boolean} wired
 * @property {string | null} renaming the key being renamed
 * @property {Map<string, string>} refused a row's server refusal, by key
 * @property {Set<string>} busy keys being removed or renamed
 * @property {string} announce
 */

/** @type {WeakMap<HTMLElement, Memory>} */
const MEMORY = new WeakMap();
let seq = 0;

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
};

/** The glyphs: 20 by 20, drawn with the text colour. @type {Record<PasskeyKind, string>} */
const GLYPHS = {
    passkey: 'M13 3a4 4 0 1 1-2.4 7.2L9 11.8V14H7v2H5v-2.6l5.4-5.4A4 4 0 0 1 13 3Zm1 2.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z',
    'magic-link': 'M3 5h14v10H3V5Zm1.6 1.6v.35L10 10.6l5.4-3.65V6.6H4.6Zm10.8 2.3L10 12.5 4.6 8.9v4.5h10.8V8.9Z',
    password: 'M4 8h12v6H4V8Zm1.6 1.6v2.8h8.8V9.6H5.6ZM6 10.5h1.6v1H6v-1Zm2.8 0h1.6v1H8.8v-1Zm2.8 0h1.6v1h-1.6v-1ZM7 5a3 3 0 0 1 6 0v1.4h-1.6V5a1.4 1.4 0 0 0-2.8 0v1.4H7V5Z',
    token: 'M10 3l6 2.6v4.3c0 3.3-2.4 5.8-6 7.1-3.6-1.3-6-3.8-6-7.1V5.6L10 3Zm0 1.7L5.6 6.6v3.3c0 2.3 1.6 4.2 4.4 5.4 2.8-1.2 4.4-3.1 4.4-5.4V6.6L10 4.7Zm-.8 7.3-2-2 1.1-1.1.9.9 2.4-2.4 1.1 1.1L9.2 12Z',
};

/** @param {Document} doc @param {PasskeyKind} kind */
function glyph(doc, kind) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('class', 'kp-passkeys__glyph');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', GLYPHS[kind] ?? GLYPHS.passkey);
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    svg.append(path);
    return svg;
}

/**
 * The options as the page wrote them: the spec first, then the attribute, then the default.
 * @param {HTMLElement} el @param {PasskeysSpec} spec
 */
export function passkeyOptions(el, spec) {
    const attr = (/** @type {string} */ name) => el.getAttribute(`data-kp-${name}`);
    const last = spec.protectLast ?? attr('protect-last');
    const confirm = spec.confirm ?? attr('confirm');
    const days = spec.neverUsedAfter ?? (attr('never-used-after') === null ? 90 : Number(attr('never-used-after')));
    return {
        protectLast: /** @type {'refuse' | 'confirm' | 'off'} */ (last === 'confirm' || last === 'off' ? last : 'refuse'),
        confirm: /** @type {'dialog' | 'type-name'} */ (confirm === 'type-name' ? 'type-name' : 'dialog'),
        refuseLook: /** @type {'button' | 'note'} */ ((spec.refuseLook ?? attr('refuse-look')) === 'note' ? 'note' : 'button'),
        markCurrent: spec.markCurrent ?? attr('mark-current') !== 'off',
        neverUsedAfter: Number.isFinite(days) && days >= 0 ? days : 90,
    };
}

/**
 * The order of the list: the one in use first, then the most recently used,
 * a way never used last.
 * @param {readonly PasskeyRow[]} rows
 * @returns {PasskeyRow[]}
 */
export function sortPasskeys(rows) {
    return [...rows].sort(
        (a, b) =>
            Number(Boolean(b.current)) - Number(Boolean(a.current)) ||
            (b.lastUsedAt ?? -Infinity) - (a.lastUsedAt ?? -Infinity) ||
            (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
}

/**
 * Whole days a way has gone unused (since it was added when never used), or
 * null when it was used within `limit` days or the flag is off.
 * @param {PasskeyRow} row @param {number} now @param {number} limit
 * @returns {number | null}
 */
export function unusedDays(row, now, limit) {
    if (!(limit > 0)) return null;
    const since = row.lastUsedAt ?? row.createdAt;
    if (since == null || !Number.isFinite(since)) return null;
    const days = Math.floor((now - since) / 86_400_000);
    return days >= limit ? days : null;
}

/**
 * Draw (or redraw) a passkey list.
 * @param {HTMLElement} el the root, a `.kp-passkeys`
 * @param {PasskeysSpec} spec
 */
export function setPasskeys(el, spec) {
    const memory = MEMORY.get(el) ?? {
        spec,
        rows: [],
        rowCount: 3,
        height: 0,
        card: null,
        drawn: false,
        pending: null,
        wired: false,
        renaming: null,
        refused: new Map(),
        busy: new Set(),
        announce: '',
    };
    MEMORY.set(el, memory);
    memory.spec = spec;
    el.classList.add('kp-passkeys');
    el.setAttribute('data-kp-passkeys', el.getAttribute('data-kp-passkeys') ?? '');
    if (!memory.wired) {
        memory.wired = true;
        wire(el, memory);
    }
    const state = spec.state ?? 'ready';
    if (state === 'loading') {
        memory.pending = null;
        drawLoading(el, spec, memory);
        return;
    }
    if (spec.rows) memory.rows = [...spec.rows];
    if (memory.card) {
        const card = memory.card;
        memory.card = null;
        memory.pending = spec;
        void card.close().then(() => {
            if (memory.pending !== spec) return;
            memory.pending = null;
            draw(el, memory);
        });
        return;
    }
    draw(el, memory);
}

/** @param {HTMLElement} el @param {Memory} memory */
function wire(el, memory) {
    el.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-kp-passkeys-retry]')) el.dispatchEvent(new CustomEvent(PASSKEYS_RETRY_EVENT, { bubbles: true }));
        if (target.closest('[data-kp-passkeys-register]')) el.dispatchEvent(new CustomEvent(PASSKEYS_REGISTER_EVENT, { bubbles: true }));
        const act = /** @type {HTMLElement | null} */ (target.closest('[data-kp-passkeys-act]'));
        if (!act) return;
        const row = memory.rows.find((r) => r.key === act.closest('[data-kp-passkey]')?.getAttribute('data-kp-passkey'));
        if (!row) return;
        const what = act.getAttribute('data-kp-passkeys-act');
        if (what === 'remove') askRemove(el, memory, row, act);
        else if (what === 'rename') startRename(el, memory, row);
        else if (what === 'cancel') stopRename(el, memory, row.key, true);
        else if (what === 'save') void saveRename(el, memory, row);
    });
    el.addEventListener('keydown', (event) => {
        const input = event.target instanceof HTMLInputElement && event.target.matches('.kp-passkeys__rename-input') ? event.target : null;
        if (!input) return;
        const row = memory.rows.find((r) => r.key === input.closest('[data-kp-passkey]')?.getAttribute('data-kp-passkey'));
        if (!row) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            void saveRename(el, memory, row);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            stopRename(el, memory, row.key, true);
        }
    });
}

/** Whether removing `row` would leave no way in. @param {Memory} memory */
const isLast = (memory) => memory.rows.length <= 1;

/** @param {HTMLElement} el @param {Memory} memory @param {PasskeyRow} row @param {HTMLElement} button */
function askRemove(el, memory, row, button) {
    const options = passkeyOptions(el, memory.spec);
    const strings = getStrings();
    if (memory.busy.has(row.key)) return;
    const last = isLast(memory);
    if (last && options.protectLast === 'refuse') return;
    const typed = options.confirm === 'type-name' || Boolean(row.current) || (last && options.protectLast === 'confirm');
    const loses = [strings.passkeysLosesWay(row.label)];
    if (last) loses.push(strings.passkeysLosesLast);
    else if (row.current) loses.push(strings.passkeysLosesCurrent);
    openConfirmation(button, {
        phrase: strings.passkeysRemoveTitle(row.label),
        acceptLabel: strings.passkeysRemove,
        ...(typed ? { typeName: row.label, loses } : {}),
        onAccept: () => void remove(el, memory, row),
    });
}

/** @param {HTMLElement} el @param {Memory} memory @param {PasskeyRow} row */
async function remove(el, memory, row) {
    const strings = getStrings();
    memory.busy.add(row.key);
    memory.refused.delete(row.key);
    draw(el, memory);
    try {
        const given = memory.spec.remove;
        if (given) await given(row);
        else {
            const go = el.dispatchEvent(new CustomEvent(PASSKEYS_REMOVE_EVENT, { bubbles: true, cancelable: true, detail: { key: row.key, row } }));
            // The page does the removal itself and draws the list again.
            if (!go) {
                memory.busy.delete(row.key);
                return;
            }
        }
        // The list updates at once.
        memory.rows = memory.rows.filter((r) => r.key !== row.key);
        memory.busy.delete(row.key);
        memory.announce = strings.passkeysRemoved(row.label);
        if (memory.rows.length === 0) memory.spec = { ...memory.spec, state: 'empty' };
        draw(el, memory);
    } catch (error) {
        memory.busy.delete(row.key);
        memory.refused.set(row.key, strings.passkeysRefused(error instanceof Error && error.message ? error.message : strings.passkeysRefusedFallback));
        draw(el, memory);
        const again = /** @type {HTMLElement | null} */ (
            [...el.querySelectorAll('[data-kp-passkey]')].find((li) => li.getAttribute('data-kp-passkey') === row.key)?.querySelector('[data-kp-passkeys-act="remove"]')
        );
        again?.focus();
    }
}

/** @param {HTMLElement} el @param {Memory} memory @param {PasskeyRow} row */
function startRename(el, memory, row) {
    if (memory.busy.has(row.key)) return;
    memory.renaming = row.key;
    memory.refused.delete(row.key);
    draw(el, memory);
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-passkeys__rename-input'));
    input?.focus();
    input?.select();
}

/** @param {HTMLElement} el @param {Memory} memory @param {string} key @param {boolean} focus */
function stopRename(el, memory, key, focus) {
    memory.renaming = null;
    draw(el, memory);
    if (focus)
        /** @type {HTMLElement | null} */ (
            [...el.querySelectorAll('[data-kp-passkey]')].find((li) => li.getAttribute('data-kp-passkey') === key)?.querySelector('[data-kp-passkeys-act="rename"]')
        )?.focus();
}

/** @param {HTMLElement} el @param {Memory} memory @param {PasskeyRow} row */
async function saveRename(el, memory, row) {
    const strings = getStrings();
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-passkeys__rename-input'));
    if (!input) return;
    const label = input.value.trim();
    if (label === '') {
        memory.refused.set(row.key, strings.passkeysNameRequired);
        draw(el, memory);
        /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-passkeys__rename-input'))?.focus();
        return;
    }
    if (label === row.label) {
        stopRename(el, memory, row.key, true);
        return;
    }
    memory.busy.add(row.key);
    draw(el, memory);
    try {
        const given = memory.spec.rename;
        if (given) await given(row, label);
        else el.dispatchEvent(new CustomEvent(PASSKEYS_RENAME_EVENT, { bubbles: true, cancelable: true, detail: { key: row.key, row, label } }));
        memory.rows = memory.rows.map((r) => (r.key === row.key ? { ...r, label } : r));
        memory.busy.delete(row.key);
        memory.refused.delete(row.key);
        memory.announce = strings.passkeysRenamed(label);
        stopRename(el, memory, row.key, true);
    } catch (error) {
        memory.busy.delete(row.key);
        memory.refused.set(row.key, strings.passkeysRenameRefused(error instanceof Error && error.message ? error.message : strings.passkeysRefusedFallback));
        draw(el, memory);
        const again = /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-passkeys__rename-input'));
        again?.focus();
    }
}

/** @param {HTMLElement} el @param {PasskeysSpec} spec @param {Memory} memory */
function drawLoading(el, spec, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-state', 'loading');
    const list = make(doc, 'kp-passkeys__list', 'ul');
    list.setAttribute('aria-hidden', 'true');
    const count = spec.loadingRows ?? memory.rowCount;
    for (let i = 0; i < count; i += 1) {
        const row = make(doc, 'kp-passkeys__row kp-passkeys__row--wait', 'li');
        row.append(make(doc, 'kp-passkeys__way kp-skeleton kp-skeleton--block'));
        const what = make(doc, 'kp-passkeys__what');
        what.append(make(doc, 'kp-passkeys__wait-line kp-skeleton kp-skeleton--block'), make(doc, 'kp-passkeys__wait-line kp-passkeys__wait-line--short kp-skeleton kp-skeleton--block'));
        row.append(what, make(doc, 'kp-passkeys__flags'), make(doc, 'kp-passkeys__actions'));
        list.append(row);
    }
    const keep = memory.card?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    el.prepend(list);
    if (memory.card) {
        memory.card.place();
        return;
    }
    memory.card = openBusyCard(el, {
        words: spec.loadingWords ?? strings.passkeysLoading,
        area: () => [list],
        className: 'kp-passkeys__busy',
        arrive: memory.drawn,
    });
    memory.drawn = true;
}

/** @param {HTMLElement} el @param {Memory} memory */
function draw(el, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const spec = memory.spec;
    const state = spec.state ?? 'ready';
    el.removeAttribute('aria-busy');
    memory.drawn = true;
    const had = doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement : null;
    const hadKey = had?.closest('[data-kp-passkey]')?.getAttribute('data-kp-passkey');
    const hadAct = had?.getAttribute('data-kp-passkeys-act');

    if (state === 'error' || state === 'empty' || memory.rows.length === 0) {
        const failed = state === 'error';
        el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
        const was = el.querySelector(':scope > :is(.kp-passkeys__list, .kp-passkeys__note)')?.getBoundingClientRect().height ?? 0;
        memory.height = Math.max(was, memory.height);
        const refocus = el.querySelector(':scope > .kp-passkeys__note')?.contains(doc.activeElement) ?? false;
        const note = make(doc, 'kp-empty kp-passkeys__note', 'div');
        if (memory.height > 0) note.style.minBlockSize = `${memory.height}px`;
        if (failed) note.setAttribute('data-kp-tone', 'error');
        note.setAttribute('role', failed ? 'alert' : 'status');
        const title = make(doc, 'kp-empty__title kp-passkeys__note-title', 'p');
        title.textContent = failed ? (spec.message ?? strings.passkeysError) : (spec.emptyTitle ?? strings.passkeysEmptyTitle);
        note.append(title);
        if (!failed) {
            const text = make(doc, 'kp-empty__body kp-passkeys__note-text', 'p');
            text.textContent = spec.emptyText ?? strings.passkeysEmptyText;
            note.append(text);
        }
        if (failed && spec.retry !== false) {
            const retry = make(doc, 'kp-button kp-passkeys__note-button', 'button');
            retry.setAttribute('type', 'button');
            retry.setAttribute('data-kp-passkeys-retry', '');
            retry.textContent = strings.passkeysRetry;
            note.append(retry);
        } else if (!failed && spec.register !== false) {
            const register = make(doc, 'kp-button kp-button--primary kp-passkeys__note-button', 'button');
            register.setAttribute('type', 'button');
            register.setAttribute('data-kp-passkeys-register', '');
            register.textContent = strings.passkeysRegister;
            note.append(register);
        }
        el.replaceChildren(...insecureNote(doc, spec), note, announcer(doc, memory));
        if (refocus) {
            el.tabIndex = -1;
            el.focus({ preventScroll: true });
        }
        return;
    }

    el.setAttribute('data-kp-state', 'ready');
    const options = passkeyOptions(el, spec);
    const now = (spec.now ?? Date.now)();
    const rows = sortPasskeys(memory.rows);
    memory.rowCount = rows.length;
    const last = isLast(memory);
    const list = make(doc, 'kp-passkeys__list', 'ul');
    list.setAttribute('aria-label', strings.passkeysListLabel);
    for (const row of rows) list.append(rowItem(doc, memory, row, { options, now, last }));
    el.replaceChildren(...insecureNote(doc, spec), list, announcer(doc, memory));
    memory.height = list.getBoundingClientRect().height;
    if (hadKey) {
        const li = [...el.querySelectorAll('[data-kp-passkey]')].find((item) => item.getAttribute('data-kp-passkey') === hadKey);
        const again = /** @type {HTMLElement | null} */ (
            (hadAct ? li?.querySelector(`[data-kp-passkeys-act="${hadAct}"]`) : null) ?? li?.querySelector('.kp-passkeys__rename-input')
        );
        if (again && !memory.renaming) again.focus({ preventScroll: true });
    }
}

/** @param {Document} doc @param {Memory} memory */
function announcer(doc, memory) {
    const live = make(doc, 'kp-sr-only kp-passkeys__live', 'p');
    live.setAttribute('role', 'status');
    live.textContent = memory.announce;
    memory.announce = '';
    return live;
}

/** @param {Document} doc @param {PasskeysSpec} spec */
function insecureNote(doc, spec) {
    if (!spec.insecure) return [];
    const strings = getStrings();
    const alert = make(doc, 'kp-alert kp-alert--warning kp-passkeys__insecure', 'div');
    alert.setAttribute('role', 'status');
    const body = make(doc, 'kp-alert__body');
    const label = make(doc, 'kp-alert__label');
    label.textContent = strings.passkeysInsecureTitle;
    const text = make(doc, 'kp-passkeys__insecure-text', 'span');
    text.textContent = strings.passkeysInsecureText;
    body.append(label, doc.createElement('br'), text);
    alert.append(body);
    return [alert];
}

/**
 * @param {Document} doc @param {Memory} memory @param {PasskeyRow} row
 * @param {{ options: ReturnType<typeof passkeyOptions>, now: number, last: boolean }} context
 */
function rowItem(doc, memory, row, { options, now, last }) {
    const strings = getStrings();
    const kind = PASSKEY_KINDS.includes(row.kind ?? 'passkey') ? (row.kind ?? 'passkey') : 'passkey';
    const id = `kp-passkey-${++seq}`;
    const busy = memory.busy.has(row.key);
    const renaming = memory.renaming === row.key;
    const refused = memory.refused.get(row.key);
    const li = make(doc, 'kp-passkeys__row', 'li');
    li.setAttribute('data-kp-passkey', row.key);
    li.setAttribute('data-kp-kind', kind);
    if (row.current) li.setAttribute('data-kp-current', '');
    if (busy) li.setAttribute('aria-busy', 'true');

    const way = make(doc, 'kp-passkeys__way');
    way.append(glyph(doc, /** @type {PasskeyKind} */ (kind)));
    const what = make(doc, 'kp-passkeys__what');

    if (renaming) {
        const form = make(doc, 'kp-passkeys__rename', 'div');
        const label = make(doc, 'kp-sr-only', 'label');
        label.setAttribute('for', `${id}-name`);
        label.textContent = strings.passkeysRenameLabel;
        const input = /** @type {HTMLInputElement} */ (make(doc, 'kp-field__input kp-passkeys__rename-input', 'input'));
        input.setAttribute('id', `${id}-name`);
        input.setAttribute('type', 'text');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('value', row.label);
        input.value = row.label;
        if (refused) {
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', `${id}-hint`);
        }
        if (busy) input.setAttribute('disabled', '');
        form.append(label, input);
        what.append(form);
    } else {
        const name = make(doc, 'kp-passkeys__label', 'p');
        name.textContent = row.label;
        what.append(name);
    }

    const meta = make(doc, 'kp-passkeys__meta', 'p');
    const kindWord = make(doc, 'kp-passkeys__kind');
    kindWord.textContent = strings.passkeysKind(kind);
    meta.append(kindWord);
    if (row.createdAt != null && Number.isFinite(row.createdAt)) {
        const added = make(doc, 'kp-passkeys__when', 'time');
        added.setAttribute('datetime', new Date(row.createdAt).toISOString());
        added.title = agoMoment(row.createdAt);
        added.textContent = strings.passkeysAdded(agoMoment(row.createdAt).slice(0, 10));
        meta.append(added);
    }
    const used = make(doc, 'kp-passkeys__when', 'time');
    if (row.lastUsedAt != null && Number.isFinite(row.lastUsedAt)) {
        used.setAttribute('datetime', new Date(row.lastUsedAt).toISOString());
        used.title = agoMoment(row.lastUsedAt);
        used.textContent = agoText(strings.passkeysLastUsedVerb, row.lastUsedAt, now);
    } else used.textContent = strings.passkeysNeverUsed;
    meta.append(used);
    what.append(meta);

    // The line under the facts: the reason a button is off, the days unused, or what the server said.
    const flags = make(doc, 'kp-passkeys__flags');
    if (row.current && options.markCurrent) {
        const badge = make(doc, 'kp-badge kp-badge--info kp-passkeys__current');
        badge.textContent = strings.passkeysCurrent;
        badge.title = strings.passkeysCurrentTitle;
        flags.append(badge);
    }
    const days = row.current ? null : unusedDays(row, now, options.neverUsedAfter);
    if (days !== null) {
        const badge = make(doc, 'kp-badge kp-badge--warning kp-passkeys__unused');
        badge.textContent = strings.passkeysUnused(days);
        badge.title = strings.passkeysUnusedTitle;
        flags.append(badge);
    }

    const refuseLast = last && options.protectLast === 'refuse';
    const hint = make(doc, 'kp-passkeys__hint', 'p');
    hint.setAttribute('id', `${id}-hint`);
    if (refused) {
        hint.setAttribute('role', 'alert');
        hint.setAttribute('data-kp-tone', 'error');
        hint.textContent = refused;
    } else if (refuseLast) {
        hint.setAttribute('data-kp-tone', 'warning');
        hint.textContent = strings.passkeysLastWay;
    } else if (last && options.protectLast === 'confirm') {
        hint.textContent = strings.passkeysLastWayWarn;
    } else hint.hidden = true;
    what.append(hint);

    const actions = make(doc, 'kp-passkeys__actions');
    if (renaming) {
        const save = make(doc, 'kp-button kp-button--sm kp-button--primary kp-passkeys__action', 'button');
        save.setAttribute('type', 'button');
        save.setAttribute('data-kp-passkeys-act', 'save');
        save.textContent = strings.passkeysSave;
        const cancel = make(doc, 'kp-button kp-button--sm kp-passkeys__action', 'button');
        cancel.setAttribute('type', 'button');
        cancel.setAttribute('data-kp-passkeys-act', 'cancel');
        cancel.textContent = strings.passkeysCancel;
        if (busy) {
            save.setAttribute('disabled', '');
            save.setAttribute('aria-busy', 'true');
            cancel.setAttribute('disabled', '');
        }
        actions.append(save, cancel);
    } else {
        const rename = make(doc, 'kp-button kp-button--sm kp-passkeys__action', 'button');
        rename.setAttribute('type', 'button');
        rename.setAttribute('data-kp-passkeys-act', 'rename');
        rename.setAttribute('aria-label', strings.passkeysRenameOf(row.label));
        rename.textContent = strings.passkeysRename;
        const del = make(doc, 'kp-button kp-button--sm kp-button--destructive kp-passkeys__action', 'button');
        del.setAttribute('type', 'button');
        del.setAttribute('data-kp-passkeys-act', 'remove');
        del.setAttribute('aria-label', strings.passkeysRemoveOf(row.label));
        del.textContent = busy ? strings.passkeysRemoving : strings.passkeysRemove;
        if (busy) {
            del.setAttribute('disabled', '');
            del.setAttribute('aria-busy', 'true');
            rename.setAttribute('disabled', '');
            del.prepend(make(doc, 'kp-spinner'));
        } else if (refuseLast) {
            // Not `disabled`: it stays reachable by the keyboard and says why.
            del.setAttribute('aria-disabled', 'true');
            del.setAttribute('data-kp-disabled-reason', strings.passkeysLastWay);
            del.setAttribute('aria-describedby', `${id}-hint`);
            del.title = strings.passkeysLastWay;
            del.addEventListener('click', (event) => event.stopPropagation(), { capture: true });
        }
        if (refuseLast && options.refuseLook === 'note') {
            // The button gives way to the reason, in its place.
            const only = make(doc, 'kp-passkeys__only');
            only.textContent = strings.passkeysOnlyWay;
            only.title = strings.passkeysLastWay;
            actions.append(rename, only);
        } else actions.append(rename, del);
    }
    li.append(way, what, flags, actions);
    return li;
}

/**
 * Fill every `[data-kp-passkeys]` under `root` that carries its spec as JSON in
 * the attribute (a page that draws with setPasskeys() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachPasskeys(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(PASSKEYS))) {
        const json = el.getAttribute('data-kp-passkeys') ?? '';
        if (json.trim().startsWith('{') && !MEMORY.has(el)) {
            try {
                setPasskeys(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
