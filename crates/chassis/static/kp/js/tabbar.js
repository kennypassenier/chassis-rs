// The bottom tab bar for phone widths [kpadopt-nav].
//
// The homelab dashboard drew its own (`.nx-tabbar`, chrome.js
// `mountTabBar`): the four frequent areas within thumb reach, a "More" tab
// that opens a sheet, a count on the tab that needs the reader. The look is
// CSS (`.kp-tabbar` in css/components.css, one answer per register); this
// file is the little that CSS cannot do:
//
//   <nav class="kp-tabbar" aria-label="Areas">
//     <a class="kp-tabbar__tab" href="/" aria-current="page" data-kp-tab="home">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Home</span>
//     </a>
//     <a class="kp-tabbar__tab" href="/inbox" data-kp-tab="inbox">
//       <span class="kp-tabbar__icon"><svg …/></span>
//       <span class="kp-tabbar__label">Needs you</span>
//       <span class="kp-badge kp-tabbar__badge" hidden></span>
//     </a>
//     <button type="button" class="kp-tabbar__tab kp-tabbar__tab--more" data-kp-dialog="more-drawer">
//       <span class="kp-tabbar__icon kp-tabbar__icon--more" aria-hidden="true"></span>
//       <span class="kp-tabbar__label">More</span>
//     </button>
//   </nav>
//   <dialog class="kp-drawer kp-dialog" id="more-drawer">…</dialog>
//
// The More tab opens a drawer through the page's existing `data-kp-dialog`
// wiring (attachDialogs, js/overlays.js); this adds what a tab bar needs of
// it: the tab says it opens a dialog (`aria-haspopup`) and whether it is open
// (`aria-expanded`), and it reads as the current tab (`aria-current="true"`, a
// current item of the set, as the folding bar's More button does) while the
// drawer holds the current page, that is while a `[aria-current]` link is
// inside it. A tab the page marked itself is left as the page marked it.
//
// The drawer is closed by its close button (give it a visible glyph: `×`),
// Escape, a press on the strip of page the drawer leaves open at its start edge
// on a phone (`dialog[data-kp-tabbar-drawer]`, css/components.css), and a press
// on one of its entries.
//
// The bar publishes its height as `--kp-tabbar-height` on the root while it is
// on the screen (0px when it is not), so the page keeps its last line, a toast
// and the back-to-top control clear of it, whatever the theme or the safe-area
// inset makes of its height.
//
// `setTabbarBadge(tab, count)` writes a count (every digit of it, never capped or abbreviated; hidden at 0
// or null); `setTabbarCurrent(bar, id)` moves `aria-current` to the tab with
// that `data-kp-tab`; `setTabbarBusy(tab, busy)` puts one tab to wait. Nothing runs on import; attachTabbars(root) returns a
// detach.
//
// A count on a tab of the underline row [gap-tab-count; the admin dashboard's `sh-count` on a stack page, "Apps 7 · Logs 12"].
// The bottom bar has had its badge since kpadopt-nav; the row of `.kp-tab` had none, so the dashboard drew a grey pill of its own
// and a number that appeared late moved the tab. The count is a part of the tab, written from attributes (an attribute change
// redraws it) or by `setTabCount(tab, count, options)`:
//
//   <button type="button" class="kp-tab" role="tab" aria-selected="false"
//           data-kp-tab-count="12" data-kp-tab-count-tone="error" data-kp-tab-count-unit="error,errors">Logs</button>
//
//   data-kp-tab-count            the exact number (12 is 12 and 1534 is 1534, never `9+`); empty or absent: no count (not 0)
//   data-kp-tab-count-tone       neutral (default), info, success, warning or error: the badge's own plates
//   data-kp-tab-count-unit       "error,errors": the word after the number, singular then plural. A screen reader always hears it
//                            ("Logs, 12 errors"); it is drawn too with `data-kp-tab-count-show-unit`
//   data-kp-tab-count-state      loading: a skeleton the width of the last number (two digits at first), never a 0; error: a dash,
//                            and the words "could not be counted" for a screen reader and the title
//   data-kp-tab-count-zero       show: a 0 is information ("History 0 incidents"); otherwise 0 draws nothing
//
// The room of the digits is held (`--kp-tab-count-digits`, never fewer than two), so a number that arrives, grows a digit or
// changes tone moves no tab. Nothing runs on import; attachTabCounts(root) returns a detach.

