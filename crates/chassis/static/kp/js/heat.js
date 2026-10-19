// The heat grid and the matrix [kpadopt2-grids; the admin dashboard's `bk-heat`
// on the Backups page and `fw-mx` on the Firewall page].
//
// Two grids of coloured cells that a person reads at a glance and then asks
// about one cell, each drawn by the package so that a consumer draws nothing:
//
//   .kp-heat    rows x many columns of small cells toned by a state or a
//               value (a stack per night, a service per hour): row labels
//               that filter, a column axis, a summary row whose cells fill
//               from the bottom, a legend, a picked column, hover detail
//               (the hover card), a loading state that keeps the shape.
//   .kp-matrix  source x destination: a cell per pair that says its state in
//               words and a glyph (allowed, mismatch, blocked, unknown), the
//               headers stay while the grid scrolls, headers that light up a
//               row and a column, one cell pinned.
//
// Loading (both): the waiting cells keep the grid's shape, and the data
// table's own loading card (js/busy-card.js: the theme's spinner and
// "Reading…") stands centred over the cells, the axis, the headers and the
// names readable beside it [Kenny, 2026-10-16: "zoals bij een table waar het
// icoon in het midden van de matrix staat en lijkt te laden"]. It arrives the
// theme's way (not on a first render) and leaves as the busy table's card
// leaves; a grid that leaves its loading state is drawn once the card has
// gone, so nothing is drawn under a card on its way out.
//
// Both share the tone words of the month heatmap (js/calendar.js):
// `data-kp-tone` ok, warn, bad, muted, future, before, none, loading; a heat
// cell also takes `level` (a value, `--kp-heat-level` 0 to 1) and a matrix
// cell `self` (a pair with itself: dashed, inert).
//
// The legend [gap-tab-count]: `setHeatLegend(el, entries, { keys })` writes the `ul.kp-heat__legend` under the grid (made when the
// grid has none), a swatch and its words per entry, a value ramp ("Less" to "More") where an entry asks for one, and at its end the
// line of keys; the grid names it in `aria-describedby`. A calm grid (`data-kp-tones="calm"`) draws Logged, Nothing logged and
// Paused by itself (only the tones its cells have; `data-kp-legend="all"` lists all three), `data-kp-legend="hide"` leaves it out (setHeat also takes `legend` and `legendKeys`).
//
// Calm tones [kpadopt6]: `data-kp-tones="calm"` on a heat grid swaps ok, warn and bad for `logged`, `quiet` and `paused`
// (js/calm-tones.js): a cell with nothing logged is quiet, never failed, and its words never say "missed".
//
// A page may write the markup itself (see docs/USER_GUIDE.md) or give the
// data:
//
//   setHeat(el, {
//       columns: [{ key: '2026-10-14', label: '14' }, …],
//       summary: { label: 'Whole fleet', cells: [{ tone: 'warn', share: 0.8, label: '4 of 5 backed up' }, …] },
//       rows: [{ key: 'media', label: 'media', cells: [{ tone: 'ok', label: 'backed up', tip: 'Snapshot at 03:12' }, …] }, …],
//   });
//   setMatrix(el, {
//       corner: 'from ↓ to →',
//       rows: [{ key: 'web', label: 'web' }, …], columns: [{ key: 'db', label: 'db' }, …],
//       cell: (row, column) => ({ tone: 'ok', text: '3', label: '3 ports open' }),
//   });
//
// Keyboard (both): one tab stop, the arrow keys move between the cells,
// Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the
// corners; a heat grid also sends Page Up and Page Down as `kp-heat-page`
// (the page shows the earlier or later columns) and Escape drops the picked
// column; a matrix skips the cells that cannot be pressed. Enter and Space
// press.
//
// The latest column, opt-in [kpadopt3]: `data-kp-heat-latest="end"` (or
// `"start"`, for a grid whose newest column comes first) says which edge the
// newest column stands on. The key that goes to that edge (End, or Home)
// still moves to the end of the row as it always does, and also sends
// `kp-heat-page { direction: 'latest' }`, so a grid paged back to older
// columns comes back to the newest in the same press, the way Page Up and
// Page Down already page; with Ctrl it goes to that corner and sends it too.
// The page answers as it answers Page Up and Page Down (it shows the newest
// columns, and may drop its pick); setHeat() keeps the focus on the edge.
//
// Events (bubbling, on the grid), unless the grid is marked `data-kp-heat-owned`
// or `data-kp-matrix-owned`, in which case the page keeps the state itself and
// only hears them:
//   kp-heat-pick     { rowKey, colKey, cell, picked }    a column was picked or dropped (picked false)
//   kp-heat-row      { key, pressed, keys }               a row label was pressed
//   kp-heat-page     { direction: 'earlier' | 'later' | 'latest' }   Page Up, Page Down; End or Home towards the latest
//   kp-matrix-pick   { rowKey, colKey, cell, source }     a cell was pinned
//   kp-matrix-light  { keys }                             the headers that are lit changed
//
// Nothing runs on import. attachHeats(root) and attachMatrices(root) return a
// detach; the hover card (js/hovercard.js) is attached for the cells that
// carry `data-kp-hovercard`, and a page that wants rich content attaches it
// itself with a `fill`.

import { getStrings } from './strings.js';
import { attachHoverCards } from './hovercard.js';
import { openBusyCard } from './busy-card.js';
import { hostStatePlate } from './state-plate.js';
import { drawUsesMap, leaveUsesMap, rememberView, rememberedView } from './uses-map.js';
import { calmLegendEntries, calmTone, calmWord, isCalmTones } from './calm-tones.js';
import { setKeys } from './keys.js';

/** A heat grid. */
export const HEAT = '[data-kp-heat]';
/** A matrix. */
export const MATRIX = '[data-kp-matrix]';
/** Fired on a heat grid when a column is picked or dropped. */
export const HEAT_PICK_EVENT = 'kp-heat-pick';
/** Fired on a heat grid when a row label is pressed. */
export const HEAT_ROW_EVENT = 'kp-heat-row';
/** Fired on a heat grid on Page Up and Page Down. */
export const HEAT_PAGE_EVENT = 'kp-heat-page';
/** Fired on a matrix when a cell is pinned. */
export const MATRIX_PICK_EVENT = 'kp-matrix-pick';
/** Fired on a heat grid, bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const HEAT_RETRY_EVENT = 'kp-heat-retry';
/** Fired on a matrix (either view), bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const MATRIX_RETRY_EVENT = 'kp-matrix-retry';
/** Fired on a matrix when the lit headers change. */
export const MATRIX_LIGHT_EVENT = 'kp-matrix-light';

/** The tones a cell may carry. */
const TONES = ['ok', 'warn', 'bad', 'muted', 'future', 'before', 'none', 'level', 'loading', 'self', 'logged', 'quiet', 'paused'];

/**
 * @typedef {'ok' | 'warn' | 'bad' | 'muted' | 'future' | 'before' | 'none' | 'level' | 'loading' | 'self' | 'logged' | 'quiet' | 'paused'} GridTone
 */

