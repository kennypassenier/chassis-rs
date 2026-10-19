// The entity card: one fixed card per thing (a stack), the same height in every state [kpadopt6-ops; homelab's Overview
// cards, `cardEl` in admin/web/js/pages/overview.js and `sk-card*` in css/pages/stacks.css].
//
//   <div class="kp-entity-grid" data-kp-entity-grid></div>
//   setEntityGrid(grid, [{ key: 'media', name: 'media', vmid: '106', state: { label: 'running', tone: 'success' },
//       figures: [{ value: '3/5', label: 'apps up' }, { value: '12', label: 'restarts' }],
//       flags: [{ label: 'update available', tone: 'warning' }],
//       meters: [{ label: 'CPU', value: 0.34 }, { label: 'RAM', value: 0.71, text: '5.6 of 8 GB' }],
//       actions: [{ id: 'restart', label: 'Restart' }, { id: 'logs', label: 'Logs' }, { id: 'remove', label: 'Remove', danger: true }] }]);
//
// Every card is the same grid of rows, kept whether a row has anything in it or not: the identity (an optional tick, the
// mark made from the name, the name as a link, the id, the state in words), the figures, the flags, the meters and the
// actions. A card with no flag keeps its flag row, so every card in every state is as high as the next. A live refill
// (`setEntity` again with the same key) changes the words in place; the card is never rebuilt under the pointer or the focus.
// Options, as attributes on the grid or on one card:
//
//   data-kp-entity-meters      how many meter rows a card holds, 0 to 3 (default 2)
//   data-kp-entity-flags-max   how many flags show; the rest are an exact "+2" that opens the package's own menu (default 3)
//   data-kp-entity-inline      the most actions that stand as buttons; the rest go in a "More" menu (default 3); a phone folds all.
//                              The actions come only from the data: none means no actions row at all, and the columns are as
//                              many as the grid's busiest card needs, the same for every card; a button that does not fit the
//                              card's width goes in "More" as well, for the whole grid, and comes back when the grid widens
//   data-kp-entity-link        the name's link: a template with `{key}`; the whole card is its click target (one tab stop)
//   data-kp-selectable         a tick at the start of the card (it is a row of a selection: `data-kp-row-key`, the keys j k x)
//   data-kp-entity-mark        `idmark` (default, from the name), `icon` or `none`
//   data-kp-density            `comfortable` (default) or `compact` (the figures row goes)
//   data-kp-entity-min         on the grid: the least width of a card (default 22rem)
//   data-kp-state              on a card: `loading`, `empty` ("not measured") or `error` (the state turns destructive and a
//                              Retry takes the actions' place); on the grid: `loading` (skeleton cards and the busy card),
//                              `empty` ("No stacks yet" and its action) or `error` (the failed plate with Retry)
//   data-kp-entity-empty-action  `none`: the empty plate ("No stacks yet") has no action; `setEntityGridState(grid, 'empty', { actionLabel,
//                              onAction })` words it and runs your function instead of firing `kp-entity-new`
//   data-kp-entity-trend       the trend row (`trend: number[]`, a 24-hour line drawn with kpi.js's drawSparkline, the current value
//                              beside it): `auto` (default: every card of the grid has the row as soon as one card has a `trend`),
//                              `on` (always) or `off`. A card with fewer than two readings keeps the row and says "no line yet"
//   data-kp-entity-kind        `stack` (default) or `tile`: an app or link tile, see below
//   data-kp-entity-star        a favourite star at the end of the identity row: `on` or `off` (default `on` on a tile, `off` on a stack)
//   data-kp-entity-star-key    the key that stars the card while the focus is inside it (default `s`; `off` for none)
//
// The tile (`data-kp-entity-kind="tile"`, homelab's Apps page `tileEl`): the whole card is one link to `href` (the name is the real
// anchor, stretched over the card; one tab stop), with the mark made from the name, the state as a dot and a word, a description that
// wraps whole, and `lines` (small facts, newest first) standing at the foot, so the lines of every tile in a row line up. The star is
// a real toggle button (js/toggle.js) above the link: pressing it, or pressing its key, never follows the link. The data is
//
//   { key: 'jellyfin', name: 'Jellyfin', href: 'https://jellyfin.example.net', external: true, starred: true,
//     description: 'Movies, series and music for the house', state: { label: 'up', tone: 'success' },
//     lines: ['5 items, 3 playing', '03:12:44 Info Playback: Kenny started Dune'] }
//
// A tile in `error` shows "reading failed" and a Retry in place of its description and lines; `loading` is bones in the same rows;
// `empty` says "not measured" in the lines row. A tile has no actions row: one click opens it.
//
// Events (bubbling, on the card): `kp-entity-action` `{ key, id }`, `kp-entity-flag` `{ key, flag }`, `kp-entity-tick`
// `{ key, ticked }`, `kp-entity-star` `{ key, starred }`, `kp-entity-retry` `{ key }`; on the grid `kp-entity-new` and
// `kp-entity-grid-retry`. The page keeps the favourites and sorts by them; a refill with `starred` is the way back from a refusal.
// The "+2" and the "More" are the package's menu button. Nothing runs on import.

import { setIdmark } from './idmark.js';
import { setMeter, drawSparkline } from './kpi.js';
import { attachToggles } from './toggle.js';
import { setMenu, attachMenuButtons } from './menu-button.js';
import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { statePlate } from './state-plate.js';
import { holdFootprint } from './footprint.js';

