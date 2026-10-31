// The functions a page calls to set the spec and read or set an answer.
import { getStrings } from '../strings.js';
import { STATE, availabilityBest, el, glyphOf, toneOf, wordOf } from './facts.js';
import { paintCell, paintSummary, render } from './paint.js';
/** @typedef {import('./types.js').AvState} AvState */
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */
/** @typedef {import('./types.js').AvailabilityAnswers} AvailabilityAnswers */
/** @typedef {import('./types.js').AvailabilitySpec} AvailabilitySpec */

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
export function ensureParts(root) {
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
export function paintKeys(root, person, keys) {
    for (const key of keys) {
        const cell = /** @type {HTMLElement | null} */ (
            root.querySelector(`.kp-heat__cell[data-row-key="${CSS.escape(person)}"][data-col-key="${CSS.escape(key)}"]`)
        );
        if (cell) paintCell(root, cell);
    }
    paintSummary(root);
}