/**
 * @typedef {object} HeatCell
 * @property {GridTone} [tone]  default `muted`
 * @property {number} [level]   0 to 1, for tone `level`: the darker, the more
 * @property {number} [share]   0 to 1, summary row only: how much of the cell the tone fills, from the bottom
 * @property {string} label     what the cell says in words ("backed up", "missed"); the row and the column are put in front of it
 * @property {string} [aria]    the whole accessible name, when the default is not right
 * @property {string | true} [tip]  the hover card's text; `true` leaves it to a `fill` the page gave attachHoverCards()
 * @property {boolean} [disabled]   a cell that cannot be pressed
 */

/**
 * @typedef {object} HeatRow
 * @property {string} key
 * @property {string} label
 * @property {string} [mark]    a CSS colour: a small square before the label
 * @property {boolean} [muted]  the label is quiet (a row that keeps no data)
 * @property {boolean} [pressed] the label is pressed (when labels are toggles)
 * @property {readonly HeatCell[]} cells  one per column
 */

/**
 * @typedef {object} HeatSpec
 * @property {readonly { key: string, label: string, minor?: boolean }[]} [columns]  `minor: true` draws no name, `minor: false` always does
 * @property {HeatRow} [summary]
 * @property {readonly HeatRow[]} [rows]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]  default ready
 * @property {string} [message]  the words of the empty and error states (the plate's heading)
 * @property {string} [text]  the plate's sentence under the heading (an error says the package's own when none is given)
 * @property {Node | string | null} [art]  a picture over the heading of the empty and error plates
 * @property {{ rows: number, columns: number }} [skeleton]  the shape of the loading state when there is no data yet
 * @property {number} [every]    every how many columns the axis names one (default 3; the last always); columns with `minor` set do not count
 * @property {'start' | 'end'} [axis]  where the column axis stands (default start)
 * @property {boolean} [toggle]  row labels are buttons that toggle (else `data-kp-heat-toggle` on the grid)
 * @property {string | null} [picked]  the key of the picked column
 * @property {string} [label]  the grid's accessible name, when the element has none
 * @property {readonly HeatLegendEntry[] | false} [legend]  the legend under the grid (setHeatLegend); `false` takes it away
 * @property {HeatLegendOptions['keys']} [legendKeys]  the key line at the end of the legend
 */

/**
 * One entry of a legend: a tone and its words, or a value ramp.
 * @typedef {object} HeatLegendEntry
 * @property {GridTone} [tone]  a swatch of this tone (with `label`)
 * @property {string} [label]  its words
 * @property {boolean} [ramp]  instead of a tone: the value scale, `less` then `steps` swatches of rising level then `more`
 * @property {number} [steps]  how many swatches the ramp has (default 5, 2 to 9)
 * @property {string} [less]  the ramp's low end (default "Less")
 * @property {string} [more]  the ramp's high end (default "More")
 */

/**
 * @typedef {object} HeatLegendOptions
 * @property {boolean | readonly import('./keys.js').KeyPair[]} [keys]  `true`: the keys of a heat grid (move, pick a column, drop the pick, earlier or later); or the pairs to show; at the end of the legend
 * @property {string} [label]  the legend's name for a screen reader (default "Legend")
 */

/**
 * @typedef {object} MatrixCell
 * @property {GridTone} [tone]
 * @property {string} [text]    what the cell shows (a count, "open"); without it a glyph for the tone stands there
 * @property {string} [label]   what the cell says in words, for a screen reader and the card
 * @property {string} [aria]    the whole accessible name, when the default is not right
 * @property {string | true} [tip]
 * @property {boolean} [ringed]  a red ring on top of the tone (stopped on the way)
 * @property {boolean} [mark]    a dashed primary outline (what a rule being read touches)
 * @property {boolean} [disabled]
 */

/**
 * @typedef {object} MatrixSpec
 * @property {string} [corner]  the words in the corner ("from ↓ to →")
 * @property {readonly (import('./uses-map.js').UsesNode)[]} [rows]  the sources, in the lines view with their node content (`sub`, `glyph`, `href`, `ghost`, `dashed`)
 * @property {readonly (import('./uses-map.js').UsesNode)[]} [columns]  the things that use them
 * @property {(row: string, column: string) => MatrixCell | null | undefined} [cell]  null: unknown; the same key on both axes with nothing given: itself
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]  the plate's heading in the empty and error states
 * @property {string} [text]  the plate's sentence under the heading
 * @property {Node | string | null} [art]  a picture over the heading of the empty and error plates
 * @property {number} [skeleton]  the size of the loading state when there are no names yet
 * @property {{ row: string, column: string } | null} [picked]
 * @property {readonly string[]} [lit]  the header keys that are lit
 * @property {string} [label]
 * @property {'grid' | 'lines'} [view]  `lines`: the two columns joined by lines (js/uses-map.js); default `grid`
 * @property {(count: number) => string} [countLabel]  lines view: the words after the number of uses ("2 applications")
 * @property {string} [sourcesLabel]  lines view: the sources column's name for a screen reader
 * @property {string} [usersLabel]  lines view: the users column's name
 */

/**
 * @param {Document} doc @param {string} tag @param {string} [cls] @param {Record<string, string>} [attrs]
 * @returns {HTMLElement}
 */
function make(doc, tag, cls = '', attrs = {}) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
}

/** @param {string | undefined} tone @returns {GridTone} */
const toneOf = (tone) => (TONES.includes(tone ?? '') ? /** @type {GridTone} */ (tone) : 'muted');

/** @param {number | undefined} v */
const unit = (v) => String(Math.min(1, Math.max(0, Number.isFinite(v) ? /** @type {number} */ (v) : 0)));

/** The tab stop of each grid, by row and column. @type {WeakMap<Element, { r: number, c: number }>} */
const STOPS = new WeakMap();
/** The keys of the labels or headers that are pressed. @type {WeakMap<Element, Set<string>>} */
const LIT = new WeakMap();

/* ------------------------------------------------------------- the busy card */

/** The busy card over a loading grid's cells (js/busy-card.js). @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const CARDS = new WeakMap();
/** A card on its way out and the spec that waits for it: the latest one asked for. @type {WeakMap<Element, { card: import('./busy-card.js').BusyCard, spec: any }>} */
const WAITING = new WeakMap();
/** The grids drawn before: a card on a grid's first render is the page, not news, and does not arrive. @type {WeakSet<Element>} */
const DRAWN = new WeakSet();

/**
 * Before a grid is written: a grid that leaves its loading state lets its card leave first, and the data is drawn once
 * the card has gone (nothing under a card on its way out; a later spec replaces the waiting one). A grid that loads
 * again while its card is leaving takes the leaving card out at once: one card at a time.
 * @param {HTMLElement} el @param {any} spec @param {boolean} loading @param {(el: HTMLElement, spec: any) => void} draw
 * @returns {boolean} true when the spec waits for the card
 */
function waitForCard(el, spec, loading, draw) {
    const waiting = WAITING.get(el);
    if (loading) {
        if (waiting) {
            WAITING.delete(el);
            waiting.card.remove();
        }
        return false;
    }
    if (waiting) {
        waiting.spec = spec;
        return true;
    }
    const card = CARDS.get(el);
    if (!card) return false;
    CARDS.delete(el);
    const entry = { card, spec };
    WAITING.set(el, entry);
    void card.close().then(() => {
        if (WAITING.get(el) !== entry) return;
        WAITING.delete(el);
        draw(el, entry.spec);
    });
    return true;
}