import { getStrings } from './strings.js';

/** A tab bar. */
export const TABBAR = '.kp-tabbar';

/** The root property the bar's height is published on while the bar is shown. */
export const TABBAR_HEIGHT_PROPERTY = '--kp-tabbar-height';

/**
 * Write a count on a tab: all its digits (12 is 12 and 1534 is 1534, never `99+`
 * or `1.5k`: Kenny, 2026-10-03, a counter shows the real number), nothing and hidden at
 * 0 or `null`. The badge is made when the tab has none. A tab that has a
 * count is the one place the bar speaks for something that moved, so the
 * count is also on the tab as `data-kp-count`, for a register or a test.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {number | null} count
 * @returns {HTMLElement | null} the badge
 */
export function setTabbarBadge(tab, count) {
    // The same call on a tab of the underline row writes its count part instead (one function covers both bars).
    if (tab.matches('.kp-tab') && !tab.matches('.kp-tabbar__tab')) return setTabCount(tab, count);
    let badge = /** @type {HTMLElement | null} */ (tab.querySelector('.kp-tabbar__badge'));
    const whole = count === null || !Number.isFinite(count) ? 0 : Math.trunc(count);
    const none = whole <= 0;
    if (!badge) {
        if (none) return null;
        badge = tab.ownerDocument.createElement('span');
        badge.className = 'kp-badge kp-tabbar__badge';
        tab.append(badge);
    }
    badge.hidden = none;
    badge.textContent = none ? '' : String(whole);
    if (none) tab.removeAttribute('data-kp-count');
    else tab.setAttribute('data-kp-count', String(whole));
    return badge;
}

/**
 * Make one tab the current page: `aria-current="page"` on it, off the others.
 * A `data-kp-tab` that matches no tab leaves every tab not current, which is
 * right for a page that lives behind the More tab (that tab marks itself).
 *
 * @param {Element} bar a `.kp-tabbar`
 * @param {string | null} id the `data-kp-tab` of the current tab
 */
export function setTabbarCurrent(bar, id) {
    // A tab that opens a dialog is current by what its dialog holds (attachTabbars), not by this.
    for (const tab of bar.querySelectorAll('.kp-tabbar__tab:not([data-kp-dialog])')) {
        if (id !== null && tab.getAttribute('data-kp-tab') === id) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
    }
}

/**
 * Put a tab to wait: `aria-busy` on it and the theme's own spinner
 * (`.kp-spinner`) in the icon's place, which has its size, so the tab does not
 * move. Not busy puts the icon back.
 *
 * @param {Element} tab a `.kp-tabbar__tab`
 * @param {boolean} busy
 */
export function setTabbarBusy(tab, busy) {
    const icon = tab.querySelector('.kp-tabbar__icon');
    if (!icon) return;
    const spinner = icon.querySelector(':scope > .kp-spinner');
    tab.toggleAttribute('aria-busy', busy);
    if (busy) tab.setAttribute('aria-busy', 'true');
    if (busy && !spinner) {
        const made = tab.ownerDocument.createElement('span');
        made.className = 'kp-spinner';
        made.setAttribute('aria-hidden', 'true');
        icon.append(made);
    } else if (!busy) spinner?.remove();
}

/** A tab of the underline row. */
export const TAB = '.kp-tab';

/** The tones a count may carry; each is a plate the badge already has. */
export const TAB_COUNT_TONES = /** @type {const} */ (['neutral', 'info', 'success', 'warning', 'error']);

/** @typedef {'neutral' | 'info' | 'success' | 'warning' | 'error'} TabCountTone */

/** Fired on a tab (bubbling) when what its count shows changed: `{ tab, count, state, tone }`. */
export const TAB_COUNT_EVENT = 'kp-tab-count';

/** The attributes a count is drawn from. */
const COUNT_ATTRIBUTES = [
    'data-kp-tab-count',
    'data-kp-tab-count-tone',
    'data-kp-tab-count-unit',
    'data-kp-tab-count-state',
    'data-kp-tab-count-zero',
    'data-kp-tab-count-show-unit',
];

