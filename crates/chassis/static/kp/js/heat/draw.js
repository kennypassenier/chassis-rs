// Draws the heat grid from its spec.
import { getStrings } from '../strings.js';
import { hostStatePlate } from '../state-plate.js';
import { calmTone, calmWord, isCalmTones } from '../calm-tones.js';
import { PLATES, markDrawn, replaceKeepingCard, syncCard, waitForCard } from './card.js';
import { HEAT_CELL, HEAT_RETRY_EVENT } from './constants.js';
import { make, toneOf, unit } from './dom.js';
import { DECORATE, LIT, STOPS } from './grid-state.js';
import { removeLegend, setHeatLegend, syncCalmLegend } from './legend.js';
import { removeHeatPaging, setHeatPaging } from './paging.js';
/** @typedef {import('./types.js').GridTone} GridTone */
/** @typedef {import('./types.js').HeatDecorateInfo} HeatDecorateInfo */
/** @typedef {import('./types.js').HeatRow} HeatRow */
/** @typedef {import('./types.js').HeatSpec} HeatSpec */

/**
 * The cells a key may land on, in reading order, with their row and column.
 * @param {Element} grid @param {string} cellSelector
 * @returns {HTMLElement[][]}
 */
export function cellGrid(grid, cellSelector) {
    /** @type {HTMLElement[][]} */
    const out = [];
    for (const cell of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll(cellSelector))) {
        const r = Number(cell.dataset.r);
        (out[r] ??= [])[Number(cell.dataset.c)] = cell;
    }
    return out;
}

/** @param {Element} grid @param {string} selector @param {{ r: number, c: number } | undefined} stop */
export function placeStop(grid, selector, stop) {
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

/**
 * Write a heat grid: the column axis, an optional summary row and the rows,
 * replacing what the element held. The grid keeps its columns, its row
 * heights and its picked column across a rewrite; a focused cell keeps its
 * place.
 *
 * @param {HTMLElement} el
 * @param {HeatSpec} spec
 * @param {{ decorate?: (part: HTMLElement, info: HeatDecorateInfo) => void }} [options]  `decorate`: called with every row label button and
 *   every cell button the grid builds (and the paging buttons), each time it builds one, the same shape gantt and the data table have;
 *   kept for later redraws until another is given [wish-1120, homelab 65, 114]
 */
export function setHeat(el, spec, options) {
    const doc = el.ownerDocument;
    const s = getStrings();
    if (options && 'decorate' in options) {
        if (options.decorate) DECORATE.set(el, options.decorate);
        else DECORATE.delete(el);
    }
    const decorate = DECORATE.get(el);
    /** @param {HTMLElement} part @param {Omit<HeatDecorateInfo, 'host' | 'key'>} info */
    const mark = (part, info) => {
        if (!decorate) return;
        const key = el.getAttribute('data-kp-key');
        decorate(part, { ...info, host: el, ...(key === null ? {} : { key }) });
    };
    // The Earlier / Today / Later bar belongs to the grid, not to one drawing of it.
    if (spec.paging === false) removeHeatPaging(el);
    else if (spec.paging) setHeatPaging(el, spec.paging);
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
            if (inner !== label) mark(inner, { kind: 'row-label', value: row.key, label: row.label });
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
            mark(button, { kind: 'cell', value: `${row.key}/${col.key}`, index: c, label: button.getAttribute('aria-label') ?? '' });
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