/**
 * After a grid is written: a loading grid holds the data table's busy card, centred over its cells (the axis, the
 * headers and the labels stay beside it), and keeps the one it had; a grid that is not loading holds none.
 * @param {HTMLElement} el the box the card is placed in @param {boolean} loading @param {string} words
 * @param {import('./busy-card.js').BusyCardOptions['area']} area @param {string} className
 */
function syncCard(el, loading, words, area, className) {
    const first = !DRAWN.has(el);
    markDrawn(el);
    const card = CARDS.get(el);
    if (!loading) {
        if (card) {
            CARDS.delete(el);
            card.remove();
        }
        return;
    }
    if (card) {
        if (card.layer.parentElement !== el) el.append(card.layer);
        card.place();
        return;
    }
    CARDS.set(el, openBusyCard(el, { words, area, className, arrive: !first }));
}

/** The plate a heat grid shows for an empty or failed state, and what it was drawn from. @type {WeakMap<Element, { note: HTMLElement, state: string, title: string, text: string | undefined, art: unknown }>} */
const PLATES = new WeakMap();

/** A grid is drawn once its first render has been painted. @param {Element} el */
function markDrawn(el) {
    if (DRAWN.has(el)) return;
    const view = el.ownerDocument.defaultView;
    if (view) view.requestAnimationFrame(() => DRAWN.add(el));
    else DRAWN.add(el);
}

/** Take every child of `el` out but its busy card, and put `nodes` in before it. @param {HTMLElement} el @param {Node[]} nodes */
function replaceKeepingCard(el, nodes) {
    const keep = CARDS.get(el)?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    if (keep && keep.parentElement === el) keep.before(...nodes);
    else el.append(...nodes);
}

/**
 * The cells a key may land on, in reading order, with their row and column.
 * @param {Element} grid @param {string} cellSelector
 * @returns {HTMLElement[][]}
 */
function cellGrid(grid, cellSelector) {
    /** @type {HTMLElement[][]} */
    const out = [];
    for (const cell of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll(cellSelector))) {
        const r = Number(cell.dataset.r);
        (out[r] ??= [])[Number(cell.dataset.c)] = cell;
    }
    return out;
}

/** @param {Element} grid @param {string} selector @param {{ r: number, c: number } | undefined} stop */
function placeStop(grid, selector, stop) {
    const cells = /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(selector)]);
    if (cells.length === 0) return;
    for (const cell of cells) cell.setAttribute('tabindex', '-1');
    const want = stop ?? { r: 0, c: 0 };
    const at =
        cells.find((cell) => Number(cell.dataset.r) === want.r && Number(cell.dataset.c) === want.c && !cell.hasAttribute('aria-disabled')) ??
        cells.find((cell) => !cell.hasAttribute('aria-disabled')) ??
        cells[0];
    at.setAttribute('tabindex', '0');
    STOPS.set(grid, { r: Number(at.dataset.r), c: Number(at.dataset.c) });
}

/* ------------------------------------------------------------- the heat grid */

const HEAT_CELL = '.kp-heat__cell[data-c]:not(.kp-skeleton)';

/**
 * Write a heat grid: the column axis, an optional summary row and the rows,
 * replacing what the element held. The grid keeps its columns, its row
 * heights and its picked column across a rewrite; a focused cell keeps its
 * place.
 *
 * @param {HTMLElement} el
 * @param {HeatSpec} spec
 */
