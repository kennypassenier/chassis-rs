// Draws the matrix and sets its lit headers and its pinned cell.
import { getStrings } from '../strings.js';
import { hostStatePlate } from '../state-plate.js';
import { drawUsesMap, leaveUsesMap, rememberView, rememberedView } from '../uses-map.js';
import { markDrawn, replaceKeepingCard, syncCard, waitForCard } from './card.js';
import { GLYPHS, MATRIX_CELL, MATRIX_RETRY_EVENT } from './constants.js';
import { make, toneOf } from './dom.js';
import { placeStop } from './draw.js';
import { LIT, STOPS } from './grid-state.js';
/** @typedef {import('./types.js').MatrixSpec} MatrixSpec */

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
export function markHot(el) {
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