/** The badge class of each tone. @type {Record<string, string>} */
const TONE_CLASS = { info: 'kp-badge--info', success: 'kp-badge--success', warning: 'kp-badge--warning', error: 'kp-badge--destructive' };

/**
 * What a tab's attributes ask for.
 * @param {Element} tab
 * @returns {{ state: 'none' | 'loading' | 'error' | 'ready', count: number | null, tone: TabCountTone, unit: string[], zero: boolean, showUnit: boolean }}
 */
function countOf(tab) {
    const raw = tab.getAttribute('data-kp-tab-count');
    const asked = tab.getAttribute('data-kp-tab-count-state');
    const number = raw === null || raw.trim() === '' || Number.isNaN(Number(raw)) ? null : Math.max(0, Math.trunc(Number(raw)));
    const state =
        raw === 'loading' || asked === 'loading' ? 'loading' : raw === 'error' || asked === 'error' ? 'error' : number === null ? 'none' : 'ready';
    const tone = /** @type {TabCountTone} */ (TAB_COUNT_TONES.find((t) => t === tab.getAttribute('data-kp-tab-count-tone')) ?? 'neutral');
    const unit = (tab.getAttribute('data-kp-tab-count-unit') ?? '')
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean);
    return {
        state,
        count: number,
        tone,
        unit,
        zero: tab.getAttribute('data-kp-tab-count-zero') === 'show',
        showUnit: tab.hasAttribute('data-kp-tab-count-show-unit'),
    };
}

/** What each tab last drew, so a redraw of the same count says nothing and writes nothing. @type {WeakMap<Element, string>} */
const DRAWN = new WeakMap();

/**
 * Draw the count part of one tab from its attributes. Made when missing, kept in place otherwise.
 *
 * @param {Element} tab a `.kp-tab`
 * @returns {HTMLElement | null} the count part, null while the tab has none
 */
export function drawTabCount(tab) {
    const doc = tab.ownerDocument;
    const s = getStrings();
    const { state, count, tone, unit, zero, showUnit } = countOf(tab);
    let part = /** @type {HTMLElement | null} */ (tab.querySelector(':scope > .kp-tab__count'));
    const shown = state === 'loading' || state === 'error' || (state === 'ready' && (zero || (count ?? 0) > 0));
    if (!shown) {
        part?.remove();
        if (DRAWN.has(tab)) {
            DRAWN.delete(tab);
            tab.dispatchEvent(new CustomEvent(TAB_COUNT_EVENT, { bubbles: true, detail: { tab, count: null, state: 'none', tone } }));
        }
        return null;
    }
    if (!part) {
        part = doc.createElement('span');
        tab.append(part);
    }
    // The key of what is drawn: nothing below is touched when it is the same (a refresh that reads the same number).
    const word = unit.length === 0 ? '' : count === 1 || unit.length === 1 ? unit[0] : unit[1];
    const key = [state, count, tone, word, showUnit].join('|');
    if (DRAWN.get(tab) === key && part.isConnected) return part;
    DRAWN.set(tab, key);

    part.className = `kp-badge kp-tab__count${TONE_CLASS[tone] ? ` ${TONE_CLASS[tone]}` : ''}`;
    part.setAttribute('data-kp-tone', tone);
    part.setAttribute('data-kp-state', state);
    part.removeAttribute('title');
    // The room of the digits, held: the last number's, two at least. Loading keeps what the last number had.
    if (state === 'ready' && count !== null) part.style.setProperty('--kp-tab-count-digits', String(Math.max(2, String(count).length)));
    else if (!part.style.getPropertyValue('--kp-tab-count-digits')) part.style.setProperty('--kp-tab-count-digits', '2');

    /** @param {string} text @param {string} [className] */
    const span = (text, className) => {
        const node = doc.createElement('span');
        if (className) node.className = className;
        node.textContent = text;
        return node;
    };
    // The tab's name reads "Logs, 12 errors": the comma is for the screen reader only.
    const lead = span(', ', 'kp-sr-only');
    if (state === 'loading') {
        const bone = doc.createElement('span');
        bone.className = 'kp-skeleton kp-tab__bone';
        bone.setAttribute('role', 'img');
        bone.setAttribute('aria-label', s.tabCountCounting);
        part.replaceChildren(lead, bone);
    } else if (state === 'error') {
        const dash = span('–');
        dash.setAttribute('aria-hidden', 'true');
        part.replaceChildren(lead, dash, span(s.tabCountFailed, 'kp-sr-only'));
        part.title = s.tabCountFailed;
    } else {
        const nodes = [lead, span(String(count))];
        if (word) nodes.push(showUnit ? span(` ${word}`, 'kp-tab__unit') : span(` ${word}`, 'kp-sr-only'));
        part.replaceChildren(...nodes);
    }
    tab.dispatchEvent(new CustomEvent(TAB_COUNT_EVENT, { bubbles: true, detail: { tab, count: state === 'ready' ? count : null, state, tone } }));
    return part;
}