export function setHeat(el, spec) {
    const doc = el.ownerDocument;
    const s = getStrings();
    const state = spec.state ?? 'ready';
    const loading = state === 'loading';
    // The legend does not wait for the busy card: it keeps its place while the grid loads.
    if (spec.legend !== undefined) {
        if (spec.legend === false) removeLegend(el);
        else setHeatLegend(el, spec.legend, { keys: spec.legendKeys });
    } else syncCalmLegend(el);
    if (waitForCard(el, spec, loading, setHeat)) return;
    const every = Math.max(1, spec.every ?? 3);
    const toggle = spec.toggle ?? el.hasAttribute('data-kp-heat-toggle');
    const pressedKeys = LIT.get(el) ?? new Set();
    const hadFocus = el.contains(doc.activeElement) && doc.activeElement?.matches(HEAT_CELL);
    const focusAt = hadFocus
        ? { r: Number(/** @type {HTMLElement} */ (doc.activeElement).dataset.r), c: Number(/** @type {HTMLElement} */ (doc.activeElement).dataset.c) }
        : null;

    let columns = spec.columns ?? [];
    let rows = spec.rows ?? [];
    if (loading && columns.length === 0 && spec.skeleton)
        columns = Array.from({ length: spec.skeleton.columns }, (_, i) => ({ key: String(i), label: '' }));
    if (loading && rows.length === 0 && spec.skeleton)
        rows = Array.from({ length: spec.skeleton.rows }, (_, i) => ({ key: `row-${i}`, label: '', cells: [] }));
    const picked = spec.picked ?? el.getAttribute('data-kp-heat-picked');

    el.classList.add('kp-heat');
    el.setAttribute('data-kp-heat', '');
    el.setAttribute('role', 'grid');
    if (spec.label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', spec.label);
    el.setAttribute('data-kp-state', state);
    el.toggleAttribute('aria-busy', loading);
    if (loading) el.setAttribute('aria-busy', 'true');
    el.style.setProperty('--kp-heat-cols', String(Math.max(1, columns.length)));
    if (picked == null) el.removeAttribute('data-kp-heat-picked');
    else el.setAttribute('data-kp-heat-picked', picked);

    if (state === 'empty' || state === 'error') {
        // The package's state plate over the grid's whole footprint, with a Retry on a failure [state-plates-1019].
        // A grid told the same state again (a page repainting from its live stream) keeps its plate: a new node would play the
        // plate's entrance again and drop the focus on its Retry, which reads as a flicker [hlcomp-1019 heat-failed].
        const title = spec.message ?? (state === 'error' ? s.heatFailed : s.heatEmpty);
        const kept = PLATES.get(el);
        if (kept && kept.note.isConnected && el.firstElementChild === kept.note && el.childElementCount === 1) {
            if (kept.state === state && kept.title === title && kept.text === spec.text && kept.art === spec.art) return;
        }
        const note = make(doc, 'div', 'kp-heat__state', { 'data-kp-state': state });
        note.append(
            hostStatePlate(el, {
                kind: state,
                title,
                ...(spec.text ? { text: spec.text } : {}),
                art: spec.art,
                retryEvent: HEAT_RETRY_EVENT,
            }),
        );
        PLATES.set(el, { note, state, title, text: spec.text, art: spec.art });
        markDrawn(el);
        el.replaceChildren(note);
        return;
    }

    /** @param {string} key @param {string} text @param {boolean} minor */
    const column = (key, text, minor) => {
        const head = make(doc, 'span', 'kp-heat__col', { role: 'columnheader', 'data-col-key': key });
        const isPicked = picked != null && key === picked;
        if (minor) head.setAttribute('data-kp-minor', '');
        if (isPicked) head.setAttribute('data-kp-picked', '');
        // A minor name is not drawn: its header keeps the name for a screen reader, with no text to find under a neighbour [heat-deplist-1019].
        if (minor && !isPicked && text) head.setAttribute('aria-label', text);
        else head.textContent = text;
        return head;
    };
    const axis = make(doc, 'div', 'kp-heat__row kp-heat__axis', { role: 'row' });
    axis.append(make(doc, 'span', 'kp-heat__label', { role: 'columnheader', 'aria-hidden': 'true' }));
    const heads = make(doc, 'div', 'kp-heat__cells', { role: 'none' });
    // `every` counts the columns that are not marked: `minor: true` is never named and does not count, `minor: false` is always
    // named, and the rest are named every `every`th, the last of them always (the name before it gives way when the two would
    // stand side by side) [heat-deplist-1019].
    const open = columns.map((c, i) => (c.minor === undefined ? i : -1)).filter((i) => i >= 0);
    const named = new Set(open.filter((_, at) => at % every === 0 || at === open.length - 1));
    const before = open[open.length - 2];
    if (every > 1 && before !== undefined && before === open[open.length - 1] - 1) named.delete(before);
    columns.forEach((c, i) => heads.append(column(c.key, loading && !c.label ? '' : c.label, c.minor ?? !named.has(i))));
    axis.append(heads);

    let r = -1;
    /** @param {HeatRow} row @param {boolean} summary */
    const rowNode = (row, summary) => {
        r += 1;
        const node = make(doc, 'div', `kp-heat__row${summary ? ' kp-heat__row--summary' : ''}`, { role: 'row', 'data-row-key': row.key });
        const label = make(doc, 'div', 'kp-heat__label', { role: 'rowheader' });
        if (summary) label.classList.add('kp-heat__label--summary');
        if (loading && !row.label) {
            label.append(make(doc, 'span', 'kp-heat__label-skeleton kp-skeleton', { 'aria-hidden': 'true' }));
        } else {
            const inner =
                toggle && !summary
                    ? make(doc, 'button', 'kp-heat__label-button', {
                          type: 'button',
                          'aria-pressed': String(row.pressed ?? pressedKeys.has(row.key)),
                          'data-key': row.key,
                      })
                    : label;
            if (row.mark) {
                const mark = make(doc, 'i', 'kp-heat__mark', { 'aria-hidden': 'true' });
                mark.style.setProperty('--kp-heat-mark', row.mark);
                inner.append(mark);
            }
            const text = make(doc, 'span', `kp-heat__label-text${row.muted ? ' kp-heat__label-text--muted' : ''}`);
            text.textContent = row.label;
            text.title = row.label;
            inner.append(text);
            if (inner !== label) label.append(inner);
        }
        const cells = make(doc, 'div', 'kp-heat__cells', { role: 'none' });
        columns.forEach((col, c) => {
            const cell = row.cells[c];
            if (loading || cell?.tone === 'loading') {
                cells.append(
                    make(doc, 'span', 'kp-heat__cell kp-skeleton kp-skeleton--block', {
                        role: 'gridcell',
                        'data-kp-tone': 'loading',
                        'aria-label': s.heatLoading,
                        'data-r': String(r),
                        'data-c': String(c),
                    }),
                );
                return;
            }
            const calm = isCalmTones(el);
            const tone = calm ? /** @type {GridTone} */ (calmTone(cell?.tone ?? 'quiet', el)) : toneOf(cell?.tone);
            // A quiet cell says "nothing logged" (or nothing, with `data-kp-quiet-words="none"`), whatever the page wrote.
            const said =
                calm && tone === 'quiet' ? (el.getAttribute('data-kp-quiet-words') === 'none' ? '' : (calmWord('quiet') ?? '')) : cell?.label;
            const button = make(doc, 'button', 'kp-heat__cell', {
                type: 'button',
                role: 'gridcell',
                tabindex: '-1',
                'data-kp-tone': tone,
                'data-r': String(r),
                'data-c': String(c),
                'data-row-key': row.key,
                'data-col-key': col.key,
                'aria-label': cell?.aria && !(calm && tone === 'quiet') ? cell.aria : `${row.label}, ${col.label}${said ? `: ${said}` : ''}`,
            });
            if (tone === 'level') button.style.setProperty('--kp-heat-level', unit(cell?.level));
            if (summary && cell?.share != null) button.style.setProperty('--kp-heat-share', unit(cell.share));
            if (summary) button.setAttribute('data-kp-share', '');
            if (cell?.disabled) {
                button.setAttribute('aria-disabled', 'true');
                button.setAttribute('data-kp-inert', '');
            }
            if (cell?.tip !== undefined) button.setAttribute('data-kp-hovercard', cell.tip === true ? '' : cell.tip);
            if (picked != null && col.key === picked) {
                button.setAttribute('data-kp-picked', '');
                button.setAttribute('aria-selected', 'true');
            }
            cells.append(button);
        });
        node.append(label, cells);
        return node;
    };

    /** @type {Node[]} */
    const body = [];
    if ((spec.axis ?? 'start') === 'start') body.push(axis);
    if (spec.summary) {
        body.push(rowNode(spec.summary, true), make(doc, 'div', 'kp-heat__sep', { role: 'separator' }));
    }
    for (const row of rows) body.push(rowNode(row, false));
    if (spec.axis === 'end') body.push(axis);
    replaceKeepingCard(el, body);
    // The calm legend names the tones of the cells just drawn.
    if (spec.legend === undefined) syncCalmLegend(el);
    // Loading: the busy card over the rows' cells, the axis and the row names beside it.
    syncCard(
        el,
        loading,
        s.heatLoading,
        () => heatArea(el),
        'kp-heat__busy',
    );

    const stop = focusAt ?? STOPS.get(el);
    placeStop(el, HEAT_CELL, stop);
    if (focusAt) {
        const again = /** @type {HTMLElement | null} */ (el.querySelector(`${HEAT_CELL}[tabindex="0"]`));
        again?.focus({ preventScroll: true });
    }
}

/**
 * What a loading heat grid's busy card covers: the rows' cells and, below them, whatever the held footprint (js/footprint.js) adds,
 * down to the host's content edge, so the card fills the footprint the grid held and not only the few skeleton rows
 * [hlcomp-1019 heat-busy]. The axis and the names stay beside it.
 * @param {HTMLElement} el
 */
function heatArea(el) {
    const cells = [...el.querySelectorAll(':scope > .kp-heat__row:not(.kp-heat__axis) > .kp-heat__cells')].map((c) => c.getBoundingClientRect());
    if (!cells.length) return [];
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const floor = box.bottom - el.clientTop - (Number.parseFloat(style.paddingBottom) || 0);
    const top = Math.min(...cells.map((r) => r.top));
    return [
        {
            top,
            left: Math.min(...cells.map((r) => r.left)),
            bottom: Math.max(floor, ...cells.map((r) => r.bottom)),
            right: Math.max(...cells.map((r) => r.right)),
        },
    ];
}

/**
 * Pick a column (or none, with `null`) without an event: the cells and the
 * axis name of that column are marked `data-kp-picked`.
 * @param {HTMLElement} el
 * @param {string | null} key
 */
export function setHeatPick(el, key) {
    if (key == null) el.removeAttribute('data-kp-heat-picked');
    else el.setAttribute('data-kp-heat-picked', key);
    for (const node of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-col-key]'))) {
        const on = key != null && node.dataset.colKey === key;
        node.toggleAttribute('data-kp-picked', on);
        if (node.matches('.kp-heat__cell')) {
            if (on) node.setAttribute('aria-selected', 'true');
            else node.removeAttribute('aria-selected');
        }
    }
}

/**
 * Press the labels of these rows (and unpress the rest) without an event.
 * @param {HTMLElement} el
 * @param {readonly string[]} keys
 */
