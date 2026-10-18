// Who can come: people in the rows, days or periods in the columns [kpadopt6; kp-soft's trip "Datums" tab].
//
// The package's heat grid (js/heat.js) turned into something a person edits: each person sets their own row, a press on
// a cell cycles empty, can, maybe, cannot, and the column everyone can lights up. The grid drawing, the arrow keys, the
// summary row that fills from the bottom, the hover card and the busy card are heat's own; this module adds the three-way
// answer, the "who may change which row" rule, painting a stroke, the best column and the states around it.
//
//   <div class="kp-availability" data-kp-availability data-kp-availability-choose aria-label="Who can come"></div>
//
//   setAvailability(el, {
//       unit: 'range',
//       columns: [{ key: 'jun21', label: 'Sat 21/6', sub: '21 to 23 June' }, …],
//       people: [{ id: 'kenny', name: 'Kenny', mine: true }, { id: 'tom', name: 'Tom' }],
//       answers: { kenny: { jun21: 'yes' }, tom: { jun21: 'no' } },
//   });
//   el.addEventListener('kp-availability-change', (e) => e.detail.settle(api.save(e.detail)));
//
// Kenny, 2026-10-17 ("Allebei, met een schakelaar per reis"): a trip is asked per period (the proposed date ranges, as
// kp-soft has them) or per day, and the organiser switches it per trip. The spec may carry both sets,
// `sets: { range: { columns, answers }, day: { columns, answers } }` with `canSwitchUnit: true`; a segmented switch above
// the grid then fires `kp-availability-unit` and the grid shows the chosen set. A plain `columns` / `answers` pair is a
// single set. `availabilityDays()` and `availabilityRange()` write the column labels in rule 52 (Europe/Brussels).
//
// Options (attributes on the root, each also a key of the spec):
//   data-kp-heat-edit                   `own` (default: a person changes only their own row), `all`, `off`
//   data-kp-availability-answers        `3` (can, maybe, cannot; default) or `2`
//   data-kp-availability-press          `menu` (default: a press opens the answers) or `cycle` (a press steps through them)
//   data-kp-availability-paint          on by default; `false` turns the drag across a row off
//   data-kp-availability-best           `most` (default), `everyone` or `none`
//   data-kp-availability-best-rule      `yes-count` (default) or `no-nobody`: which comes first when columns tie
//   data-kp-availability-window         a number of days: in day mode the best stretch of that many days is marked
//   data-kp-availability-quorum         how many must answer a column before it can be best (default everybody)
//   data-kp-availability-sort           `mine-first` (default), `given`, `answered-first`
//   data-kp-availability-summary        `both` (default), `count` or `bar`
//   data-kp-availability-choose         present: the best column offers "Choose these dates" (`kp-availability-choose`)
//   data-kp-availability-locked         column keys nobody can change any more
//   data-kp-availability-narrow         `scroll` (default) or `by-column` (a list per column on a phone)
//   data-kp-availability-keys           `false` turns the keys off (y, m, n, Backspace on the focused own cell)
//   data-kp-availability-undo-ms        Undo after a stroke (6000, 0 for none)
//   data-kp-availability-unit-switch    `on` or `off`: the organiser's periods/days switch, overriding `canSwitchUnit` of the spec (absent: the spec decides)
//   data-kp-availability-density                     `comfortable` (default) or `compact`
//   data-kp-time-zone                   the zone the day labels are written in (Europe/Brussels)
//   data-kp-disabled-reason             present with `disabled`: every cell is inert and says why
//
// Events (bubbling, on the root): `kp-availability-change` `{ person, keys, answer, previous, answers, settle }`
// (cancelable; `settle(promise)` holds the pressed cells on their spinner, a rejection or `false` puts them back and
// marks them refused for 3000 ms), `kp-availability-choose` `{ keys }`, `kp-availability-unit` `{ unit }`,
// `kp-availability-retry`. Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { attachHeats, setHeat, setHeatPick } from './heat.js';
import { statePlate } from './state-plate.js';
import { registerShortcuts } from './shortcuts.js';
import { undoToast } from './undo-toast.js';
import { memoryFor } from './remember.js';
import { attachDisabledReasons } from './reason.js';

/** The grids this module looks after. */
export const AVAILABILITY = '[data-kp-availability]';
/** Fired when a person's answers change: `{ person, keys, answer, previous, answers, settle }`. */
export const AVAILABILITY_EVENT = 'kp-availability-change';
/** Fired by "Choose these dates": `{ keys }`. */
export const AVAILABILITY_CHOOSE_EVENT = 'kp-availability-choose';
/** Fired when the organiser switches the columns between periods and days: `{ unit }`. */
export const AVAILABILITY_UNIT_EVENT = 'kp-availability-unit';
/** Fired by the Retry of a grid that could not be read. */
export const AVAILABILITY_RETRY_EVENT = 'kp-availability-retry';
/** The answers a cell can hold, in the order a press cycles them. */
export const AVAILABILITY_ANSWERS = Object.freeze(['yes', 'maybe', 'no']);
/** How long a refused cell keeps its mark [ms]. */
export const AVAILABILITY_REFUSED_MS = 3000;
/** How long Undo is offered after a stroke [ms]. */
export const AVAILABILITY_UNDO_MS = 6000;