/**
 * Write the count of a tab of the underline row: every digit of it (12 is 12 and 1534 is 1534, never `9+` or `1.5k`), nothing at
 * `null` (a tab that has not been counted is not a tab with 0), nothing at 0 unless `zero: 'show'`. `'loading'` draws a skeleton
 * the width of the last number, `'error'` a dash with the words "could not be counted" for a screen reader. An option left out keeps
 * what the tab already says, so a refresh is `setTabCount(tab, 13)`; `null` as an option takes it away. The call writes the
 * `data-kp-tab-count…` attributes and draws, so markup and call are one thing.
 *
 * @param {Element} tab a `.kp-tab`
 * @param {number | null | 'loading' | 'error'} count
 * @param {{ tone?: TabCountTone | null, unit?: string | null, zero?: 'show' | 'hide' | null, showUnit?: boolean | null }} [options]
 *        `unit` is the singular and the plural, "error,errors"
 * @returns {HTMLElement | null} the count part
 */
export function setTabCount(tab, count, options = {}) {
    if (count === 'loading' || count === 'error') {
        // The last number stays on the tab: the skeleton keeps its width, and the number comes back with the next call.
        tab.setAttribute('data-kp-tab-count-state', count);
    } else {
        tab.removeAttribute('data-kp-tab-count-state');
        const whole = count === null || !Number.isFinite(count) ? null : Math.max(0, Math.trunc(count));
        if (whole === null) tab.removeAttribute('data-kp-tab-count');
        else tab.setAttribute('data-kp-tab-count', String(whole));
    }
    /** @param {string} name @param {string | null | undefined} value */
    const put = (name, value) => {
        if (value === undefined) return;
        if (value === null || value === '') tab.removeAttribute(name);
        else tab.setAttribute(name, value);
    };
    put('data-kp-tab-count-tone', options.tone);
    put('data-kp-tab-count-unit', options.unit);
    put('data-kp-tab-count-zero', options.zero === 'hide' ? null : options.zero);
    if (options.showUnit !== undefined) tab.toggleAttribute('data-kp-tab-count-show-unit', options.showUnit === true);
    return drawTabCount(tab);
}

/**
 * Keep the count of every tab under `root` drawn from its attributes: now, and whenever an attribute of the count changes or a
 * tab comes. Idempotent.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTabCounts(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    const asked = `${TAB}[data-kp-tab-count], ${TAB}[data-kp-tab-count-state]`;
    const all = () => {
        const found = /** @type {Element[]} */ ([]);
        if (root instanceof Element && root.matches(asked)) found.push(root);
        for (const tab of root.querySelectorAll(asked)) found.push(tab);
        return found;
    };
    for (const tab of all()) drawTabCount(tab);
    if (!view || typeof view.MutationObserver !== 'function') return () => {};
    const watch = new view.MutationObserver((records) => {
        /** @type {Set<Element>} */
        const todo = new Set();
        for (const record of records) {
            if (record.type === 'attributes') {
                if (record.target instanceof view.Element && record.target.matches(TAB)) todo.add(record.target);
            } else
                for (const node of record.addedNodes)
                    if (node instanceof view.Element) {
                        if (node.matches(asked)) todo.add(node);
                        for (const tab of node.querySelectorAll(asked)) todo.add(tab);
                    }
        }
        for (const tab of todo) drawTabCount(tab);
    });
    watch.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: COUNT_ATTRIBUTES,
    });
    return () => watch.disconnect();
}