export function setHeatRows(el, keys) {
    const set = new Set(keys);
    LIT.set(el, set);
    for (const button of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-heat__label-button'))) {
        button.setAttribute('aria-pressed', String(set.has(button.dataset.key ?? '')));
    }
}

/* ---------------------------------------------------------------- the legend */

/** Legends made so far, for an id that is never twice on a page. */
let legendCount = 0;

/**
 * The legend a heat grid has: the list right after it, when that is a `.kp-heat__legend` (the markup a page wrote by hand is
 * taken over, not doubled).
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
function legendOf(el) {
    const next = el.nextElementSibling;
    return next instanceof HTMLElement && next.matches('.kp-heat__legend') ? next : null;
}

/** @param {HTMLElement} el the grid @param {HTMLElement | null} legend @param {boolean} on whether the grid names the legend */
function describedBy(el, legend, on) {
    if (!legend) return;
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== legend.id);
    if (on) ids.push(legend.id);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
}

/**
 * Take the legend away (hidden, and out of the grid's description), keeping the element where it stands so it can come back.
 * @param {HTMLElement} el
 */
function removeLegend(el) {
    const legend = legendOf(el);
    if (!legend) return;
    legend.hidden = true;
    legend.replaceChildren();
    legend.removeAttribute('data-kp-legend-source');
    describedBy(el, legend, false);
}

/**
 * The legend of a calm grid, drawn by the grid itself: Logged, Nothing logged, Paused. A legend the page wrote (setHeatLegend, or
 * markup) is left alone; `data-kp-legend="hide"`, or a grid that is no longer calm, takes the grid's own away.
 * @param {HTMLElement} el
 */
function syncCalmLegend(el) {
    const legend = legendOf(el);
    const own = legend?.getAttribute('data-kp-legend-source') === 'auto';
    if (legend && !own && legend.childElementCount > 0) return;
    if (isCalmTones(el) && el.getAttribute('data-kp-legend') !== 'hide') {
        // Only the tones the data has [gap audhd 41]: a grid with no paused cell does not name "Paused"; `data-kp-legend="all"`
        // keeps the three, and a grid with no cell yet (loading) lists all three so the legend keeps its footprint.
        const present = new Set([...el.querySelectorAll('.kp-heat__cell[data-kp-tone]')].map((c) => c.getAttribute('data-kp-tone')));
        const all = el.getAttribute('data-kp-legend') === 'all' || !['logged', 'quiet', 'paused'].some((t) => present.has(t));
        const entries = calmLegendEntries().filter((e) => all || present.has(e.tone));
        const signature = entries.map((e) => e.tone).join(' ');
        // Unchanged: nothing is rewritten (a grid that is redrawn many times a minute keeps its legend's nodes).
        if (own && !legend?.hidden && legend?.getAttribute('data-kp-legend-tones') === signature) return;
        const made = setHeatLegend(el, entries, { source: 'auto' });
        made?.setAttribute('data-kp-legend-tones', signature);
    } else if (own) removeLegend(el);
}

/**
 * The legend under a heat grid: a swatch and its words per entry, in the order given, a value ramp where an entry asks for one,
 * and at the end the line of keys. The list is the one right after the grid (made when there is none), named in the grid's
 * `aria-describedby`; no entries and no keys hides it. Called again, it rewrites in place, so the legend keeps its place while the
 * grid loads.
 *
 * @param {HTMLElement} el the heat grid
 * @param {readonly HeatLegendEntry[]} entries
 * @param {HeatLegendOptions & { source?: 'auto' }} [options]
 * @returns {HTMLElement | null} the legend, null for a grid that is not in a page
 */
export function setHeatLegend(el, entries, options = {}) {
    const doc = el.ownerDocument;
    const s = getStrings();
    let legend = legendOf(el);
    if (!legend) {
        if (!el.parentNode) return null;
        legend = make(doc, 'ul', 'kp-heat__legend');
        el.after(legend);
    }
    if (!legend.id) legend.id = `${el.id || 'kp-heat'}-legend${el.id ? '' : `-${(legendCount += 1)}`}`;
    const keys = options.keys === true ? defaultHeatKeys(s) : options.keys || null;
    legend.setAttribute('aria-label', options.label ?? s.heatLegendLabel);
    if (options.source) legend.setAttribute('data-kp-legend-source', options.source);
    else legend.removeAttribute('data-kp-legend-source');
    /** @type {HTMLElement[]} */
    const items = [];
    for (const entry of entries) {
        const li = make(doc, 'li');
        if (entry.ramp) {
            const steps = Math.min(9, Math.max(2, Math.trunc(entry.steps ?? 5)));
            const ramp = make(doc, 'span', 'kp-heat__ramp', { 'aria-hidden': 'true' });
            for (let i = 0; i < steps; i += 1) {
                const swatch = make(doc, 'span', 'kp-heat__swatch', { 'data-kp-tone': 'level' });
                swatch.style.setProperty('--kp-heat-level', String(Math.round((i / (steps - 1)) * 100) / 100));
                ramp.append(swatch);
            }
            li.append(entry.less ?? s.heatLegendLess, ramp, entry.more ?? s.heatLegendMore);
        } else {
            const swatch = make(doc, 'span', 'kp-heat__swatch', { 'data-kp-tone': entry.tone ?? 'muted', 'aria-hidden': 'true' });
            li.append(swatch, ` ${entry.label ?? ''}`);
        }
        items.push(li);
    }
    if (keys && keys.length) {
        const end = make(doc, 'li', 'kp-heat__legend-end');
        const line = make(doc, 'div', 'kp-keys');
        setKeys(line, keys);
        end.append(line);
        items.push(end);
    }
    legend.replaceChildren(...items);
    legend.hidden = items.length === 0;
    describedBy(el, legend, items.length > 0);
    return legend;
}

/** @param {ReturnType<typeof getStrings>} s @returns {import('./keys.js').KeyPair[]} */
function defaultHeatKeys(s) {
    return [
        [['←', '↑', '↓', '→'], s.heatKeysMove],
        ['Enter', s.heatKeysPick],
        ['Esc', s.heatKeysDrop],
        [['PgUp', 'PgDn'], s.heatKeysPage],
    ];
}

/**
 * @param {HTMLElement} el
 * @returns {() => void}
 */
