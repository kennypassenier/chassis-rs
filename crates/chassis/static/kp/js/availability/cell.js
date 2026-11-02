// One cell of the availability grid: its face from its answer, and the spoken line.
import { getStrings } from '../strings.js';
import { cellKey, editable, el, glyphOf, stateOf, toneOf, wordOf } from './facts.js';

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