/** The grids this module looks after. */
export const ENTITY_GRID = '[data-kp-entity-grid]';
/** A card this module looks after. */
export const ENTITY_CARD = '[data-kp-entity]';
/** Fired on the card when an action is pressed: `{ key, id }`. */
export const ENTITY_ACTION_EVENT = 'kp-entity-action';
/** Fired on the card when a flag is picked in the "+N" menu: `{ key, flag }`. */
export const ENTITY_FLAG_EVENT = 'kp-entity-flag';
/** Fired on the card when its tick changes: `{ key, ticked }`. */
export const ENTITY_TICK_EVENT = 'kp-entity-tick';
/** Fired on the card when its star is pressed: `{ key, starred }`. */
export const ENTITY_STAR_EVENT = 'kp-entity-star';
/** Fired on the card when its Retry is pressed: `{ key }`. */
export const ENTITY_RETRY_EVENT = 'kp-entity-retry';
/** Fired on the grid when its action is pressed. */
export const ENTITY_NEW_EVENT = 'kp-entity-new';
/** Fired on the grid when its Retry is pressed. */
export const ENTITY_GRID_RETRY_EVENT = 'kp-entity-grid-retry';

/**
 * @typedef {object} EntityData
 * @property {string} key a stable id, for selection, undo and a live refresh
 * @property {string} name
 * @property {string} [vmid] a small id beside the name
 * @property {{ label: string, tone?: 'success' | 'warning' | 'destructive' | 'info' }} [state]
 * @property {{ value: string, label: string }[]} [figures]
 * @property {{ label: string, tone?: 'success' | 'warning' | 'destructive' | 'info' }[]} [flags]
 * @property {{ label: string, value: number | null, mark?: number, tone?: 'success' | 'neutral' | 'warning' | 'destructive', text?: string }[]} [meters]
 * @property {{ id: string, label: string, danger?: boolean, disabled?: string }[]} [actions]
 * @property {number[]} [trend] the readings of the trend row, oldest first (a 24-hour CPU line); fewer than two say "no line yet"
 * @property {string} [trendLabel] the trend row's label ("CPU 24 h"); the package's word "Trend" when absent
 * @property {string} [trendText] the current value beside the line ("34%"); the last reading when absent
 * @property {string} [href] a tile's link: the whole card opens it
 * @property {boolean} [external] the link opens a new tab (a glyph shows, and a screen reader is told)
 * @property {string} [description] a tile's description; it wraps whole
 * @property {string[]} [lines] a tile's small facts, one per line, at the foot
 * @property {boolean} [starred] the favourite star is on; a refill with it changes the star in place
 * @property {'ready' | 'loading' | 'empty' | 'error'} [status]
 * @property {string} [error] why a card in `error` failed
 */

/**
 * @typedef {object} EntityEmptyOptions
 * @property {string} [title] the plate's heading
 * @property {string} [message] the line under it
 * @property {string} [actionLabel] the action's words
 * @property {'none'} [action] `none`: the plate has no action
 * @property {(event: MouseEvent) => void} [onAction] what the action does, in place of firing `kp-entity-new`
 */

/** What each card was last drawn from, so a refill changes only what changed; `star` is the star as it stands now. @type {WeakMap<Element, { data: EntityData, drawn: Record<string, string>, star: boolean }>} */
const DRAWN = new WeakMap();

/** @param {Element} el @param {string} name @returns {string | null} */
const opt = (el, name) => el.getAttribute(name) ?? el.closest(ENTITY_GRID)?.getAttribute(name) ?? null;

/** @param {Document} doc @param {string} tag @param {string} className */
const made = (doc, tag, className) => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/** @param {unknown} value */
const sig = (value) => JSON.stringify(value);

/** The slots of a card, in order, for each kind. */
const SLOTS = {
    stack: ['id', 'figures', 'flags', 'meters', 'actions'],
    tile: ['id', 'state', 'description', 'lines'],
};

/** @param {HTMLElement} card @returns {'stack' | 'tile'} */
const kindOf = (card) => (opt(card, 'data-kp-entity-kind') === 'tile' ? 'tile' : 'stack');

/** @param {HTMLElement} card @param {string} slot */
const slotOf = (card, slot) => /** @type {HTMLElement} */ (card.querySelector(`:scope > .kp-entity__${slot}`));

/**
 * Make sure a card holds all the slots of its kind, once (again when the kind changes).
 * @param {HTMLElement} card
 * @returns {'stack' | 'tile'}
 */
function frame(card) {
    const kind = kindOf(card);
    if (card.dataset.kpEntityFramed === kind) return kind;
    card.dataset.kpEntityFramed = kind;
    const doc = card.ownerDocument;
    card.classList.add('kp-card', 'kp-card--entity');
    card.setAttribute('data-kp-entity', '');
    card.toggleAttribute('data-kp-entity-tile', kind === 'tile');
    card.replaceChildren(...SLOTS[kind].map((slot) => made(doc, 'div', `kp-entity__${slot}`)));
    const was = DRAWN.get(card);
    if (was) was.drawn = {};
    return kind;
}

/**
 * How many columns the actions stand in: the most buttons any card of the grid shows (at most `inline`), and one more for
 * a "More" when some card has actions left over. Never fewer than one.
 * @param {HTMLElement} host the grid, or the card when it stands alone
 * @param {number} inline
 */