function wireHeat(el) {
    /** @param {Event} event */
    const onClick = (event) => {
        const target = /** @type {Element} */ (event.target);
        const label = /** @type {HTMLElement | null} */ (target.closest('.kp-heat__label-button'));
        if (label && el.contains(label)) {
            const key = label.dataset.key ?? '';
            const keys = new Set(LIT.get(el) ?? []);
            const pressed = !keys.has(key);
            if (!el.hasAttribute('data-kp-heat-owned')) {
                if (pressed) keys.add(key);
                else keys.delete(key);
                setHeatRows(el, [...keys]);
            }
            el.dispatchEvent(new CustomEvent(HEAT_ROW_EVENT, { bubbles: true, detail: { key, pressed, keys: [...keys] } }));
            return;
        }
        const cell = /** @type {HTMLElement | null} */ (target.closest(HEAT_CELL));
        if (!cell || !el.contains(cell) || cell.hasAttribute('aria-disabled')) return;
        STOPS.set(el, { r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
        const key = cell.dataset.colKey ?? '';
        const already = el.getAttribute('data-kp-heat-picked') === key;
        if (!el.hasAttribute('data-kp-heat-owned')) setHeatPick(el, already ? null : key);
        el.dispatchEvent(
            new CustomEvent(HEAT_PICK_EVENT, { bubbles: true, detail: { rowKey: cell.dataset.rowKey, colKey: key, cell, picked: !already } }),
        );
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const cell = /** @type {HTMLElement | null} */ ((event.target instanceof Element ? event.target : null)?.closest(HEAT_CELL) ?? null);
        if (!cell || !el.contains(cell)) return;
        const grid = cellGrid(el, HEAT_CELL);
        let r = Number(cell.dataset.r);
        let c = Number(cell.dataset.c);
        const rowsN = grid.length;
        const colsN = (grid[r] ?? []).length;
        const key = event.key;
        let askLatest = false;
        if (key === 'ArrowRight') c = Math.min(colsN - 1, c + 1);
        else if (key === 'ArrowLeft') c = Math.max(0, c - 1);
        else if (key === 'ArrowDown') r = Math.min(rowsN - 1, r + 1);
        else if (key === 'ArrowUp') r = Math.max(0, r - 1);
        else if (key === 'Home' || key === 'End') {
            c = key === 'Home' ? 0 : colsN - 1;
            if (event.ctrlKey) r = key === 'Home' ? 0 : rowsN - 1;
            // The key towards the newest column asks the page for the newest columns too [kpadopt3].
            const latest = el.getAttribute('data-kp-heat-latest');
            askLatest = latest !== null && key === (latest === 'start' ? 'Home' : 'End');
        } else if (key === 'PageUp' || key === 'PageDown') {
            event.preventDefault();
            el.dispatchEvent(new CustomEvent(HEAT_PAGE_EVENT, { bubbles: true, detail: { direction: key === 'PageUp' ? 'earlier' : 'later' } }));
            return;
        } else if (key === 'Escape') {
            if (el.getAttribute('data-kp-heat-picked') == null) return;
            event.preventDefault();
            if (!el.hasAttribute('data-kp-heat-owned')) setHeatPick(el, null);
            el.dispatchEvent(
                new CustomEvent(HEAT_PICK_EVENT, { bubbles: true, detail: { rowKey: cell.dataset.rowKey, colKey: null, cell, picked: false } }),
            );
            return;
        } else return;
        event.preventDefault();
        const to = grid[r]?.[c];
        if (!to) return;
        STOPS.set(el, { r, c });
        placeStop(el, HEAT_CELL, { r, c });
        to.focus();
        // Asked once the focus stands on the edge: a page that redraws the grid keeps it there.
        if (askLatest) el.dispatchEvent(new CustomEvent(HEAT_PAGE_EVENT, { bubbles: true, detail: { direction: 'latest' } }));
    };
    /** @param {FocusEvent} event */
    const onFocus = (event) => {
        const cell = /** @type {HTMLElement | null} */ ((event.target instanceof Element ? event.target : null)?.closest(HEAT_CELL) ?? null);
        if (!cell || !el.contains(cell)) return;
        const at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
        const now = STOPS.get(el);
        if (now?.r !== at.r || now?.c !== at.c) placeStop(el, HEAT_CELL, at);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.addEventListener('focusin', onFocus);
    // A calm grid draws its legend, and follows the options that decide it, also when the page only flips an attribute.
    syncCalmLegend(el);
    const legendWatch = new MutationObserver(() => syncCalmLegend(el));
    legendWatch.observe(el, { attributes: true, attributeFilter: ['data-kp-tones', 'data-kp-legend'] });
    // Markup written by hand gets its tab stop and its pressed labels.
    if (el.querySelector(HEAT_CELL)) {
        const pressed = /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-heat__label-button[aria-pressed="true"]'));
        LIT.set(el, new Set([...pressed].map((b) => b.dataset.key ?? '')));
        if (!el.querySelector(`${HEAT_CELL}[tabindex="0"]`)) placeStop(el, HEAT_CELL, undefined);
    }
    return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('focusin', onFocus);
        legendWatch.disconnect();
    };
}

/** @type {WeakMap<Element, () => void>} */
const WIRED = new WeakMap();

/**
 * Wire every heat grid under `root`: pick, row labels, keys.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachHeats(root = document) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    attachHoverCards(doc);
    /** @type {(() => void)[]} */
    const undo = [];
    const all = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(HEAT) ? [root] : []), ...root.querySelectorAll(HEAT)]);
    for (const el of all) {
        if (WIRED.has(el)) continue;
        const off = wireHeat(el);
        WIRED.set(el, off);
        undo.push(() => {
            off();
            WIRED.delete(el);
        });
    }
    return () => undo.forEach((fn) => fn());
}

/* ---------------------------------------------------------------- the matrix */

const MATRIX_CELL = '.kp-matrix__cell[data-c]:not([data-kp-inert])';
const GLYPHS = Object.freeze({ ok: '✓', warn: '!', bad: '×', muted: '–', none: '–' });

/**
 * Write a matrix: the corner, the column headers, then a row header and a
 * cell for each column on every row. The headers are `position: sticky`.
 *
 * @param {HTMLElement} el
 * @param {MatrixSpec} spec
 */
