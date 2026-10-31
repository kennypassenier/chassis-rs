// Paints the cells, the summary row and the whole grid from its state.
import { getStrings } from '../strings.js';
import { attachHeats, setHeat } from '../heat.js';
import { statePlate } from '../state-plate.js';
import { memoryFor } from '../remember.js';
import { attr, availabilityBest, cellKey, columnFacts, editable, el, glyphOf, ordered, stateOf, tipOf, toneOf, wordOf } from './facts.js';
import { columnsList, syncListCard } from './list.js';

/** @param {HTMLElement} root @param {string} message */
export function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-availability__live'));
    if (!region) {
        region = el('kp-sr-only kp-availability__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** Write one cell's face from its answer. @param {HTMLElement} root @param {HTMLElement} cell */
export function paintCell(root, cell) {
    const st = stateOf(root);
    const person = cell.getAttribute('data-row-key') ?? '';
    const column = cell.getAttribute('data-col-key') ?? '';
    const a = st.set.answers[person]?.[column];
    const col = st.set.columns.find((c) => c.key === column);
    const p = (st.spec.people ?? []).find((q) => q.id === person);
    cell.setAttribute('data-kp-tone', toneOf(a));
    cell.setAttribute('data-kp-availability-answer', a ?? 'none');
    const own = editable(root, person, column);
    cell.toggleAttribute('data-kp-availability-editable', own);
    cell.setAttribute('aria-disabled', String(!own));
    cell.toggleAttribute('data-kp-inert', !own);
    cell.setAttribute('aria-label', getStrings().availabilityCell(p?.name ?? person, col?.label ?? column, wordOf(a)));
    const saving = st.saving.has(cellKey(person, column));
    cell.toggleAttribute('data-kp-availability-saving', saving);
    cell.toggleAttribute('data-kp-availability-refused', st.refused.has(cellKey(person, column)));
    let face = /** @type {HTMLElement | null} */ (cell.querySelector(':scope > .kp-availability__face'));
    if (!face) {
        face = el('kp-availability__face', 'span');
        face.setAttribute('aria-hidden', 'true');
        cell.append(face);
    }
    face.replaceChildren();
    if (saving) {
        const spin = el('kp-spinner', 'span');
        face.append(spin);
    } else if (st.refused.has(cellKey(person, column))) face.textContent = '!';
    else face.textContent = glyphOf(a);
}

/** Write the summary row, the best column and the lines around the grid. @param {HTMLElement} root */
export function paintSummary(root) {
    const st = stateOf(root);
    const s = getStrings();
    const grid = /** @type {HTMLElement | null} */ (root.querySelector('.kp-availability__grid'));
    const best = new Set(availabilityBest(root));
    const total = (st.spec.people ?? []).length;
    if (grid) {
        for (const cell of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('.kp-heat__row--summary .kp-heat__cell[data-col-key]'))) {
            const f = columnFacts(root, cell.getAttribute('data-col-key') ?? '');
            const tone = f.answered === 0 ? 'muted' : f.no === 0 && f.yes === total ? 'ok' : f.no === 0 ? 'warn' : f.yes === 0 ? 'bad' : 'warn';
            cell.setAttribute('data-kp-tone', tone);
            cell.style.setProperty('--kp-heat-share', String(total ? f.yes / total : 0));
            cell.setAttribute(
                'aria-label',
                `${(st.set.columns.find((c) => c.key === cell.getAttribute('data-col-key')) ?? { label: '' }).label}: ${s.availabilityCount(f.yes, total)}`,
            );
            cell.setAttribute('data-kp-hovercard', tipOf(f));
            let face = /** @type {HTMLElement | null} */ (cell.querySelector(':scope > .kp-availability__face'));
            if (!face) {
                face = el('kp-availability__face', 'span');
                face.setAttribute('aria-hidden', 'true');
                cell.append(face);
            }
            face.textContent = f.answered === 0 ? '' : String(f.yes);
        }
        for (const node of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('[data-col-key]'))) {
            node.toggleAttribute('data-kp-availability-star', best.has(node.getAttribute('data-col-key') ?? ''));
        }
        for (const node of grid.querySelectorAll('.kp-heat__col')) {
            const key = node.getAttribute('data-col-key') ?? '';
            node.toggleAttribute('data-kp-availability-star', best.has(key));
        }
    }
    // The line above the grid: how many answered, and the best column in words.
    const line = /** @type {HTMLElement | null} */ (root.querySelector('.kp-availability__line'));
    if (line) {
        const answeredPeople = (st.spec.people ?? []).filter((p) => Object.keys(st.set.answers[p.id] ?? {}).length > 0).length;
        const bestCols = st.set.columns.filter((c) => best.has(c.key));
        const bestLine = bestCols.length
            ? s.availabilityBestLine(bestCols.map((c) => c.label).join(', '), s.availabilityCount(columnFacts(root, bestCols[0].key).yes, total))
            : '';
        line.replaceChildren();
        const count = el('kp-availability__answered', 'span');
        count.textContent = answeredPeople === 0 ? s.availabilityNobodyAnswered : s.availabilityAnswered(answeredPeople, total);
        line.append(count);
        if (bestLine) {
            const b = el('kp-availability__bestline', 'span');
            b.textContent = bestLine;
            line.append(b);
        }
    }
    const choose = /** @type {HTMLButtonElement | null} */ (root.querySelector('.kp-availability__choose'));
    if (choose) {
        const on = root.hasAttribute('data-kp-availability-choose') && best.size > 0;
        choose.hidden = !on;
        choose.disabled = root.hasAttribute('data-kp-availability-disabled');
        choose.textContent = s.availabilityChoose;
    }
}

