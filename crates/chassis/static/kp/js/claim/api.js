// The functions a page calls to set the viewer, the people, the filter and a claim.
import { getChecklistItems, setChecklistItems } from '../checklist.js';
import { decorate } from './decorate.js';
import { claimPeople, stateOf } from './model.js';
/** @typedef {import('./types.js').ClaimInfo} ClaimInfo */
/** @typedef {import('./types.js').ClaimPerson} ClaimPerson */

/**
 * Say who is looking. Their button is the live one, their name the held face.
 * @param {Element} list @param {ClaimPerson | null} viewer
 */
export function setClaimViewer(list, viewer) {
    if (!(list instanceof HTMLElement)) return;
    stateOf(list).viewer = viewer ? claimPeople(viewer)[0] : null;
    decorate(list);
}

/**
 * Give the assign menu its people (the viewer is added first when missing).
 * @param {Element} list @param {ClaimPerson[]} people
 */
export function setClaimPeople(list, people) {
    if (!(list instanceof HTMLElement)) return;
    stateOf(list).people = claimPeople(people);
    decorate(list);
}

/** The filter now shown. @param {Element} list */
export function claimFilter(list) {
    return stateOf(list).filter;
}

/**
 * A push update: the item's claim as the server says it now, without an event.
 * @param {Element} list @param {string} id @param {ClaimInfo} claim
 */
export function setClaim(list, id, claim) {
    if (!(list instanceof HTMLElement)) return;
    setChecklistItems(
        list,
        getChecklistItems(list).map((i) => (i.id === id ? { ...i, claim: { ...claim, by: claimPeople(claim.by) } } : i)),
    );
}