export function setMatrix(el, spec) {
    const doc = el.ownerDocument;
    const s = getStrings();
    const state = spec.state ?? 'ready';
    const loading = state === 'loading';
    // The second view of the same relation: two columns joined by lines (js/uses-map.js) [kpadopt6-media].
    const view = spec.view ?? el.getAttribute('data-kp-view') ?? rememberedView(el) ?? 'grid';
    if (spec.view) rememberView(el, spec.view);
    if (view === 'lines') {
        if (waitForCard(el, spec, loading, setMatrix)) return;
        drawUsesMap(el, spec, { replaceKeepingCard, syncCard, markDrawn });
        return;
    }
    if (el.classList.contains('kp-matrix--lines')) leaveUsesMap(el);
    el.setAttribute('data-kp-view', 'grid');
    if (waitForCard(el, spec, loading, setMatrix)) return;
    const hadFocus = el.contains(doc.activeElement) && doc.activeElement?.matches(MATRIX_CELL);
    const focusAt = hadFocus
        ? { r: Number(/** @type {HTMLElement} */ (doc.activeElement).dataset.r), c: Number(/** @type {HTMLElement} */ (doc.activeElement).dataset.c) }
        : null;
    let rows = spec.rows ?? [];
    let columns = spec.columns ?? [];
    if (loading && rows.length === 0 && spec.skeleton) rows = Array.from({ length: spec.skeleton }, (_, i) => ({ key: `r${i}`, label: '' }));
    if (loading && columns.length === 0 && spec.skeleton) columns = Array.from({ length: spec.skeleton }, (_, i) => ({ key: `c${i}`, label: '' }));
    const lit = new Set(spec.lit ?? LIT.get(el) ?? []);
    LIT.set(el, lit);
    const picked = spec.picked === undefined ? parsePick(el) : spec.picked;

    el.classList.add('kp-matrix');
    el.setAttribute('data-kp-matrix', '');
    el.setAttribute('data-kp-state', state);
    if (loading) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
    el.toggleAttribute('data-kp-lit', lit.size > 0);

    let grid = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-matrix__grid'));
    if (!grid) {
        grid = make(doc, 'div', 'kp-matrix__grid', { role: 'grid' });
        replaceKeepingCard(el, [grid]);
    }
    if (spec.label && !grid.hasAttribute('aria-label')) grid.setAttribute('aria-label', spec.label);
    grid.style.setProperty('--kp-matrix-cols', String(Math.max(1, columns.length)));

    if (state === 'empty' || state === 'error') {
        const note = make(doc, 'div', 'kp-matrix__state', { 'data-kp-state': state });
        note.append(
            hostStatePlate(el, {
                kind: state,
                title: spec.message ?? (state === 'error' ? s.heatFailed : s.heatEmpty),
                ...(spec.text ? { text: spec.text } : {}),
                art: spec.art,
                retryEvent: MATRIX_RETRY_EVENT,
            }),
        );
        markDrawn(el);
        el.replaceChildren(note);
        return;
    }
    if (grid.parentElement !== el) replaceKeepingCard(el, [grid]);

    /** @param {{ key: string, label: string, mark?: string }} item @param {'col' | 'row'} kind */
    const header = (item, kind) => {
        if (loading && !item.label)
            return make(doc, 'span', `kp-matrix__${kind} kp-matrix__${kind}--skeleton kp-skeleton`, { 'aria-hidden': 'true' });
        const node = make(doc, 'button', `kp-matrix__${kind}`, {
            type: 'button',
            role: kind === 'col' ? 'columnheader' : 'rowheader',
            'aria-pressed': String(lit.has(item.key)),
            'data-key': item.key,
        });
        if (item.mark) {
            const mark = make(doc, 'i', 'kp-matrix__mark', { 'aria-hidden': 'true' });
            mark.style.setProperty('--kp-heat-mark', item.mark);
            node.append(mark);
        }
        const text = make(doc, 'span', 'kp-matrix__name');
        text.textContent = item.label;
        text.title = item.label;
        node.append(text);
        return node;
    };

    const head = make(doc, 'div', 'kp-matrix__line', { role: 'row' });
    const corner = make(doc, 'span', 'kp-matrix__corner', { role: 'columnheader' });
    corner.textContent = spec.corner ?? '';
    head.append(corner, ...columns.map((c) => header(c, 'col')));
    /** @type {Node[]} */
    const body = [head];
    rows.forEach((row, r) => {
        const node = make(doc, 'div', 'kp-matrix__line', { role: 'row' });
        node.append(header(row, 'row'));
        columns.forEach((col, c) => {
            if (loading) {
                node.append(
                    make(doc, 'span', 'kp-matrix__cell kp-skeleton kp-skeleton--block', {
                        role: 'gridcell',
                        'data-kp-tone': 'loading',
                        'data-kp-inert': '',
                        'aria-label': s.heatLoading,
                    }),
                );
                return;
            }
            let cell = spec.cell?.(row.key, col.key);
            if (cell == null && row.key === col.key) cell = { tone: 'self', label: s.matrixSelf };
            if (cell == null || cell.tone === 'self' || cell.tone === 'none') {
                const tone = cell?.tone === 'self' || (cell == null && row.key === col.key) ? 'self' : 'none';
                node.append(
                    make(doc, 'span', 'kp-matrix__cell', {
                        role: 'gridcell',
                        'data-kp-tone': tone,
                        'data-kp-inert': '',
                        'aria-label': `${row.label} to ${col.label}: ${cell?.label ?? (tone === 'self' ? s.matrixSelf : s.matrixUnknown)}`,
                        'data-row-key': row.key,
                        'data-col-key': col.key,
                    }),
                );
                return;
            }
            const tone = toneOf(cell.tone);
            const button = make(doc, 'button', 'kp-matrix__cell', {
                type: 'button',
                role: 'gridcell',
                tabindex: '-1',
                'data-kp-tone': tone,
                'data-r': String(r),
                'data-c': String(c),
                'data-row-key': row.key,
                'data-col-key': col.key,
                'aria-pressed': String(picked?.row === row.key && picked?.column === col.key),
                'aria-label': cell.aria ?? `${row.label} to ${col.label}${cell.label ? `: ${cell.label}` : ''}`,
            });
            if (cell.text) button.textContent = cell.text;
            else if (tone in GLYPHS) button.setAttribute('data-kp-glyph', GLYPHS[/** @type {keyof typeof GLYPHS} */ (tone)]);
            if (cell.ringed) button.setAttribute('data-kp-ringed', '');
            if (cell.mark) button.setAttribute('data-kp-mark', '');
            if (cell.disabled) {
                button.setAttribute('aria-disabled', 'true');
                button.setAttribute('data-kp-inert', '');
            }
            if (cell.tip !== undefined) button.setAttribute('data-kp-hovercard', cell.tip === true ? '' : cell.tip);
            node.append(button);
        });
        body.push(node);
    });
    grid.replaceChildren(...body);
    // Loading: the busy card over the cells in view, under the sticky corner, so the headers stay readable beside it.
    syncCard(el, loading, s.heatLoading, () => matrixArea(el), 'kp-matrix__busy');
    markHot(el);

    placeStop(el, MATRIX_CELL, focusAt ?? (picked ? findStop(el, picked) : STOPS.get(el)));
    if (focusAt) /** @type {HTMLElement | null} */ (el.querySelector(`${MATRIX_CELL}[tabindex="0"]`))?.focus({ preventScroll: true });
}

/**
 * The matrix's cells, clear of its sticky corner: the column headers stay above the card and the row headers beside it,
 * however far the matrix is scrolled.
 * @param {HTMLElement} el
 * @returns {{ top: number, right: number, bottom: number, left: number }[]}
 */
function matrixArea(el) {
    const cells = [...el.querySelectorAll('.kp-matrix__cell')].map((cell) => cell.getBoundingClientRect());
    if (!cells.length) return [];
    const corner = el.querySelector('.kp-matrix__corner')?.getBoundingClientRect();
    return [
        {
            top: Math.max(Math.min(...cells.map((r) => r.top)), corner?.bottom ?? -Infinity),
            left: Math.max(Math.min(...cells.map((r) => r.left)), corner?.right ?? -Infinity),
            bottom: Math.max(...cells.map((r) => r.bottom)),
            right: Math.max(...cells.map((r) => r.right)),
        },
    ];
}

/** @param {HTMLElement} el @returns {{ row: string, column: string } | null} */
function parsePick(el) {
    const cell = /** @type {HTMLElement | null} */ (el.querySelector('.kp-matrix__cell[aria-pressed="true"]'));
    return cell ? { row: cell.dataset.rowKey ?? '', column: cell.dataset.colKey ?? '' } : null;
}

/** @param {HTMLElement} el @param {{ row: string, column: string }} pick */
function findStop(el, pick) {
    const cell = /** @type {HTMLElement | null} */ (
        el.querySelector(`.kp-matrix__cell[data-row-key="${CSS.escape(pick.row)}"][data-col-key="${CSS.escape(pick.column)}"][data-c]`)
    );
    return cell ? { r: Number(cell.dataset.r), c: Number(cell.dataset.c) } : undefined;
}

