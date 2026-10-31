// Sends a claim to the page, refuses it, announces it and offers the undo.
import { getStrings } from '../strings.js';
import { getChecklistItems } from '../checklist.js';
import { undoToast } from '../undo-toast.js';
import { CLAIM_EVENT, CLAIM_REFUSED_MS, CLAIM_UNDO_MS } from './constants.js';
import { decorate } from './decorate.js';
import { attr, byOf, claimPeople, el, itemOf, say, stateOf, write } from './model.js';
import { among, joinNames, whyOff } from './rows.js';
/** @typedef {import('./types.js').ClaimDetail} ClaimDetail */
/** @typedef {import('./types.js').ClaimPerson} ClaimPerson */

/** Show a row's refusal for a while. @param {HTMLElement} list @param {string} id */
function flashRefused(list, id) {
    const st = stateOf(list);
    clearTimeout(st.refused.get(id));
    st.refused.set(
        id,
        window.setTimeout(() => {
            st.refused.delete(id);
            decorate(list);
        }, CLAIM_REFUSED_MS),
    );
}

/**
 * Ask for a change: the page hears it, may settle it with a promise, and the row ends up as the answer says.
 * @param {HTMLElement} list @param {string} id @param {ClaimDetail['action']} action @param {ClaimPerson | null} person
 * @param {{ undo?: boolean }} [options]
 */
export async function request(list, id, action, person, { undo = true } = {}) {
    const s = getStrings();
    const st = stateOf(list);
    const item = itemOf(list, id);
    if (!item || st.busy.has(id)) return;
    const previousBy = byOf(item);
    const joining = action === 'join' || action === 'assign';
    const by = joining
        ? person && !among(person, previousBy)
            ? [...previousBy, person]
            : previousBy
        : previousBy.filter((p) => p.id !== person?.id);
    if (by.length === previousBy.length && by.every((p, i) => p.id === previousBy[i]?.id)) return;
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const detail = {
        id,
        action,
        person,
        by,
        previousBy,
        items: getChecklistItems(list),
        settle: (/** @type {Promise<unknown>} */ answer) => void (waiting = answer),
    };
    const go = list.dispatchEvent(new CustomEvent(CLAIM_EVENT, { bubbles: true, cancelable: true, detail }));
    if (!go) {
        refuse(list, item, previousBy, s.claimNotSaved);
        return;
    }
    if (waiting) {
        st.busy.add(id);
        decorate(list);
        /** @type {unknown} */
        let answer;
        try {
            answer = await waiting;
        } catch {
            answer = false;
        }
        st.busy.delete(id);
        const refused = answer === false || (typeof answer === 'object' && answer !== null && /** @type {any} */ (answer).refused === true);
        if (refused) {
            const winners =
                typeof answer === 'object' && answer !== null && /** @type {any} */ (answer).by
                    ? claimPeople(/** @type {any} */ (answer).by)
                    : previousBy;
            const error = typeof answer === 'object' && answer !== null ? /** @type {any} */ (answer).error : undefined;
            const other = winners.find((p) => !among(person, [p]));
            refuse(list, item, winners, error ?? (joining && other ? s.claimLost(other.name, item.label) : s.claimNotSaved));
            return;
        }
    }
    write(list, id, by);
    announce(list, item.label, by, joining, person);
    if (!joining && undo) offerUndo(list, item, previousBy, person);
}

/** @param {HTMLElement} list @param {{ id: string, label: string }} item @param {ClaimPerson[]} by @param {string} why */
function refuse(list, item, by, why) {
    write(list, item.id, by);
    flashRefused(list, item.id);
    decorate(list);
    say(list, why);
    const line = /** @type {HTMLElement | null} */ (list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(item.id)}"] .kp-claim__why`));
    line?.remove();
    const row = list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(item.id)}"]`);
    const cell = row?.querySelector('.kp-claim');
    if (cell) {
        const note = el('kp-claim__why', 'span');
        note.textContent = why;
        cell.append(note);
        setTimeout(() => note.remove(), CLAIM_REFUSED_MS);
    }
}

/** @param {HTMLElement} list @param {string} label @param {ClaimPerson[]} by @param {boolean} joining @param {ClaimPerson | null} person */
function announce(list, label, by, joining, person) {
    const s = getStrings();
    if (list.getAttribute('data-kp-announce') === 'off') return;
    say(list, by.length ? s.claimAnnounce(label, joinNames(by.map((p) => p.name))) : s.claimAnnounceNobody(label));
    void joining;
    void person;
}

/** @param {HTMLElement} list @param {{ id: string, label: string }} item @param {ClaimPerson[]} previousBy @param {ClaimPerson | null} person */
function offerUndo(list, item, previousBy, person) {
    const s = getStrings();
    const ms = Number(attr(list, 'undo-ms', String(CLAIM_UNDO_MS)));
    if (!(ms > 0)) return;
    const mine = among(stateOf(list).viewer, [person ?? { id: '', name: '' }]);
    undoToast(mine ? s.claimReleased(item.label) : s.claimUnassigned(person?.name ?? '', item.label), {
        mode: 'revert',
        ms,
        undo: () => {
            if (person) void request(list, item.id, 'assign', person, { undo: false });
            else write(list, item.id, previousBy);
        },
    });
}

/** @param {HTMLElement} list @param {HTMLElement} row */
export function press(list, row) {
    const st = stateOf(list);
    const id = row.getAttribute('data-id') ?? '';
    const item = itemOf(list, id);
    if (!item || !st.viewer || whyOff(list, item, byOf(item)) !== null) return;
    const mine = among(st.viewer, byOf(item));
    void request(list, id, mine ? 'leave' : 'join', st.viewer);
}