/** @param {HTMLElement} bar @returns {() => void} */
function wire(bar) {
    const doc = bar.ownerDocument;
    const view = doc.defaultView;
    if (!view) return () => {};
    /** @type {(() => void)[]} */
    const undo = [];

    // The height, published while the bar is on the screen. A static bar sits in
    // the page's flow and gives nobody room to keep.
    if (!bar.classList.contains('kp-tabbar--static')) {
        const root = doc.documentElement;
        const publish = () => {
            const shown = view.getComputedStyle(bar).display !== 'none';
            root.style.setProperty(TABBAR_HEIGHT_PROPERTY, shown ? `${bar.offsetHeight}px` : '0px');
        };
        const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
        resize?.observe(bar);
        view.addEventListener('resize', publish);
        publish();
        undo.push(() => {
            resize?.disconnect();
            view.removeEventListener('resize', publish);
            root.style.removeProperty(TABBAR_HEIGHT_PROPERTY);
        });
    }

    // A tab that opens a dialog: say so, and follow the dialog.
    for (const el of bar.querySelectorAll('.kp-tabbar__tab[data-kp-dialog]')) {
        const tab = /** @type {HTMLElement} */ (el);
        const dialog = doc.getElementById(tab.dataset.kpDialog ?? '');
        if (!(dialog instanceof HTMLDialogElement)) continue;
        tab.setAttribute('aria-haspopup', 'dialog');
        tab.setAttribute('aria-controls', dialog.id);
        // Whether it was this script that marked the tab current, so it takes back only that.
        let marked = false;
        const sync = () => {
            tab.setAttribute('aria-expanded', String(dialog.open));
            const held = dialog.querySelector('[aria-current]:not([aria-current="false"])') !== null;
            if (held && !tab.hasAttribute('aria-current')) {
                tab.setAttribute('aria-current', 'true');
                marked = true;
            } else if (!held && marked) {
                tab.removeAttribute('aria-current');
                marked = false;
            }
        };
        sync();
        // The way back, four ways [Kenny, kpadopt-nav, 2026-10-16: More "opened full screen on the right side and there
        // was no way to go back"]: the close button and Escape are the dialog's own; a press outside the panel (the
        // strip of page the drawer leaves on a phone) and a press on one of its entries are this bar's. An entry that
        // is a link still follows its link: the drawer is closed after the press, not instead of it.
        dialog.setAttribute('data-kp-tabbar-drawer', '');
        const onPress = (/** @type {MouseEvent} */ event) => {
            if (!dialog.open) return;
            const target = event.target;
            if (target === dialog) {
                const box = dialog.getBoundingClientRect();
                const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
                if (outside) dialog.close();
                return;
            }
            if (target instanceof Element && target.closest('a[href], .kp-menu__item') !== null && target.closest('[data-kp-dialog-close]') === null)
                view.setTimeout(() => dialog.close(), 0);
        };
        dialog.addEventListener('click', onPress);
        const watch = new MutationObserver(sync);
        watch.observe(dialog, { attributes: true, attributeFilter: ['open', 'aria-current'], subtree: true });
        dialog.addEventListener('close', sync);
        undo.push(() => {
            watch.disconnect();
            dialog.removeEventListener('close', sync);
            dialog.removeEventListener('click', onPress);
            dialog.removeAttribute('data-kp-tabbar-drawer');
            tab.removeAttribute('aria-haspopup');
            tab.removeAttribute('aria-controls');
            tab.removeAttribute('aria-expanded');
            if (marked) tab.removeAttribute('aria-current');
        });
    }

    return () => undo.splice(0).forEach((off) => off());
}

/** The bars wired already, so a second call is a no-op for them. */
const wired = new WeakSet();

/**
 * Wire every tab bar under `root`. Idempotent.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTabbars(root = document) {
    /** @type {(() => void)[]} */
    const undo = [];
    /** @type {HTMLElement[]} */
    const found = [];
    if (root instanceof HTMLElement && root.matches(TABBAR)) found.push(root);
    for (const el of root.querySelectorAll(TABBAR)) found.push(/** @type {HTMLElement} */ (el));
    for (const bar of found) {
        if (wired.has(bar)) continue;
        wired.add(bar);
        const off = wire(bar);
        undo.push(() => {
            off();
            wired.delete(bar);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}