/** Mark the cells a lit header touches `data-kp-hot`. @param {HTMLElement} el */
function markHot(el) {
    const lit = LIT.get(el) ?? new Set();
    el.toggleAttribute('data-kp-lit', lit.size > 0);
    for (const cell of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-matrix__cell'))) {
        const hot =
            lit.size === 0 ||
            lit.has(cell.dataset.rowKey ?? '\0') ||
            lit.has(cell.dataset.colKey ?? '\0') ||
            cell.dataset.kpTone === 'self' ||
            cell.dataset.kpTone === 'none';
        cell.toggleAttribute('data-kp-hot', hot && lit.size > 0);
    }
    for (const head of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('button.kp-matrix__col, button.kp-matrix__row'))) {
        if (head.dataset.key !== undefined) head.setAttribute('aria-pressed', String(lit.has(head.dataset.key)));
    }
}

/**
 * Light these headers (their row and their column) and dim the rest, without an event.
 * @param {HTMLElement} el
 * @param {readonly string[]} keys
 */
export function setMatrixLit(el, keys) {
    LIT.set(el, new Set(keys));
    markHot(el);
}

/**
 * Pin one cell (or none) without an event.
 * @param {HTMLElement} el
 * @param {{ row: string, column: string } | null} pick
 */
export function setMatrixPick(el, pick) {
    for (const cell of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('.kp-matrix__cell[data-c]'))) {
        cell.setAttribute('aria-pressed', String(pick != null && cell.dataset.rowKey === pick.row && cell.dataset.colKey === pick.column));
    }
    if (pick) {
        const at = findStop(el, pick);
        if (at) placeStop(el, MATRIX_CELL, at);
    }
}

/**
 * @param {HTMLElement} el
 * @returns {() => void}
 */
function wireMatrix(el) {
    const pin = (/** @type {HTMLElement} */ cell, /** @type {string} */ source) => {
        const was = cell.getAttribute('aria-pressed') === 'true';
        if (!el.hasAttribute('data-kp-matrix-owned')) setMatrixPick(el, { row: cell.dataset.rowKey ?? '', column: cell.dataset.colKey ?? '' });
        STOPS.set(el, { r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
        el.dispatchEvent(
            new CustomEvent(MATRIX_PICK_EVENT, {
                bubbles: true,
                detail: { rowKey: cell.dataset.rowKey, colKey: cell.dataset.colKey, cell, source, again: was },
            }),
        );
    };
    /** @param {Event} event */
    const onClick = (event) => {
        const target = /** @type {Element} */ (event.target);
        const head = /** @type {HTMLElement | null} */ (target.closest('button.kp-matrix__col, button.kp-matrix__row'));
        if (head && el.contains(head)) {
            const key = head.dataset.key ?? '';
            if (!el.hasAttribute('data-kp-matrix-owned')) {
                const lit = new Set(LIT.get(el) ?? []);
                if (lit.has(key)) lit.delete(key);
                else lit.add(key);
                setMatrixLit(el, [...lit]);
            }
            el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [...(LIT.get(el) ?? [])], key } }));
            return;
        }
        const cell = /** @type {HTMLElement | null} */ (target.closest(MATRIX_CELL));
        if (cell && el.contains(cell) && !cell.hasAttribute('aria-disabled')) pin(cell, 'pointer');
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const cell = /** @type {HTMLElement | null} */ ((event.target instanceof Element ? event.target : null)?.closest(MATRIX_CELL) ?? null);
        if (!cell || !el.contains(cell)) {
            if (event.key === 'Escape' && (LIT.get(el)?.size ?? 0) > 0 && !el.hasAttribute('data-kp-matrix-owned')) {
                setMatrixLit(el, []);
                el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [], key: null } }));
            }
            return;
        }
        if (event.key === 'Escape' && (LIT.get(el)?.size ?? 0) > 0) {
            event.preventDefault();
            if (!el.hasAttribute('data-kp-matrix-owned')) setMatrixLit(el, []);
            el.dispatchEvent(new CustomEvent(MATRIX_LIGHT_EVENT, { bubbles: true, detail: { keys: [], key: null } }));
            return;
        }
        const step = /** @type {Record<string, [number, number]>} */ ({
            ArrowRight: [0, 1],
            ArrowLeft: [0, -1],
            ArrowDown: [1, 0],
            ArrowUp: [-1, 0],
        })[event.key];
        const grid = cellGrid(el, MATRIX_CELL);
        const rowsN = Math.max(grid.length, el.querySelectorAll('.kp-matrix__grid > .kp-matrix__line').length - 1);
        const colsN = Number(/** @type {HTMLElement} */ (el.querySelector('.kp-matrix__grid')).style.getPropertyValue('--kp-matrix-cols')) || 1;
        let r = Number(cell.dataset.r);
        let c = Number(cell.dataset.c);
        if (step) {
            // Wrap round, and skip the cells that cannot be pressed.
            for (let i = 0; i < rowsN * colsN; i++) {
                r = (r + step[0] + rowsN) % rowsN;
                c = (c + step[1] + colsN) % colsN;
                if (grid[r]?.[c]) break;
            }
        } else if (event.key === 'Home' || event.key === 'End') {
            const row = (grid[r] ?? []).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
            c = event.key === 'Home' ? row[0] : row[row.length - 1];
            if (event.ctrlKey) {
                const rr = grid.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
                r = event.key === 'Home' ? rr[0] : rr[rr.length - 1];
                const cc = (grid[r] ?? []).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
                c = event.key === 'Home' ? cc[0] : cc[cc.length - 1];
            }
        } else return;
        event.preventDefault();
        const to = grid[r]?.[c];
        if (!to) return;
        placeStop(el, MATRIX_CELL, { r, c });
        to.focus();
        if (el.getAttribute('data-kp-matrix-select') === 'follow') pin(to, 'keyboard');
    };
    /** @param {FocusEvent} event */
    const onFocus = (event) => {
        const cell = /** @type {HTMLElement | null} */ ((event.target instanceof Element ? event.target : null)?.closest(MATRIX_CELL) ?? null);
        if (!cell || !el.contains(cell)) return;
        const at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
        const now = STOPS.get(el);
        if (now?.r !== at.r || now?.c !== at.c) placeStop(el, MATRIX_CELL, at);
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.addEventListener('focusin', onFocus);
    if (el.querySelector(MATRIX_CELL)) {
        const lit = /** @type {NodeListOf<HTMLElement>} */ (
            el.querySelectorAll('button.kp-matrix__col[aria-pressed="true"], button.kp-matrix__row[aria-pressed="true"]')
        );
        LIT.set(el, new Set([...lit].map((b) => b.dataset.key ?? '')));
        markHot(el);
        if (!el.querySelector(`${MATRIX_CELL}[tabindex="0"]`)) placeStop(el, MATRIX_CELL, undefined);
    }
    return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('focusin', onFocus);
    };
}

/** @type {WeakMap<Element, () => void>} */
const MATRIX_WIRED = new WeakMap();

/**
 * Wire every matrix under `root`: pin, light the headers, keys.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachMatrices(root = document) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    attachHoverCards(doc);
    /** @type {(() => void)[]} */
    const undo = [];
    const all = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(MATRIX) ? [root] : []), ...root.querySelectorAll(MATRIX)]);
    for (const el of all) {
        if (MATRIX_WIRED.has(el)) continue;
        const off = wireMatrix(el);
        MATRIX_WIRED.set(el, off);
        undo.push(() => {
            off();
            MATRIX_WIRED.delete(el);
        });
    }
    return () => undo.forEach((fn) => fn());
}