/** Draw the whole grid from the state. @param {HTMLElement} root */
export function render(root) {
    const st = stateOf(root);
    const s = getStrings();
    const spec = st.spec;
    const state = spec.state ?? 'ready';
    root.setAttribute('data-kp-state', state);
    root.toggleAttribute('aria-busy', state === 'loading');
    const body = /** @type {HTMLElement} */ (root.querySelector('.kp-availability__body'));
    const people = ordered(root);
    const columns = st.set.columns;

    // The unit switch.
    const head = /** @type {HTMLElement} */ (root.querySelector('.kp-availability__head'));
    let unit = /** @type {HTMLElement | null} */ (head.querySelector('.kp-availability__unit'));
    const switchAttr = root.getAttribute('data-kp-availability-unit-switch');
    const switchable = switchAttr === 'on' ? true : switchAttr === 'off' ? false : Boolean(spec.canSwitchUnit);
    if (switchable && spec.sets) {
        if (!unit) {
            unit = el('kp-segmented kp-availability__unit');
            unit.setAttribute('role', 'group');
            unit.setAttribute('aria-label', s.availabilityUnitLabel);
            for (const key of /** @type {const} */ (['range', 'day'])) {
                const b = /** @type {HTMLButtonElement} */ (el('kp-segmented__item', 'button'));
                b.type = 'button';
                b.setAttribute('data-value', key);
                const label = el('kp-segmented__label', 'span');
                label.textContent = key === 'range' ? s.availabilityByPeriod : s.availabilityByDay;
                b.append(label);
                unit.append(b);
            }
            head.prepend(unit);
        }
        for (const b of unit.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === st.unit));
    } else unit?.remove();

    // Whatever the body held goes; the heat grid keeps its element so its busy card and wiring survive.
    let grid = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-availability__grid'));
    for (const stray of body.querySelectorAll(':scope > .kp-availability__plate, :scope > .kp-availability__columns')) stray.remove();
    if (state === 'empty' || state === 'error' || (state === 'ready' && columns.length === 0)) {
        // The plate keeps the footprint the grid had.
        if (grid && grid.offsetHeight > 0) body.style.setProperty('--kp-availability-body-min', `${Math.round(grid.offsetHeight)}px`);
        grid?.remove();
        syncListCard(root, body, false);
        const kind = state === 'error' ? 'error' : 'empty';
        const plate = statePlate(document, {
            kind,
            title: spec.message ?? (kind === 'error' ? s.availabilityFailedTitle : s.availabilityEmptyTitle),
            text: kind === 'error' ? s.availabilityFailedText : s.availabilityEmptyText,
            actionLabel: kind === 'error' ? s.availabilityRetry : spec.emptyAction,
            actionAttribute: 'data-kp-availability-retry',
        });
        plate.classList.add('kp-availability__plate');
        body.append(plate);
        paintSummary(root);
        return;
    }
    if (!grid) {
        grid = el('kp-availability__grid kp-heat');
        body.prepend(grid);
        attachHeats(root);
    }
    const loading = state === 'loading';
    const total = people.length;
    /** @type {Parameters<typeof setHeat>[1]} */
    const heat = {
        state: loading ? 'loading' : 'ready',
        label: root.getAttribute('aria-label') ?? s.availabilityGroup,
        every: 1,
        columns: columns.map((c) => ({ key: c.key, label: c.label, minor: false })),
        skeleton: { rows: Math.max(3, total), columns: Math.max(4, columns.length) },
        summary: {
            key: '__summary',
            label: s.availabilitySummaryLabel,
            cells: columns.map((c) => ({ tone: 'muted', share: 0, label: c.label, tip: '' })),
        },
        rows: people.map((p) => ({
            key: p.id,
            label: p.mine ? s.availabilityYou(p.name) : p.name,
            cells: columns.map((c) => ({ tone: toneOf(st.set.answers[p.id]?.[c.key]), label: wordOf(st.set.answers[p.id]?.[c.key]) })),
        })),
    };
    if (loading) {
        // Names and column labels stay readable; the cells wait under the busy card.
        heat.rows = people.map((p) => ({ key: p.id, label: p.mine ? s.availabilityYou(p.name) : p.name, cells: [] }));
        if (heat.summary) heat.summary.cells = [];
    }
    setHeat(grid, heat);
    grid.setAttribute('data-kp-heat-owned', '');
    // Column subs: a second line in the axis, once.
    for (const head_ of grid.querySelectorAll('.kp-heat__col')) {
        const key = head_.getAttribute('data-col-key') ?? '';
        const col = columns.find((c) => c.key === key);
        head_.replaceChildren();
        const l = el('kp-availability__col-label', 'span');
        l.textContent = col?.label ?? '';
        head_.append(l);
        if (col?.sub) {
            const sub = el('kp-availability__col-sub', 'span');
            sub.textContent = col.sub;
            head_.append(sub);
        }
        if ((attr(root, 'locked', '') || '').split(/[\s,]+/).includes(key)) head_.setAttribute('data-kp-availability-closed', '');
        else head_.removeAttribute('data-kp-availability-closed');
    }
    if (!loading) {
        for (const cell of /** @type {NodeListOf<HTMLElement>} */ (
            grid.querySelectorAll('.kp-heat__row:not(.kp-heat__row--summary):not(.kp-heat__axis) .kp-heat__cell[data-col-key]')
        ))
            paintCell(root, cell);
        for (const row of grid.querySelectorAll('.kp-heat__row[data-row-key]:not(.kp-heat__row--summary)')) {
            row.toggleAttribute('data-kp-availability-mine', Boolean(people.find((p) => p.id === row.getAttribute('data-row-key'))?.mine));
        }
    }
    grid.toggleAttribute('data-kp-availability-fill', attr(root, 'summary', 'both') !== 'count');
    grid.toggleAttribute('data-kp-availability-number', attr(root, 'summary', 'both') !== 'bar');
    paintSummary(root);
    root.toggleAttribute('data-kp-availability-nobody', total > 0 && people.every((p) => Object.keys(st.set.answers[p.id] ?? {}).length === 0));
    // The by-column list for a phone; while loading its rows wait under the busy card (the grid is hidden in that mode).
    const byColumn = attr(root, 'narrow', 'scroll') === 'by-column';
    if (byColumn) body.append(columnsList(root, people, loading));
    syncListCard(root, body, loading && byColumn);
    requestAnimationFrame(() => {
        if (!grid || !grid.isConnected || loading) return;
        // On a phone with a list per column the grid is hidden: the list is the footprint.
        const list = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-availability__columns'));
        const high = grid.offsetHeight > 0 ? grid.offsetHeight : (list?.offsetHeight ?? 0);
        if (high > 0) body.style.setProperty('--kp-availability-body-min', `${Math.round(high)}px`);
    });
    const reason = root.getAttribute('data-kp-disabled-reason');
    if (root.hasAttribute('data-kp-availability-disabled') && reason) grid.setAttribute('data-kp-disabled-reason-text', reason);
    else grid.removeAttribute('data-kp-disabled-reason-text');
    const wanted = root.getAttribute('data-kp-heat-edit') === 'off' || root.hasAttribute('data-kp-availability-disabled');
    root.toggleAttribute('data-kp-availability-readonly', wanted);
    const why = /** @type {HTMLElement | null} */ (root.querySelector('.kp-availability__why'));
    if (why && root.hasAttribute('data-kp-availability-disabled'))
        why.textContent = root.getAttribute('data-kp-disabled-reason') ?? s.availabilityDisabled;
    else if (why && why.getAttribute('data-kp-reason') !== null) why.textContent = '';
    why?.toggleAttribute('data-kp-reason', root.hasAttribute('data-kp-availability-disabled'));
    // Remembered scroll.
    const mem = memoryFor(root, 'availability');
    const at = mem?.read('scroll', null);
    if (typeof at === 'number') grid.scrollLeft = at;
}