/** @typedef {'yes' | 'maybe' | 'no'} AvailabilityAnswer */
/** @typedef {{ key: string, label: string, sub?: string }} AvailabilityColumn */
/** @typedef {{ id: string, name: string, mine?: boolean }} AvailabilityPerson */
/** @typedef {Record<string, Record<string, AvailabilityAnswer | undefined>>} AvailabilityAnswers */
/** @typedef {{ columns: AvailabilityColumn[], answers: AvailabilityAnswers }} AvailabilitySet */

/**
 * @typedef {object} AvailabilitySpec
 * @property {'range' | 'day'} [unit]  what a column is (default `range`)
 * @property {AvailabilityColumn[]} [columns]
 * @property {AvailabilityPerson[]} [people]
 * @property {AvailabilityAnswers} [answers]
 * @property {{ range?: AvailabilitySet, day?: AvailabilitySet }} [sets]  both kinds of column, with their answers
 * @property {boolean} [canSwitchUnit]  show the organiser's switch between the two sets (the attribute data-kp-availability-unit-switch on or off overrides it at run time)
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message]  the failed or empty plate's sentence
 * @property {string} [emptyAction]  the empty plate's action words (fires `kp-availability-retry` with `{ action: 'add' }`)
 */

/** @typedef {{ spec: AvailabilitySpec, set: AvailabilitySet, unit: 'range' | 'day', refused: Map<string, number>, saving: Set<string>, off: (() => void)[], menu: HTMLElement | null }} AvState */
/** @type {WeakMap<Element, AvState>} */
const STATE = new WeakMap();

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-availability-${name}`) ?? fallback;

const cellKey = (/** @type {string} */ person, /** @type {string} */ column) => `${person}\u0000${column}`;

/**
 * Day columns in rule 52: `Sat 21/6`, with the long date under it.
 * @param {string} start an ISO date `2026-06-19`
 * @param {number} count
 * @param {string} [zone]
 * @returns {AvailabilityColumn[]}
 */
export function availabilityDays(start, count, zone = 'Europe/Brussels') {
    const first = new Date(`${start}T12:00:00Z`);
    const short = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    void zone;
    return Array.from({ length: count }, (_, i) => {
        const day = new Date(first.getTime() + i * 86400000);
        const key = day.toISOString().slice(0, 10);
        return { key, label: `${short.format(day)} ${day.getUTCDate()}/${day.getUTCMonth() + 1}`, sub: long.format(day) };
    });
}

/**
 * A proposed period as one column: `21 to 23 Jun`, with its length under it.
 * @param {string} start an ISO date @param {string} end an ISO date (the last day, inclusive)
 * @returns {AvailabilityColumn}
 */
export function availabilityRange(start, end) {
    const a = new Date(`${start}T12:00:00Z`);
    const b = new Date(`${end}T12:00:00Z`);
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
    const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    const same = a.getUTCMonth() === b.getUTCMonth();
    return {
        key: `${start}/${end}`,
        label: same
            ? `${a.getUTCDate()} to ${b.getUTCDate()} ${month.format(b)}`
            : `${a.getUTCDate()} ${month.format(a)} to ${b.getUTCDate()} ${month.format(b)}`,
        sub: getStrings().availabilityDaysLong(days),
    };
}

/** @param {AvailabilityAnswer | undefined} a */
const toneOf = (a) => (a === 'yes' ? 'ok' : a === 'maybe' ? 'warn' : a === 'no' ? 'bad' : 'muted');
/** @param {AvailabilityAnswer | undefined} a */
const glyphOf = (a) => (a === 'yes' ? '✓' : a === 'maybe' ? '~' : a === 'no' ? '×' : '');
/** @param {AvailabilityAnswer | undefined} a */
const wordOf = (a) => {
    const s = getStrings();
    return a === 'yes' ? s.availabilityYes : a === 'maybe' ? s.availabilityMaybe : a === 'no' ? s.availabilityNo : s.availabilityNone;
};

/** @param {HTMLElement} root */
const stateOf = (root) => /** @type {AvState} */ (STATE.get(root));

/** The person looking. @param {AvState} st */
const viewerOf = (st) => (st.spec.people ?? []).find((p) => p.mine) ?? null;

/** The answers allowed by the root. @param {HTMLElement} root @returns {AvailabilityAnswer[]} */
const allowed = (root) => (attr(root, 'answers', '3') === '2' ? ['yes', 'no'] : ['yes', 'maybe', 'no']);

/** @param {HTMLElement} root */
const editMode = (root) => {
    const v = root.getAttribute('data-kp-heat-edit');
    return v === 'all' || v === 'off' ? v : 'own';
};

/** Whether this person's cell in this column can be changed now. @param {HTMLElement} root @param {string} person @param {string} column */
function editable(root, person, column) {
    const st = stateOf(root);
    if (root.hasAttribute('data-kp-disabled') || root.hasAttribute('data-kp-availability-disabled')) return false;
    if ((attr(root, 'locked', '') || '').split(/[\s,]+/).includes(column)) return false;
    const mode = editMode(root);
    if (mode === 'off') return false;
    if (mode === 'all') return true;
    return viewerOf(st)?.id === person;
}

/** The best column or columns, as keys. @param {HTMLElement} root @returns {string[]} */
export function availabilityBest(root) {
    const st = stateOf(root);
    const mode = attr(root, 'best', 'most');
    const people = st.spec.people ?? [];
    const cols = st.set.columns;
    if (mode === 'none' || people.length === 0 || cols.length === 0) return [];
    const quorum = Math.max(1, Number(attr(root, 'quorum', String(people.length))) || people.length);
    const rule = attr(root, 'best-rule', 'yes-count');
    const tally = cols.map((c) => {
        let yes = 0;
        let maybe = 0;
        let no = 0;
        for (const p of people) {
            const a = st.set.answers[p.id]?.[c.key];
            if (a === 'yes') yes += 1;
            else if (a === 'maybe') maybe += 1;
            else if (a === 'no') no += 1;
        }
        return { key: c.key, yes, maybe, no, answered: yes + maybe + no };
    });
    const locked = (attr(root, 'locked', '') || '').split(/[\s,]+/);
    void locked;
    const window = Number(attr(root, 'window', '0')) || 0;
    if (st.unit === 'day' && window > 1 && cols.length >= window) {
        let best = null;
        for (let i = 0; i + window <= cols.length; i += 1) {
            const part = tally.slice(i, i + window);
            if (part.some((t) => t.answered < quorum)) continue;
            const no = part.reduce((n, t) => n + t.no, 0);
            const yes = part.reduce((n, t) => n + t.yes, 0);
            if (yes === 0) continue;
            const score = rule === 'no-nobody' ? [-no, yes] : [yes, -no];
            if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1]))
                best = { score, keys: part.map((t) => t.key) };
        }
        return best ? best.keys : [];
    }
    const pool = tally.filter((t) => t.answered >= quorum && t.yes > 0 && (mode !== 'everyone' || (t.no === 0 && t.answered === people.length)));
    if (pool.length === 0) return [];
    const score = (/** @type {typeof tally[number]} */ t) => (rule === 'no-nobody' ? [-t.no, t.yes] : [t.yes, -t.no]);
    const top = pool.reduce((a, t) => {
        const x = score(t);
        const y = score(a);
        return x[0] > y[0] || (x[0] === y[0] && x[1] > y[1]) ? t : a;
    }, pool[0]);
    const tops = score(top);
    return pool.filter((t) => score(t)[0] === tops[0] && score(t)[1] === tops[1]).map((t) => t.key);
}

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
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

/** The people in the order the grid shows them. @param {HTMLElement} root */
function ordered(root) {
    const st = stateOf(root);
    const people = [...(st.spec.people ?? [])];
    const sort = attr(root, 'sort', 'mine-first');
    const count = (/** @type {AvailabilityPerson} */ p) => Object.keys(st.set.answers[p.id] ?? {}).length;
    if (sort === 'mine-first') return people.sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)));
    if (sort === 'answered-first') return people.sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)) || count(b) - count(a));
    return people;
}

/** Everything one column says about itself. @param {HTMLElement} root @param {string} key */
function columnFacts(root, key) {
    const st = stateOf(root);
    const people = st.spec.people ?? [];
    /** @type {Record<AvailabilityAnswer, string[]>} */
    const names = { yes: [], maybe: [], no: [] };
    for (const p of people) {
        const a = st.set.answers[p.id]?.[key];
        if (a) names[a].push(p.name);
    }
    const answered = names.yes.length + names.maybe.length + names.no.length;
    return { names, yes: names.yes.length, maybe: names.maybe.length, no: names.no.length, answered, total: people.length };
}

/** The hover card's words for a column. @param {ReturnType<typeof columnFacts>} f */
function tipOf(f) {
    const s = getStrings();
    const part = (/** @type {string} */ word, /** @type {string[]} */ names) => (names.length ? `${word}: ${names.join(', ')}` : '');
    return (
        [part(s.availabilityYes, f.names.yes), part(s.availabilityMaybe, f.names.maybe), part(s.availabilityNo, f.names.no)]
            .filter(Boolean)
            .join('. ') || s.availabilityNobodyAnswered
    );
}

/** Write one cell's face from its answer. @param {HTMLElement} root @param {HTMLElement} cell */
function paintCell(root, cell) {
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
function paintSummary(root) {
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
function render(root) {
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

/** The busy card over a loading by-column list. @type {WeakMap<Element, import('./busy-card.js').BusyCard>} */
const LIST_CARDS = new WeakMap();

/**
 * A loading list per column holds the data table's busy card, centred over the whole list; any other state holds none.
 * @param {HTMLElement} root @param {HTMLElement} body @param {boolean} on
 */
function syncListCard(root, body, on) {
    const card = LIST_CARDS.get(root);
    if (!on) {
        if (card) {
            LIST_CARDS.delete(root);
            card.remove();
        }
        return;
    }
    const list = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-availability__columns'));
    if (!list) return;
    if (card) {
        if (card.layer.parentElement !== body) body.append(card.layer);
        card.place();
        return;
    }
    LIST_CARDS.set(
        root,
        openBusyCard(body, { words: getStrings().heatLoading, area: () => [list], className: 'kp-availability__busy', arrive: false }),
    );
}

/**
 * A list per column, the same data for a narrow screen. `waiting`: the rows stand without answers, for a loading state.
 * @param {HTMLElement} root @param {AvailabilityPerson[]} people @param {boolean} [waiting]
 */
function columnsList(root, people, waiting = false) {
    const st = stateOf(root);
    const s = getStrings();
    const wrap = el('kp-availability__columns');
    if (waiting) {
        wrap.classList.add('kp-availability__columns--waiting');
        wrap.inert = true;
    }
    for (const c of st.set.columns) {
        const f = columnFacts(root, c.key);
        const sec = el('kp-availability__column', 'section');
        sec.setAttribute('data-col-key', c.key);
        const h = el('kp-availability__column-head', 'h4');
        h.textContent = c.sub ? `${c.label}, ${c.sub}` : c.label;
        const sum = el('kp-availability__column-sum', 'span');
        sum.textContent = s.availabilityCount(f.yes, f.total);
        sec.append(h, sum);
        const ul = el('kp-availability__column-list', 'ul');
        for (const p of people) {
            const li = el('kp-availability__column-row', 'li');
            const name = el('kp-availability__column-name', 'span');
            name.textContent = p.mine ? s.availabilityYou(p.name) : p.name;
            li.append(name);
            const a = st.set.answers[p.id]?.[c.key];
            if (editable(root, p.id, c.key)) {
                const group = el('kp-availability__column-answers');
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', s.availabilityCell(p.name, c.label, ''));
                for (const answer of allowed(root)) {
                    const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-availability__pick', 'button'));
                    b.type = 'button';
                    b.setAttribute('data-person', p.id);
                    b.setAttribute('data-column', c.key);
                    b.setAttribute('data-answer', answer);
                    b.setAttribute('aria-pressed', String(a === answer));
                    b.textContent = `${glyphOf(answer)} ${wordOf(answer)}`;
                    group.append(b);
                }
                li.append(group);
            } else {
                const v = el('kp-availability__column-value', 'span');
                v.setAttribute('data-kp-availability-answer', a ?? 'none');
                v.textContent = `${glyphOf(a)} ${wordOf(a)}`.trim();
                li.append(v);
            }
            ul.append(li);
        }
        sec.append(ul);
        wrap.append(sec);
    }
    return wrap;
}

/**
 * Give the grid its people, columns and answers.
 * @param {HTMLElement} root @param {AvailabilitySpec} spec
 */
export function setAvailability(root, spec) {
    if (!(root instanceof HTMLElement)) return;
    ensureParts(root);
    const old = STATE.get(root);
    const unit = spec.unit ?? old?.unit ?? 'range';
    const set = spec.sets
        ? (spec.sets[unit] ?? spec.sets.range ?? spec.sets.day ?? { columns: [], answers: {} })
        : { columns: spec.columns ?? [], answers: spec.answers ?? {} };
    /** @type {AvState} */
    const st = {
        spec: { ...spec },
        set: { columns: set.columns.map((c) => ({ ...c })), answers: structuredClone(set.answers) },
        unit,
        refused: old?.refused ?? new Map(),
        saving: old?.saving ?? new Set(),
        off: old?.off ?? [],
        menu: old?.menu ?? null,
    };
    if (spec.sets) st.spec.sets = structuredClone(spec.sets);
    STATE.set(root, st);
    render(root);
}

/** The answers as they stand. @param {HTMLElement} root @returns {AvailabilityAnswers} */
export function availabilityAnswers(root) {
    return structuredClone(STATE.get(root)?.set.answers ?? {});
}

/**
 * Change one cell as the page (no event): a push update from another person.
 * @param {HTMLElement} root @param {string} person @param {string} column @param {AvailabilityAnswer | null} answer
 */
export function setAvailabilityAnswer(root, person, column, answer) {
    const st = STATE.get(root);
    if (!st) return;
    const row = (st.set.answers[person] ??= {});
    if (answer) row[column] = answer;
    else delete row[column];
    if (st.spec.sets) {
        const target = st.spec.sets[st.unit];
        if (target) target.answers = structuredClone(st.set.answers);
    }
    const before = new Set(availabilityBest(root));
    void before;
    render(root);
}

/** @param {HTMLElement} root */
function ensureParts(root) {
    if (root.querySelector(':scope > .kp-availability__body')) return;
    root.classList.add('kp-availability');
    const head = el('kp-availability__head');
    head.append(el('kp-availability__line'));
    const body = el('kp-availability__body');
    const legend = /** @type {HTMLElement} */ (el('kp-heat__legend kp-availability__legend', 'ul'));
    const s = getStrings();
    for (const a of /** @type {const} */ (['yes', 'maybe', 'no', undefined])) {
        const li = el('', 'li');
        const sw = el('kp-heat__swatch kp-heat__swatch--plate', 'span');
        sw.setAttribute('data-kp-tone', toneOf(a));
        sw.setAttribute('aria-hidden', 'true');
        const g = el('kp-availability__legend-glyph', 'span');
        g.setAttribute('aria-hidden', 'true');
        g.textContent = glyphOf(a);
        const word = el('', 'span');
        word.textContent = wordOf(a);
        li.append(sw, g, word);
        legend.append(li);
    }
    const best = el('', 'li');
    const bsw = el('kp-availability__best-swatch', 'span');
    bsw.setAttribute('aria-hidden', 'true');
    const bw = el('', 'span');
    bw.textContent = s.availabilityBestWord;
    best.append(bsw, bw);
    legend.append(best);
    const foot = el('kp-availability__foot');
    const choose = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--primary kp-availability__choose', 'button'));
    choose.type = 'button';
    choose.hidden = true;
    foot.append(choose, el('kp-availability__why', 'p'));
    root.append(head, body, legend, foot);
    root.setAttribute('role', 'group');
}

/** Give a state to a cell that is waiting for the server or refused. @param {HTMLElement} root @param {string[]} keys @param {string} person */
function paintKeys(root, person, keys) {
    for (const key of keys) {
        const cell = /** @type {HTMLElement | null} */ (
            root.querySelector(`.kp-heat__cell[data-row-key="${CSS.escape(person)}"][data-col-key="${CSS.escape(key)}"]`)
        );
        if (cell) paintCell(root, cell);
    }
    paintSummary(root);
}

/**
 * Ask for a change of one or more cells in one row.
 * @param {HTMLElement} root @param {string} person @param {string[]} keys @param {AvailabilityAnswer | null} answer
 * @param {{ stroke?: boolean }} [options]
 */
async function request(root, person, keys, answer, { stroke = false } = {}) {
    const st = stateOf(root);
    const s = getStrings();
    const row = st.set.answers[person] ?? {};
    /** @type {Record<string, AvailabilityAnswer | undefined>} */
    const previous = {};
    const changing = keys.filter((k) => editable(root, person, k) && row[k] !== (answer ?? undefined));
    if (changing.length === 0) return;
    for (const k of changing) previous[k] = row[k];
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const nextAnswers = structuredClone(st.set.answers);
    for (const k of changing) {
        const r = (nextAnswers[person] ??= {});
        if (answer) r[k] = answer;
        else delete r[k];
    }
    const detail = {
        person,
        keys: changing,
        answer,
        previous,
        answers: nextAnswers,
        settle: (/** @type {Promise<unknown>} */ p) => void (waiting = p),
    };
    const go = root.dispatchEvent(new CustomEvent(AVAILABILITY_EVENT, { bubbles: true, cancelable: true, detail }));
    const label = (/** @type {string[]} */ ks) => ks.map((k) => st.set.columns.find((c) => c.key === k)?.label ?? k).join(', ');
    const refuse = (/** @type {string} */ why) => {
        for (const k of changing) {
            const id = cellKey(person, k);
            window.clearTimeout(st.refused.get(id));
            st.refused.set(
                id,
                window.setTimeout(() => {
                    st.refused.delete(id);
                    paintKeys(root, person, [k]);
                }, AVAILABILITY_REFUSED_MS),
            );
        }
        paintKeys(root, person, changing);
        const line = /** @type {HTMLElement | null} */ (root.querySelector('.kp-availability__why'));
        if (line) {
            line.textContent = why;
            window.setTimeout(() => {
                if (line.textContent === why) line.textContent = '';
            }, AVAILABILITY_REFUSED_MS);
        }
        say(root, why);
    };
    if (!go) return refuse(s.availabilityNotSaved(label(changing)));
    if (waiting) {
        for (const k of changing) st.saving.add(cellKey(person, k));
        paintKeys(root, person, changing);
        /** @type {unknown} */
        let result;
        try {
            result = await waiting;
        } catch {
            result = false;
        }
        for (const k of changing) st.saving.delete(cellKey(person, k));
        if (result === false || (typeof result === 'object' && result !== null && /** @type {any} */ (result).refused === true)) {
            const why = typeof result === 'object' && result !== null ? /** @type {any} */ (result).error : undefined;
            return refuse(why ?? s.availabilityNotSaved(label(changing)));
        }
    }
    const wasComplete = new Set(
        st.set.columns
            .filter((c) => {
                const f = columnFacts(root, c.key);
                return f.total > 0 && f.yes === f.total;
            })
            .map((c) => c.key),
    );
    for (const k of changing) setAvailabilityAnswerQuiet(st, person, k, answer);
    render(root);
    const nowComplete = st.set.columns.filter((c) => {
        const f = columnFacts(root, c.key);
        return f.total > 0 && f.yes === f.total && !wasComplete.has(c.key);
    });
    if (stroke) {
        const mine = Object.values(st.set.answers[person] ?? {});
        say(
            root,
            s.availabilityYourAnswers(
                mine.filter((a) => a === 'yes').length,
                mine.filter((a) => a === 'maybe').length,
                mine.filter((a) => a === 'no').length,
            ),
        );
        const ms = Number(attr(root, 'undo-ms', String(AVAILABILITY_UNDO_MS)));
        if (ms > 0) {
            undoToast(s.availabilityStroke(changing.length), {
                mode: 'revert',
                ms,
                undo: () => {
                    for (const k of changing) setAvailabilityAnswerQuiet(st, person, k, previous[k] ?? null);
                    render(root);
                    root.dispatchEvent(
                        new CustomEvent(AVAILABILITY_EVENT, {
                            bubbles: true,
                            detail: {
                                person,
                                keys: changing,
                                answer: null,
                                previous: {},
                                answers: structuredClone(st.set.answers),
                                restored: true,
                                settle: () => undefined,
                            },
                        }),
                    );
                },
            });
        }
    } else if (nowComplete.length) say(root, s.availabilityEveryone(nowComplete[0].label));
    else
        say(root, s.availabilityCellSaid(st.spec.people?.find((p) => p.id === person)?.name ?? person, label(changing), wordOf(answer ?? undefined)));
    // The focus stays on the cell that was pressed (the grid was redrawn).
    const again = /** @type {HTMLElement | null} */ (
        root.querySelector(`.kp-heat__cell[data-row-key="${CSS.escape(person)}"][data-col-key="${CSS.escape(changing[0])}"]`)
    );
    if (again && !stroke && document.activeElement === document.body) again.focus({ preventScroll: true });
}

/** @param {AvState} st @param {string} person @param {string} key @param {AvailabilityAnswer | null} answer */
function setAvailabilityAnswerQuiet(st, person, key, answer) {
    const row = (st.set.answers[person] ??= {});
    if (answer) row[key] = answer;
    else delete row[key];
    const target = st.spec.sets?.[st.unit];
    if (target) target.answers = structuredClone(st.set.answers);
}

/** The next answer in a press. @param {HTMLElement} root @param {AvailabilityAnswer | undefined} now @returns {AvailabilityAnswer | null} */
function next(root, now) {
    const order = allowed(root);
    if (!now) return order[0];
    const i = order.indexOf(now);
    return i + 1 < order.length ? order[i + 1] : null;
}

/** @param {HTMLElement} root */
function closeMenu(root) {
    const st = STATE.get(root);
    st?.menu?.remove();
    if (st) st.menu = null;
}

/** Open the answers under a cell. @param {HTMLElement} root @param {HTMLElement} cell */
function openMenu(root, cell) {
    closeMenu(root);
    const st = stateOf(root);
    const s = getStrings();
    const person = cell.getAttribute('data-row-key') ?? '';
    const column = cell.getAttribute('data-col-key') ?? '';
    // The package's own menu: the popover surface holding a `.kp-menu` of `.kp-menu__item`s, as the catalogue draws it.
    const menu = el('kp-popover kp-availability__menu');
    const list = el('kp-menu', 'ul');
    list.setAttribute('role', 'menu');
    list.setAttribute(
        'aria-label',
        s.availabilityCell(
            st.spec.people?.find((p) => p.id === person)?.name ?? person,
            st.set.columns.find((c) => c.key === column)?.label ?? column,
            '',
        ),
    );
    const now = st.set.answers[person]?.[column];
    for (const answer of [...allowed(root), null]) {
        const li = el('', 'li');
        li.setAttribute('role', 'none');
        const b = /** @type {HTMLButtonElement} */ (el('kp-menu__item kp-availability__menu-item', 'button'));
        b.type = 'button';
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-checked', String(answer === (now ?? null)));
        b.textContent = answer ? `${glyphOf(answer)} ${wordOf(answer)}` : s.availabilityClear;
        b.addEventListener('click', () => {
            closeMenu(root);
            void request(root, person, [column], answer);
        });
        li.append(b);
        list.append(li);
    }
    menu.append(list);
    root.append(menu);
    const r = cell.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    menu.style.insetInlineStart = `${Math.max(0, r.left - rr.left)}px`;
    menu.style.insetBlockStart = `${r.bottom - rr.top + 4}px`;
    st.menu = menu;
    /** @param {KeyboardEvent} event */
    const key = (event) => {
        const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('button')]);
        const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(root);
            cell.focus();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            items[(i + 1) % items.length].focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            items[(i - 1 + items.length) % items.length].focus();
        }
    };
    menu.addEventListener('keydown', key);
    (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.dispatchEvent(new Event('focus'));
    /** @type {HTMLElement | null} */ (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
    const outside = (/** @type {Event} */ event) => {
        if (event.target instanceof Node && !menu.contains(event.target)) {
            closeMenu(root);
            document.removeEventListener('pointerdown', outside, true);
        }
    };
    document.addEventListener('pointerdown', outside, true);
}

/**
 * Wire every availability grid under `root`: presses, painting, keys, the switch, Choose.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAvailability(root = document) {
    const roots = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(AVAILABILITY) ? [root] : []),
        ...root.querySelectorAll(AVAILABILITY),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el_ of roots) {
        ensureParts(el_);
        if (!STATE.has(el_)) {
            STATE.set(el_, {
                spec: {},
                set: { columns: [], answers: {} },
                unit: 'range',
                refused: new Map(),
                saving: new Set(),
                off: [],
                menu: null,
            });
        }
        const st = stateOf(el_);
        if (st.off.length) continue;
        const stopReasons = attachDisabledReasons(el_);
        /** @type {{ person: string, first: HTMLElement, answer: AvailabilityAnswer | null, keys: Set<string>, pointer: number } | null} */
        let drag = null;
        let suppress = false;
        /** @param {Event} event */
        const cellOf = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            const c = /** @type {HTMLElement | null} */ (t?.closest('.kp-availability__grid .kp-heat__cell[data-col-key]') ?? null);
            return c && !c.closest('.kp-heat__row--summary') ? c : null;
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            if (suppress) {
                suppress = false;
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            const retry = target.closest('[data-kp-availability-retry]');
            if (retry) {
                el_.dispatchEvent(
                    new CustomEvent(AVAILABILITY_RETRY_EVENT, {
                        bubbles: true,
                        detail: { action: stateOf(el_).spec.state === 'empty' ? 'add' : 'retry' },
                    }),
                );
                return;
            }
            const unit = target.closest('.kp-availability__unit [data-value]');
            if (unit) {
                const value = unit.getAttribute('data-value') === 'day' ? 'day' : 'range';
                if (value === stateOf(el_).unit) return;
                const s2 = stateOf(el_);
                setAvailability(el_, { ...s2.spec, unit: value });
                el_.dispatchEvent(new CustomEvent(AVAILABILITY_UNIT_EVENT, { bubbles: true, detail: { unit: value } }));
                return;
            }
            if (target.closest('.kp-availability__choose')) {
                el_.dispatchEvent(new CustomEvent(AVAILABILITY_CHOOSE_EVENT, { bubbles: true, detail: { keys: availabilityBest(el_) } }));
                return;
            }
            const pick = target.closest('.kp-availability__pick');
            if (pick instanceof HTMLElement) {
                const answer = /** @type {AvailabilityAnswer} */ (pick.getAttribute('data-answer'));
                const was = stateOf(el_).set.answers[pick.getAttribute('data-person') ?? '']?.[pick.getAttribute('data-column') ?? ''];
                void request(el_, pick.getAttribute('data-person') ?? '', [pick.getAttribute('data-column') ?? ''], was === answer ? null : answer);
                return;
            }
            const colHead = target.closest('.kp-availability__grid .kp-heat__col');
            if (colHead) {
                const key = colHead.getAttribute('data-col-key');
                const grid = /** @type {HTMLElement} */ (el_.querySelector('.kp-availability__grid'));
                if (key) setHeatPick(grid, grid.getAttribute('data-kp-heat-picked') === key ? null : key);
                return;
            }
            const cell = cellOf(event);
            if (!cell) return;
            event.stopPropagation();
            const person = cell.getAttribute('data-row-key') ?? '';
            const column = cell.getAttribute('data-col-key') ?? '';
            if (!editable(el_, person, column)) return;
            if (attr(el_, 'press', 'menu') === 'menu') return openMenu(el_, cell);
            void request(el_, person, [column], next(el_, stateOf(el_).set.answers[person]?.[column]));
        };
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            if (event.button !== 0 || event.pointerType === 'touch' || attr(el_, 'paint', 'on') === 'false' || attr(el_, 'press', 'menu') === 'menu')
                return;
            const cell = cellOf(event);
            if (!cell) return;
            const person = cell.getAttribute('data-row-key') ?? '';
            const column = cell.getAttribute('data-col-key') ?? '';
            if (!editable(el_, person, column)) return;
            drag = {
                person,
                first: cell,
                answer: next(el_, stateOf(el_).set.answers[person]?.[column]),
                keys: new Set([column]),
                pointer: event.pointerId,
            };
        };
        /** @param {PointerEvent} event */
        const onMove = (event) => {
            if (!drag || event.buttons !== 1) return;
            const under = document.elementFromPoint(event.clientX, event.clientY);
            const cell = /** @type {HTMLElement | null} */ (under?.closest('.kp-availability__grid .kp-heat__cell[data-col-key]') ?? null);
            if (!cell || cell.getAttribute('data-row-key') !== drag.person) return;
            const column = cell.getAttribute('data-col-key') ?? '';
            if (drag.keys.has(column) || !editable(el_, drag.person, column)) return;
            drag.keys.add(column);
            cell.setAttribute('data-kp-availability-painting', '');
            drag.first.setAttribute('data-kp-availability-painting', '');
        };
        const onUp = () => {
            const d = drag;
            drag = null;
            for (const c of el_.querySelectorAll('[data-kp-availability-painting]')) c.removeAttribute('data-kp-availability-painting');
            if (!d || d.keys.size < 2) return;
            suppress = true;
            setTimeout(() => (suppress = false), 0);
            void request(el_, d.person, [...d.keys], d.answer, { stroke: true });
        };
        /** @param {Event} event */
        const onScroll = (event) => {
            const t = event.target;
            if (t instanceof HTMLElement && t.classList.contains('kp-availability__grid'))
                memoryFor(el_, 'availability')?.write('scroll', t.scrollLeft);
        };
        el_.addEventListener('click', onClick, true);
        el_.addEventListener('pointerdown', onDown);
        el_.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        el_.addEventListener('scroll', onScroll, true);
        /** @type {(() => void) | undefined} */
        let stopKeys;
        if (el_.getAttribute('data-kp-availability-keys') !== 'false') {
            const s = getStrings();
            const focused = () =>
                /** @type {HTMLElement | null} */ (
                    document.activeElement instanceof HTMLElement
                        ? document.activeElement.closest('.kp-availability__grid .kp-heat__cell[data-col-key]')
                        : null
                );
            const ownFocused = () => {
                const c = focused();
                return c !== null && el_.contains(c) && editable(el_, c.getAttribute('data-row-key') ?? '', c.getAttribute('data-col-key') ?? '');
            };
            /** @param {AvailabilityAnswer | null} answer */
            const set = (answer) => () => {
                const c = focused();
                if (c) void request(el_, c.getAttribute('data-row-key') ?? '', [c.getAttribute('data-col-key') ?? ''], answer);
            };
            stopKeys = registerShortcuts(
                el_,
                [
                    {
                        keys: 'y',
                        what: s.availabilityKeyYes,
                        group: s.availabilityKeyGroup,
                        when: ownFocused,
                        reason: s.availabilityKeyReason,
                        run: set('yes'),
                    },
                    {
                        keys: 'm',
                        what: s.availabilityKeyMaybe,
                        group: s.availabilityKeyGroup,
                        when: () => ownFocused() && allowed(el_).includes('maybe'),
                        reason: s.availabilityKeyReason,
                        run: set('maybe'),
                    },
                    {
                        keys: 'n',
                        what: s.availabilityKeyNo,
                        group: s.availabilityKeyGroup,
                        when: ownFocused,
                        reason: s.availabilityKeyReason,
                        run: set('no'),
                    },
                    {
                        keys: 'Backspace',
                        what: s.availabilityKeyClear,
                        group: s.availabilityKeyGroup,
                        when: ownFocused,
                        reason: s.availabilityKeyReason,
                        run: set(null),
                    },
                ],
                { layoutGuard: 'off' },
            );
        }
        const stopHeat = attachHeats(el_);
        // Every option is live: change the attribute and the grid is drawn again.
        const watcher = new MutationObserver(() => render(el_));
        watcher.observe(el_, {
            attributes: true,
            attributeFilter: [
                'data-kp-heat-edit',
                'data-kp-disabled-reason',
                ...[
                    'answers',
                    'press',
                    'best',
                    'best-rule',
                    'window',
                    'quorum',
                    'sort',
                    'summary',
                    'locked',
                    'narrow',
                    'density',
                    'disabled',
                    'choose',
                    'unit-switch',
                ].map((n) => `data-kp-availability-${n}`),
            ],
        });
        st.off = [
            () => el_.removeEventListener('click', onClick, true),
            () => el_.removeEventListener('pointerdown', onDown),
            () => el_.removeEventListener('pointermove', onMove),
            () => document.removeEventListener('pointerup', onUp),
            () => el_.removeEventListener('scroll', onScroll, true),
            () => stopKeys?.(),
            stopHeat,
            () => watcher.disconnect(),
            stopReasons,
        ];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
        render(el_);
    }
    return () => undo.forEach((u) => u());
}
