// Builds one claim row: its words, its cell, its button and its content.
import { getStrings } from '../strings.js';
import { getChecklistItems } from '../checklist.js';
import { setIdmark } from '../idmark.js';
import { setMenu, attachMenuButtons } from '../menu-button.js';
import { attr, byOf, el, stateOf } from './model.js';
/** @typedef {import('./types.js').ClaimInfo} ClaimInfo */
/** @typedef {import('./types.js').ClaimPerson} ClaimPerson */

/** @param {HTMLElement} list */
export const mode = (list) => (attr(list, 'mode', 'claim') === 'assign' ? 'assign' : 'claim');

/** Whether this person is one of those who bring the item. @param {ClaimPerson | null} person @param {ClaimPerson[]} by */
export const among = (person, by) => person !== null && by.some((p) => p.id === person.id);

/** Words for a list of names: "Tom", "Tom and Anna", "Tom, Anna and Bo". @param {string[]} names */
export function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} ${getStrings().claimAnd} ${names[names.length - 1]}`;
}

/** Why a row cannot be pressed now, or null. @param {HTMLElement} list @param {{ claim?: ClaimInfo }} item @param {ClaimPerson[]} by */
export function whyOff(list, item, by) {
    const s = getStrings();
    const st = stateOf(list);
    if (list.hasAttribute('data-kp-claim-disabled')) return list.getAttribute('data-kp-claim-disabled-reason') ?? s.claimDisabled;
    if (item.claim?.locked) return item.claim.locked;
    if (!st.viewer && mode(list) === 'claim') return s.claimNoViewer;
    const max = Number(attr(list, 'max', '0')) || 0;
    if (max > 0 && by.length >= max && !among(st.viewer, by) && mode(list) === 'claim') return s.claimFullReason(max);
    return null;
}

/** Build the cell of one row, once. @param {HTMLElement} list @param {HTMLElement} row */
function cellFor(list, row) {
    let cell = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-claim'));
    if (cell) return cell;
    cell = el('kp-claim');
    const people = el('kp-claim__people');
    const control = el('kp-claim__control');
    cell.append(people, control);
    row.append(cell);
    return cell;
}

/** The button with its three faces in one grid cell. @param {HTMLElement} list */
function buildButton(list) {
    const s = getStrings();
    const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-claim__button', 'button'));
    button.type = 'button';
    button.setAttribute('data-kp-claim-action', '');
    const take = el('kp-claim__face kp-claim__face--take', 'span');
    take.textContent = attr(list, 'self-label', s.claimTake);
    const held = el('kp-claim__face kp-claim__face--held', 'span');
    held.textContent = s.claimHeld;
    const busy = el('kp-claim__face kp-claim__face--busy', 'span');
    const spin = el('kp-spinner', 'span');
    busy.append(spin);
    button.append(take, held, busy);
    return button;
}

/** Fill one row's cell from its item. @param {HTMLElement} list @param {HTMLElement} row @param {ReturnType<typeof getChecklistItems>[number]} item */
export function fillRow(list, row, item) {
    const s = getStrings();
    const st = stateOf(list);
    const cell = cellFor(list, row);
    const by = byOf(item);
    const assign = mode(list) === 'assign';
    const loud = attr(list, 'gap', 'loud') !== 'quiet';
    const person = attr(list, 'person', 'both');
    const busy = st.busy.has(item.id);
    row.toggleAttribute('data-kp-claim-gap', by.length === 0);
    row.toggleAttribute('data-kp-claim-loud', by.length === 0 && loud);
    row.toggleAttribute('data-kp-claim-mine', among(st.viewer, by));
    row.toggleAttribute('data-kp-claim-refused', st.refused.has(item.id));
    row.toggleAttribute('data-kp-claim-busy', busy);

    // The people (or the gap).
    const people = /** @type {HTMLElement} */ (cell.querySelector('.kp-claim__people'));
    const signature = `${by.map((p) => `${p.id}:${p.name}`).join('|')}|${person}|${by.length === 0 ? (loud ? 'L' : 'Q') : ''}`;
    if (people.getAttribute('data-sig') !== signature) {
        people.setAttribute('data-sig', signature);
        people.replaceChildren();
        if (by.length === 0) {
            const gap = el('kp-claim__gap');
            const glyph = el('kp-claim__glyph', 'span');
            glyph.setAttribute('aria-hidden', 'true');
            const words = el('kp-claim__nobody', 'span');
            words.textContent = s.claimNobody;
            gap.append(glyph, words);
            people.append(gap);
        } else {
            for (const p of by) {
                const chip = el('kp-claim__person', 'span');
                if (person !== 'name') {
                    const mark = el('kp-idmark kp-idmark--sm kp-idmark--round', 'span');
                    setIdmark(mark, p.name);
                    chip.append(mark);
                }
                if (person !== 'idmark') {
                    const name = el('kp-claim__name', 'span');
                    name.textContent = p.name;
                    chip.append(name);
                } else {
                    chip.classList.add('kp-claim__person--mark');
                    const sr = el('kp-sr-only', 'span');
                    sr.textContent = p.name;
                    chip.append(sr);
                }
                people.append(chip);
            }
        }
    }
    people.setAttribute('role', 'group');
    people.setAttribute('aria-label', by.length ? s.claimBy(joinNames(by.map((p) => p.name))) : s.claimNobodyLabel);

    // The control.
    const control = /** @type {HTMLElement} */ (cell.querySelector('.kp-claim__control'));
    const off = whyOff(list, item, by);
    if (!assign) {
        let button = /** @type {HTMLButtonElement | null} */ (control.querySelector('.kp-claim__button'));
        if (!button) {
            button = buildButton(list);
            control.replaceChildren(button);
        }
        const mine = among(st.viewer, by);
        const takeFace = button.querySelector('.kp-claim__face--take');
        if (takeFace && takeFace.textContent !== attr(list, 'self-label', s.claimTake)) takeFace.textContent = attr(list, 'self-label', s.claimTake);
        button.setAttribute('data-kp-claim-face', busy ? 'busy' : mine ? 'held' : 'take');
        button.setAttribute('aria-pressed', String(mine));
        button.setAttribute('aria-label', mine ? s.claimHeldLabel(item.label) : s.claimTakeLabel(item.label));
        button.classList.toggle('kp-button--primary', !mine && by.length === 0);
        button.toggleAttribute('aria-busy', busy);
        const blocked = off !== null || busy;
        button.disabled = blocked && off !== null;
        button.setAttribute('aria-disabled', String(blocked));
        if (off !== null) button.setAttribute('data-kp-disabled-reason', off);
        else button.removeAttribute('data-kp-disabled-reason');
    } else {
        let wrapper = /** @type {HTMLElement | null} */ (control.querySelector('.kp-menu-button'));
        if (!wrapper) {
            wrapper = el('kp-menu-button kp-claim__assign');
            wrapper.setAttribute('data-kp-menu-button', '');
            const open = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
            open.type = 'button';
            const menu = el('kp-menu kp-menu--rich');
            menu.setAttribute('role', 'menu');
            wrapper.append(open, menu);
            control.replaceChildren(wrapper);
            attachMenuButtons(control);
        }
        wrapper.setAttribute('data-kp-key', item.id);
        const open = /** @type {HTMLButtonElement} */ (wrapper.querySelector(':scope > button'));
        open.textContent = s.claimAssign;
        open.setAttribute('aria-label', s.claimAssignOf(item.label));
        open.disabled = off !== null;
        if (off !== null) open.setAttribute('data-kp-disabled-reason', off);
        else open.removeAttribute('data-kp-disabled-reason');
        const everyone = [...st.people];
        for (const p of by) if (!everyone.some((q) => q.id === p.id)) everyone.push(p);
        setMenu(wrapper, [
            {
                group: s.claimAssignHeading,
                items: everyone.map((p) => ({ label: p.name, hint: among(p, by) ? s.claimAssigned : s.claimNotAssigned, value: p.id })),
            },
        ]);
    }
}