function columnsFor(host, inline) {
    const cards = host.matches(ENTITY_GRID) ? [...host.querySelectorAll(':scope > .kp-card--entity')] : [host];
    let most = 0;
    let more = false;
    for (const card of cards) {
        const data = DRAWN.get(card)?.data;
        if (!data || data.status === 'loading') continue;
        const n = (data.actions ?? []).length;
        most = Math.max(most, Math.min(n, inline));
        if (n > inline) more = true;
    }
    return Math.max(1, most + (more ? 1 : 0));
}

/**
 * Take a flag out of the row (into the "+N") while the row is wider than the card, one at a time, as soon as the card is laid out.
 * @param {HTMLElement} card
 * @param {number} shown how many flags are drawn now
 */
function fitFlags(card, shown) {
    const view = card.ownerDocument.defaultView;
    view?.requestAnimationFrame(() => {
        const row = slotOf(card, 'flags');
        if (!row || !card.isConnected || shown <= 0) return;
        if (row.scrollWidth > row.clientWidth + 1) {
            card.dataset.kpFlagsFit = String(shown - 1);
            const was = DRAWN.get(card);
            if (was) {
                delete was.drawn.flags;
                setEntity(card, was.data);
            }
        }
    });
}

/** Grids (or lone cards) with a fit check already waiting for the next frame. @type {WeakSet<HTMLElement>} */
const ACTIONS_QUEUED = new WeakSet();

/**
 * Move actions into "More" while a button of the grid does not fit its card, one button at a time, as soon as the cards are
 * laid out: the columns are equal (`minmax(0, 1fr)`), so a button whose longest word is wider than its column spills it past its own
 * box, which is what is measured here (and a row that runs past the card's edge). The count is the grid's, so the same action stands in the same column on every card.
 * @param {HTMLElement} host the grid, or the card when it stands alone
 * @param {number} inline how many actions stand as buttons now
 */
function fitActions(host, inline) {
    if (inline <= 0 || ACTIONS_QUEUED.has(host)) return;
    ACTIONS_QUEUED.add(host);
    host.ownerDocument.defaultView?.requestAnimationFrame(() => {
        ACTIONS_QUEUED.delete(host);
        // Another pass has already taken a button out since this one was asked for.
        if (!host.isConnected || Number(host.dataset.kpEntityFit ?? inline) < inline) return;
        const cards = /** @type {HTMLElement[]} */ (host.matches(ENTITY_GRID) ? [...host.querySelectorAll(':scope > .kp-card--entity')] : [host]);
        const tooWide = cards.some((card) => {
            const row = slotOf(card, 'actions');
            if (!row || row.hidden || row.clientWidth === 0 || card.dataset.kpState === 'error') return false;
            const edge = row.getBoundingClientRect().right + 0.5;
            // The columns are equal, so a button too wide for its column spills its longest word past its own box
            // (or past the row's edge, for the last one).
            return [...row.children].some((child) => {
                const button = child.matches('button') ? child : child.querySelector('button');
                return child.getBoundingClientRect().right > edge || (button !== null && button.scrollWidth > button.clientWidth);
            });
        });
        if (!tooWide) return;
        host.dataset.kpEntityFit = String(inline - 1);
        redraw(cards);
    });
}

/**
 * Draw the given cards again from their last data, slot by slot as the signatures say.
 * @param {readonly HTMLElement[]} cards
 * @param {string[]} [slots] slots to draw anew whatever the signature says
 */
function redraw(cards, slots = ['actions']) {
    for (const card of cards) {
        const was = DRAWN.get(card);
        if (!was) continue;
        for (const name of slots) delete was.drawn[name];
        setEntity(card, was.data);
    }
}

/**
 * The tick of a selectable card and the mark made from its name, at the start of the identity row.
 * @param {HTMLElement} card
 * @param {HTMLElement} el the identity row
 * @param {EntityData} data
 * @param {boolean} selectable
 * @param {string} markKind
 */
function tickAndMark(card, el, data, selectable, markKind) {
    const doc = card.ownerDocument;
    const s = getStrings();
    if (selectable) {
        const box = /** @type {HTMLInputElement} */ (made(doc, 'input', 'kp-field__check kp-entity__tick'));
        box.type = 'checkbox';
        box.setAttribute('data-kp-select-row', '');
        box.setAttribute('aria-label', s.entitySelect(data.name));
        box.addEventListener('change', () => {
            card.classList.toggle('is-ticked', box.checked);
            card.dispatchEvent(new CustomEvent(ENTITY_TICK_EVENT, { bubbles: true, detail: { key: data.key, ticked: box.checked } }));
        });
        el.append(box);
    }
    if (markKind !== 'none') {
        const mark = made(doc, 'span', 'kp-idmark kp-idmark--sm');
        if (markKind === 'idmark') setIdmark(mark, data.name);
        else mark.textContent = '◆';
        el.append(mark);
    }
}

/** Cards whose star key is already listened for. @type {WeakSet<HTMLElement>} */
const KEYED = new WeakSet();

/**
 * The star key: while the focus is inside the card, the key (`s`) presses its star. A menu, a field and a chord stay theirs.
 * @param {HTMLElement} card
 */
function listenForStarKey(card) {
    if (KEYED.has(card)) return;
    KEYED.add(card);
    card.addEventListener('keydown', (event) => {
        const wanted = (opt(card, 'data-kp-entity-star-key') ?? 's').toLowerCase();
        if (wanted === 'off' || event.key.toLowerCase() !== wanted || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = /** @type {Element} */ (event.target);
        if (target.closest('input, textarea, select, [contenteditable], .kp-menu')) return;
        const button = /** @type {HTMLButtonElement | null} */ (card.querySelector(':scope > .kp-entity__id .kp-entity__star'));
        if (!button) return;
        event.preventDefault();
        button.click();
    });
}

/**
 * The favourite star: a real toggle button (js/toggle.js) in the identity row, above the card's link, so pressing it never follows
 * the link. Its name is hidden text ("Favourite jellyfin"), the star is a drawing that fills while it is pressed.
 * @param {HTMLElement} card
 * @param {HTMLElement} el the identity row
 * @param {EntityData} data
 * @param {boolean} pressed
 * @param {string} starKey
 */
function appendStar(card, el, data, pressed, starKey) {
    const doc = card.ownerDocument;
    const ns = 'http://www.w3.org/2000/svg';
    const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-entity__star'));
    button.type = 'button';
    button.setAttribute('data-kp-toggle', '');
    button.setAttribute('data-kp-look', 'icon');
    button.setAttribute('aria-pressed', String(pressed));
    if (starKey !== 'off') button.setAttribute('aria-keyshortcuts', starKey);
    const glyph = doc.createElementNS(ns, 'svg');
    glyph.setAttribute('class', 'kp-entity__star-glyph');
    glyph.setAttribute('viewBox', '0 0 24 24');
    glyph.setAttribute('aria-hidden', 'true');
    const outline = doc.createElementNS(ns, 'path');
    outline.setAttribute('d', 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z');
    glyph.append(outline);
    const name = made(doc, 'span', 'kp-sr-only');
    name.textContent = getStrings().entityStar(data.name);
    button.append(glyph, name);
    el.append(button);
    attachToggles(button);
    button.addEventListener('kp-toggle-changed', (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        if (detail.source !== 'press') return;
        const was = DRAWN.get(card);
        if (was) was.star = detail.pressed;
        card.dispatchEvent(
            new CustomEvent(ENTITY_STAR_EVENT, { bubbles: true, detail: { key: card.getAttribute('data-kp-entity-key'), starred: detail.pressed } }),
        );
    });
    listenForStarKey(card);
}

/**
 * Put the star as the data says without an event (a refill with `starred`).
 * @param {HTMLElement} card
 * @param {boolean} star
 */
function syncStar(card, star) {
    const button = card.querySelector(':scope > .kp-entity__id .kp-entity__star');
    if (button && button.getAttribute('aria-pressed') !== String(star)) button.setAttribute('aria-pressed', String(star));
}

/**
 * The trend row: the label, a 24-hour line drawn with the KPI tile's drawSparkline, and the current value, on the meters' own columns.
 * Fewer than two readings keep the row and say so in the same box.
 * @param {Document} doc
 * @param {import('./strings.js').Strings} s
 * @param {EntityData} data
 * @param {string} status
 */
function trendRow(doc, s, data, status) {
    const row = made(doc, 'div', 'kp-entity__meter kp-entity__trend');
    const label = made(doc, 'span', 'kp-entity__meter-label');
    label.textContent = data.trendLabel ?? s.entityTrend;
    const line = made(doc, 'div', 'kp-entity__trend-line');
    const value = made(doc, 'span', 'kp-entity__meter-value');
    const points = (data.trend ?? []).filter((n) => Number.isFinite(n));
    if (status !== 'empty' && points.length >= 2) {
        const last = /** @type {number} */ (points[points.length - 1]);
        value.textContent = data.trendText ?? last.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const svg = /** @type {SVGSVGElement} */ (doc.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        svg.setAttribute('class', 'kp-entity__spark');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', s.entityTrendName(data.trendLabel ?? s.entityTrend, value.textContent));
        drawSparkline(svg, points, { parts: 'kp-entity__spark' });
        line.append(svg);
    } else {
        const none = made(doc, 'span', 'kp-entity__none');
        none.textContent = status === 'empty' ? s.entityNotMeasured : s.entityTrendNone;
        line.append(none);
    }
    row.append(label, line, value);
    return row;
}

/**
 * Draw an app or link tile: the identity row (mark, the name as the card's one link, the star), the state as a dot and a word, the
 * description and the lines. A tile has no actions row.
 * @param {{ card: HTMLElement, data: EntityData, doc: Document, s: import('./strings.js').Strings, slot: (name: string, signature: unknown, build: (el: HTMLElement) => void) => void,
 *   status: string, key: string, link: string | null, selectable: boolean, markKind: string, starOn: boolean, starKey: string, star: boolean }} c
 */
function drawTile({ card, data, doc, s, slot, status, key, link, selectable, markKind, starOn, starKey, star }) {
    // A tile's rows differ in height with their words, so a tile that is not ready (not measured, failed, loading) keeps the height it had.
    holdFootprint(card);
    const href = data.href ?? (link ? link.replace('{key}', encodeURIComponent(key)) : null);
    const external = data.external === true && href !== null;
    slot('id', { n: data.name, href, external, selectable, markKind, status, starOn, starKey }, (el) => {
        tickAndMark(card, el, data, selectable, markKind);
        const name = href ? made(doc, 'a', 'kp-entity__name') : made(doc, 'span', 'kp-entity__name');
        name.textContent = data.name;
        if (name instanceof HTMLAnchorElement && href) {
            name.href = href;
            if (external) {
                name.target = '_blank';
                name.rel = 'noopener noreferrer';
                const said = made(doc, 'span', 'kp-sr-only');
                said.textContent = ` (${s.entityOpensNew})`;
                name.append(said);
            }
        }
        el.append(name);
        if (external) {
            const glyph = made(doc, 'span', 'kp-entity__external');
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = '↗';
            el.append(glyph);
        }
        if (starOn) appendStar(card, el, data, star, starKey);
    });
    syncStar(card, star);

    slot('state', { st: data.state, status }, (el) => {
        const word = status === 'error' ? s.entityFailed : (data.state?.label ?? '');
        if (!word) return;
        const tone = status === 'error' ? 'destructive' : data.state?.tone;
        const state = made(doc, 'span', 'kp-health kp-entity__tile-state');
        if (tone === 'success') state.setAttribute('data-state', 'ok');
        else if (tone === 'warning') state.setAttribute('data-state', 'warn');
        else if (tone === 'destructive') state.setAttribute('data-state', 'down');
        const dot = made(doc, 'span', 'kp-health__dot');
        dot.setAttribute('aria-hidden', 'true');
        state.append(dot, word);
        el.append(state);
    });

    // A failed tile: the sentence and Retry stand where the description and the lines stood.
    slot('description', { d: data.description, status, e: data.error }, (el) => {
        if (status === 'error') {
            const says = made(doc, 'span', 'kp-entity__tile-failed');
            says.textContent = s.entityTileFailed;
            const retry = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--sm kp-entity__retry'));
            retry.type = 'button';
            retry.textContent = s.entityRetry;
            if (data.error) retry.title = data.error;
            retry.addEventListener('click', () => card.dispatchEvent(new CustomEvent(ENTITY_RETRY_EVENT, { bubbles: true, detail: { key } })));
            el.append(says, retry);
            return;
        }
        if (!data.description) return;
        const text = made(doc, 'span', 'kp-entity__text');
        text.textContent = data.description;
        el.append(text);
    });
    slotOf(card, 'lines').hidden = status === 'error';
    slot('lines', { l: data.lines, status }, (el) => {
        if (status === 'empty') {
            const none = made(doc, 'span', 'kp-entity__none');
            none.textContent = s.entityNotMeasured;
            el.append(none);
            return;
        }
        for (const text of data.lines ?? []) {
            const line = made(doc, 'span', 'kp-entity__line');
            line.textContent = text;
            el.append(line);
        }
    });
}

/**
 * Draw one card from its data. Only what differs from the last draw is touched.
 * @param {HTMLElement} card
 * @param {EntityData} data
 */
export function setEntity(card, data) {
    const kind = frame(card);
    const doc = card.ownerDocument;
    const s = getStrings();
    const before = DRAWN.get(card);
    /** @type {Record<string, string>} */
    const drawn = before?.drawn ?? {};
    // The star as it stands: a refill (new data) says it, a redraw of the same data keeps what was pressed since.
    const star = before && before.data === data ? before.star : (data.starred ?? before?.star ?? false);
    DRAWN.set(card, { data, drawn, star });
    card.setAttribute('data-kp-row-key', data.key);
    card.setAttribute('data-kp-entity-key', data.key);
    const status = data.status ?? 'ready';
    card.setAttribute('data-kp-state', status);
    const meterRows = Math.max(0, Math.min(3, Number(opt(card, 'data-kp-entity-meters') ?? 2) || 0));
    // A lone refill that brings the first trend into a grid gives the cards already there their row too (`auto`).
    const around = card.closest(ENTITY_GRID);
    if (around && Array.isArray(data.trend) && !around.hasAttribute('data-kp-entity-trended')) {
        around.setAttribute('data-kp-entity-trended', '');
        redraw(
            /** @type {HTMLElement[]} */ ([...around.querySelectorAll(':scope > .kp-card--entity')]).filter((other) => other !== card),
            ['meters'],
        );
    }
    // The trend row is a row of the meters block: `auto` gives every card of the grid the row once one card has a trend.
    const trendMode = opt(card, 'data-kp-entity-trend') ?? 'auto';
    const trended = Array.isArray(data.trend) || (card.closest(ENTITY_GRID)?.hasAttribute('data-kp-entity-trended') ?? false);
    const trendOn = kind === 'stack' && (trendMode === 'on' || (trendMode !== 'off' && trended));
    card.style.setProperty('--kp-entity-meters', String(meterRows + (trendOn ? 1 : 0)));
    const key = data.key;

    /** Draw a slot only when its signature changed. @param {string} slot_ @param {unknown} signature @param {(el: HTMLElement) => void} build */
    const slot = (slot_, signature, build) => {
        const text = sig(signature);
        if (drawn[slot_] === text) return;
        drawn[slot_] = text;
        const el = slotOf(card, slot_);
        el.replaceChildren();
        build(el);
    };

    const loading = status === 'loading';
    if (loading) {
        // A skeleton keeps every row: what the card will hold is not known yet.
        card.removeAttribute('data-kp-entity-actions');
        slotOf(card, kind === 'stack' ? 'actions' : 'lines').hidden = false;
        for (const name of SLOTS[kind]) {
            slot(name, 'loading', (el) => {
                const bone = made(doc, 'span', 'kp-skeleton kp-entity__bone');
                bone.setAttribute('aria-hidden', 'true');
                el.append(bone);
            });
        }
        card.setAttribute('aria-busy', 'true');
        return;
    }
    card.removeAttribute('aria-busy');

    const link = opt(card, 'data-kp-entity-link');
    const selectable = opt(card, 'data-kp-selectable') !== null;
    const markKind = opt(card, 'data-kp-entity-mark') ?? 'idmark';
    const starOn = (opt(card, 'data-kp-entity-star') ?? (kind === 'tile' ? 'on' : 'off')) !== 'off';
    const starKey = (opt(card, 'data-kp-entity-star-key') ?? 's').toLowerCase();

    if (kind === 'tile') {
        drawTile({ card, data, doc, s, slot, status, key, link, selectable, markKind, starOn, starKey, star });
        return;
    }

    // 1. identity
    slot('id', { n: data.name, v: data.vmid, st: data.state, link, selectable, markKind, status, starOn, starKey }, (el) => {
        tickAndMark(card, el, data, selectable, markKind);
        const name = link ? made(doc, 'a', 'kp-entity__name') : made(doc, 'span', 'kp-entity__name');
        if (name instanceof HTMLAnchorElement && link) name.href = link.replace('{key}', encodeURIComponent(key));
        name.textContent = data.name;
        el.append(name);
        const vmid = made(doc, 'span', 'kp-entity__vmid');
        vmid.textContent = data.vmid ?? '';
        el.append(vmid);
        const st = made(
            doc,
            'span',
            `kp-badge kp-entity__state${data.state?.tone ? ` kp-badge--${status === 'error' ? 'destructive' : data.state.tone}` : status === 'error' ? ' kp-badge--destructive' : ''}`,
        );
        st.textContent = status === 'error' ? s.entityFailed : (data.state?.label ?? '');
        el.append(st);
        if (starOn) appendStar(card, el, data, star, starKey);
    });
    syncStar(card, star);

    // 2. figures (exact numbers, tabular, in one row)
    slot('figures', { f: data.figures, status }, (el) => {
        if (status === 'empty') {
            const none = made(doc, 'span', 'kp-entity__none');
            none.textContent = s.entityNotMeasured;
            el.append(none);
            return;
        }
        for (const f of data.figures ?? []) {
            const one = made(doc, 'span', 'kp-entity__figure');
            const value = made(doc, 'b', 'kp-entity__value');
            value.textContent = f.value;
            one.append(value, ` ${f.label}`);
            el.append(one);
        }
    });

    // 3. flags: the first few, and an exact "+N" that opens the package's menu
    const flagsAsked = Math.max(0, Number(opt(card, 'data-kp-entity-flags-max') ?? 3));
    // Fewer flags show when they do not fit the card's width: the rest go behind the "+N", so nothing is cut.
    const flagsMax = Math.min(flagsAsked, Number(card.dataset.kpFlagsFit ?? flagsAsked));
    slot('flags', { fl: data.flags, flagsMax }, (el) => {
        const all = data.flags ?? [];
        for (const flag of all.slice(0, flagsMax)) {
            const chip = made(doc, 'span', `kp-badge kp-entity__flag${flag.tone ? ` kp-badge--${flag.tone}` : ''}`);
            chip.textContent = flag.label;
            el.append(chip);
        }
        const rest = all.slice(flagsMax);
        if (rest.length > 0) {
            const wrap = made(doc, 'div', 'kp-menu-button kp-entity__more-flags');
            wrap.setAttribute('data-kp-menu-button', '');
            wrap.setAttribute('data-kp-key', `${key}-flags`);
            const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-button--sm kp-entity__plus'));
            button.type = 'button';
            button.textContent = `+${rest.length}`;
            button.setAttribute('aria-label', s.entityMoreFlags(rest.length));
            const menu = made(doc, 'div', 'kp-menu kp-menu--rich');
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', s.entityFlagsLabel);
            wrap.append(button, menu);
            el.append(wrap);
            attachMenuButtons(el);
            setMenu(wrap, [{ group: '', items: rest.map((f) => ({ label: f.label, value: f.label })) }]);
            wrap.addEventListener('kp-menu-select', (event) => {
                card.dispatchEvent(
                    new CustomEvent(ENTITY_FLAG_EVENT, { bubbles: true, detail: { key, flag: /** @type {CustomEvent} */ (event).detail.value } }),
                );
            });
        }
    });

    fitFlags(card, flagsMax);

    // 4. meters: a fixed number of rows; the number is always beside the bar
    slot('meters', { m: data.meters, meterRows, status, tr: trendOn ? [data.trend ?? null, data.trendLabel, data.trendText] : null }, (el) => {
        for (let i = 0; i < meterRows; i++) {
            const m = data.meters?.[i];
            const row = made(doc, 'div', 'kp-entity__meter');
            const label = made(doc, 'span', 'kp-entity__meter-label');
            label.textContent = m?.label ?? '';
            const bar = made(doc, 'div', 'kp-meter');
            const value = made(doc, 'span', 'kp-entity__meter-value');
            if (m && status !== 'empty') {
                const tone = m.tone ?? (m.value !== null && m.value >= 0.9 ? 'destructive' : m.value !== null && m.value >= 0.75 ? 'warning' : null);
                setMeter(bar, { value: m.value, mark: m.mark ?? null, tone, label: m.label });
                value.textContent = m.text ?? (m.value === null ? '—' : `${Math.round(m.value * 100)}%`);
            } else {
                setMeter(bar, { value: null });
                value.textContent = status === 'empty' ? s.entityNotMeasured : '';
            }
            row.append(label, bar, value);
            el.append(row);
        }
        if (trendOn) el.append(trendRow(doc, s, data, status));
    });

    // 5. actions: at most a few inline, the rest in the package's menu; a failed card puts Retry here
    const narrow = card.closest(ENTITY_GRID)?.hasAttribute('data-kp-entity-narrow') ?? false;
    const inlineAsked = narrow ? 0 : Math.max(0, Number(opt(card, 'data-kp-entity-inline') ?? 3));
    // Fewer actions stand as buttons when they do not fit the card's width: the rest go in "More", so nothing is cut.
    const fitHost = /** @type {HTMLElement} */ (card.closest(ENTITY_GRID) ?? card);
    const inline = Math.min(inlineAsked, Number(fitHost.dataset.kpEntityFit ?? inlineAsked));
    // The buttons come only from the data: a card with no action has no actions row, and no space where it would be.
    const noActions = status !== 'error' && (data.actions ?? []).length === 0;
    if (noActions) card.setAttribute('data-kp-entity-actions', 'none');
    else card.removeAttribute('data-kp-entity-actions');
    slotOf(card, 'actions').hidden = noActions;
    // One set of columns for the whole grid, so the same action stands in the same column on every card.
    const host = fitHost;
    host.style.setProperty('--kp-entity-cols', String(columnsFor(host, inline)));
    slot('actions', { a: data.actions, inline, status }, (el) => {
        if (status === 'error') {
            const retry = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-entity__action kp-entity__retry'));
            retry.type = 'button';
            retry.textContent = s.entityRetry;
            if (data.error) retry.title = data.error;
            retry.addEventListener('click', () => card.dispatchEvent(new CustomEvent(ENTITY_RETRY_EVENT, { bubbles: true, detail: { key } })));
            el.append(retry);
            return;
        }
        const all = data.actions ?? [];
        const shown = all.slice(0, inline);
        const rest = all.slice(inline);
        for (const a of shown) {
            const button = /** @type {HTMLButtonElement} */ (
                made(doc, 'button', `kp-button kp-button--sm kp-entity__action${a.danger ? ' kp-button--destructive' : ''}`)
            );
            button.type = 'button';
            button.textContent = a.label;
            if (a.disabled) {
                button.setAttribute('aria-disabled', 'true');
                button.setAttribute('data-kp-disabled-reason', a.disabled);
            }
            button.addEventListener('click', () => {
                if (a.disabled) return;
                card.dispatchEvent(new CustomEvent(ENTITY_ACTION_EVENT, { bubbles: true, detail: { key, id: a.id } }));
            });
            el.append(button);
        }
        if (rest.length > 0) {
            const wrap = made(doc, 'div', 'kp-menu-button kp-entity__more');
            wrap.setAttribute('data-kp-menu-button', '');
            wrap.setAttribute('data-kp-key', `${key}-more`);
            const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--sm'));
            button.type = 'button';
            button.textContent = s.entityMore;
            const menu = made(doc, 'div', 'kp-menu kp-menu--rich');
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', s.entityMoreLabel);
            wrap.append(button, menu);
            el.append(wrap);
            attachMenuButtons(el);
            setMenu(wrap, [
                { group: '', items: rest.map((a) => ({ label: a.label, value: a.id, danger: a.danger === true, disabled: a.disabled ?? null })) },
            ]);
            wrap.addEventListener('kp-menu-select', (event) => {
                card.dispatchEvent(
                    new CustomEvent(ENTITY_ACTION_EVENT, { bubbles: true, detail: { key, id: /** @type {CustomEvent} */ (event).detail.value } }),
                );
            });
        }
    });

    fitActions(host, inline);
}

/**
 * Draw a grid's cards from a list; a card whose key is already there changes in place, a gone key leaves, order follows the list.
 * @param {HTMLElement} grid
 * @param {readonly EntityData[]} list
 * @param {EntityEmptyOptions} [empty] how the plate reads when the list is empty (see `setEntityGridState`)
 */
export function setEntityGrid(grid, list, empty = {}) {
    grid.setAttribute('data-kp-entity-grid', '');
    grid.removeAttribute('data-kp-state');
    clearGridState(grid);
    const doc = grid.ownerDocument;
    // One card with a trend gives every card the row (`data-kp-entity-trend="auto"`), so the cards stay level.
    grid.toggleAttribute(
        'data-kp-entity-trended',
        list.some((d) => Array.isArray(d.trend)),
    );
    /** @type {Map<string, HTMLElement>} */
    const have = new Map();
    for (const card of /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(':scope > .kp-card--entity')])) {
        const k = card.getAttribute('data-kp-entity-key');
        if (k && list.some((d) => d.key === k)) have.set(k, card);
        else card.remove();
    }
    if (list.length === 0) {
        setEntityGridState(grid, 'empty', empty);
        return;
    }
    let at = 0;
    for (const data of list) {
        let card = have.get(data.key);
        if (!card) {
            card = doc.createElement('article');
            card.setAttribute('role', 'listitem');
        }
        // In its place first, so the grid's options reach it; a card already in its place is not moved (a card under the pointer stays put).
        if (grid.children[at] !== card) grid.insertBefore(card, grid.children[at] ?? null);
        setEntity(card, data);
        at += 1;
    }
    grid.setAttribute('role', 'list');
}

/** @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const BUSY = new WeakMap();

/** @param {HTMLElement} grid */
function clearGridState(grid) {
    BUSY.get(grid)?.remove();
    BUSY.delete(grid);
    for (const el of grid.querySelectorAll(':scope > .kp-stateplate, :scope > .kp-card--ghost')) el.remove();
    grid.removeAttribute('aria-busy');
}

/**
 * Put the whole grid in a state: `loading` (skeleton cards, as many as `options.count` or the cards it had, 6 at first, and the
 * busy card over them), `empty` ("No stacks yet" with its action) or `error` (the failed plate with Retry); a tile grid says "apps".
 * @param {HTMLElement} grid
 * @param {'loading' | 'empty' | 'error'} state
 * @param {{ count?: number, words?: string } & EntityEmptyOptions} [options] `words` is the busy card's line. The empty plate's action: `action: 'none'`
 * (or `data-kp-entity-empty-action="none"` on the grid) leaves it out, `actionLabel` words it, and `onAction` runs instead of the
 * `kp-entity-new` event
 */
export function setEntityGridState(grid, state, options = {}) {
    const doc = grid.ownerDocument;
    const s = getStrings();
    const had = grid.querySelectorAll(':scope > .kp-card--entity').length;
    const tiles = grid.getAttribute('data-kp-entity-kind') === 'tile';
    clearGridState(grid);
    grid.setAttribute('data-kp-state', state);
    for (const card of grid.querySelectorAll(':scope > .kp-card--entity')) card.remove();
    if (state === 'loading') {
        grid.setAttribute('aria-busy', 'true');
        for (let i = 0; i < (options.count ?? (had || 6)); i++) {
            const ghost = /** @type {HTMLElement} */ (made(doc, 'article', 'kp-card--ghost'));
            // In the grid first, so the grid's options (the kind of card) reach it.
            grid.append(ghost);
            setEntity(ghost, { key: `loading-${i}`, name: '', status: 'loading' });
            ghost.classList.add('kp-card--ghost');
        }
        BUSY.set(
            grid,
            openBusyCard(grid, {
                words: options.words ?? (tiles ? s.entityTileLoading : s.entityLoading),
                area: () => [grid],
                className: 'kp-entity__busy',
                arrive: true,
            }),
        );
        return;
    }
    const plate =
        state === 'error'
            ? statePlate(doc, {
                  kind: 'error',
                  title: options.title ?? (tiles ? s.entityTileGridFailed : s.entityGridFailed),
                  text: options.message ?? s.entityGridFailedText,
                  actionLabel: s.entityRetry,
                  onAction: () => grid.dispatchEvent(new CustomEvent(ENTITY_GRID_RETRY_EVENT, { bubbles: true })),
              })
            : statePlate(doc, {
                  kind: 'empty',
                  title: options.title ?? (tiles ? s.entityTileGridEmpty : s.entityGridEmpty),
                  ...(options.message ? { text: options.message } : {}),
                  ...((options.action ?? grid.getAttribute('data-kp-entity-empty-action')) === 'none'
                      ? {}
                      : {
                            actionLabel: options.actionLabel ?? (tiles ? s.entityTileNew : s.entityNew),
                            onAction: options.onAction ?? (() => grid.dispatchEvent(new CustomEvent(ENTITY_NEW_EVENT, { bubbles: true }))),
                        }),
              });
    grid.append(plate);
}

/**
 * Give every grid its options (the least card width) and keep the cards in step with them: a changed attribute draws every card again.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachEntityCards(root = document) {
    const grids = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(ENTITY_GRID) ? [root] : []),
        ...root.querySelectorAll(ENTITY_GRID),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const grid of grids) {
        const apply = () => {
            const min = grid.getAttribute('data-kp-entity-min');
            if (min) grid.style.setProperty('--kp-entity-min', min);
            else grid.style.removeProperty('--kp-entity-min');
        };
        apply();
        let lastWidth = grid.clientWidth;
        const refit = () => {
            if (grid.clientWidth === lastWidth) return;
            lastWidth = grid.clientWidth;
            delete grid.dataset.kpEntityFit;
            const cards = /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(':scope > .kp-card--entity')]);
            for (const card of cards) delete card.dataset.kpFlagsFit;
            redraw(cards, ['flags', 'actions']);
        };
        const fold = () => grid.toggleAttribute('data-kp-entity-narrow', grid.clientWidth > 0 && grid.clientWidth < 480);
        fold();
        const resize =
            typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => {
                      fold();
                      refit();
                  })
                : null;
        resize?.observe(grid);
        undo.push(() => resize?.disconnect());
        const watch = new MutationObserver(() => {
            apply();
            delete grid.dataset.kpEntityFit;
            for (const card of /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(':scope > .kp-card--entity')])) {
                const was = DRAWN.get(card);
                if (!was) continue;
                was.drawn = {};
                setEntity(card, was.data);
            }
        });
        watch.observe(grid, {
            attributes: true,
            attributeFilter: [
                'data-kp-entity-meters',
                'data-kp-entity-flags-max',
                'data-kp-entity-inline',
                'data-kp-entity-link',
                'data-kp-selectable',
                'data-kp-entity-mark',
                'data-kp-entity-min',
                'data-kp-entity-narrow',
                'data-kp-entity-kind',
                'data-kp-entity-trend',
                'data-kp-entity-star',
                'data-kp-entity-star-key',
            ],
        });
        undo.push(() => watch.disconnect());
        // The fold is read once more now that the cards listen for it.
        fold();
    }
    return () => undo.forEach((u) => u());
}
