// A group of marks with an exact "+N" for the people left out, which is a button that opens the list of their names.

import { getStrings } from '../strings.js';
import { setIdmark } from './draw.js';
import { idmarkColours } from './mark.js';
import { IdmarkMoreList } from './more-list.js';

/** How many marks a group shows unless the page says. */
const DEFAULT_MAX = 4;

/**
 * One person's mark in a group, drawn as an image called by the name.
 * @param {Document} doc @param {import('../idmark.js').IdmarkPerson} person
 * @param {{ size: string, round: boolean, colours: Map<string, number> }} look
 */
function groupMark(doc, person, { size, round, colours }) {
    const mark = doc.createElement('span');
    mark.className = ['kp-idmark', size === 'md' ? '' : `kp-idmark--${size}`, round ? 'kp-idmark--round' : ''].filter(Boolean).join(' ');
    mark.setAttribute('data-kp-idmark', person.name);
    if (person.src) mark.setAttribute('data-kp-idmark-src', person.src);
    if (person.status && person.status !== 'none') mark.setAttribute('data-kp-idmark-status', person.status);
    mark.setAttribute('data-kp-idmark-alt', 'name');
    setIdmark(mark, person.name, { slot: colours.get(person.name.trim()) });
    return mark;
}

/**
 * The "+N" as a plain count, its title naming the people left out.
 * @param {Document} doc @param {readonly import('../idmark.js').IdmarkPerson[]} rest
 */
function plainMore(doc, rest) {
    const more = doc.createElement('span');
    more.className = 'kp-idmark-group__more';
    more.textContent = `+${rest.length}`;
    more.title = rest.map((person) => person.name).join(', ');
    return more;
}

/**
 * Draw a group of marks with an exact "+N" for the people left out. The "+N" is
 * a button that opens the list of their names (`list: false` leaves it a plain
 * count). Counts are the real number, never "9+".
 * @param {HTMLElement} el the group, a `.kp-idmark-group`
 * @param {readonly import('../idmark.js').IdmarkPerson[]} people
 * @param {{ max?: number, size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl', round?: boolean, list?: boolean }} [options]
 *   `max` marks shown (default 4); `size` the marks' size (default md); `round` round marks (default true)
 */
export function setIdmarkGroup(el, people, { max = DEFAULT_MAX, size = 'md', round = true, list = true } = {}) {
    const doc = el.ownerDocument;
    el.classList.add('kp-idmark-group');
    el.classList.toggle('kp-idmark-group--sm', size === 'sm' || size === 'xs');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', getStrings().idmarkGroup(people.length));
    const shown = people.slice(0, Math.max(0, max));
    const rest = people.slice(shown.length);
    const look = { size, round, colours: idmarkColours(people.map((person) => person.name)) };
    const marks = shown.map((person) => groupMark(doc, person, look));
    /** @type {HTMLElement[]} */
    let tail = [];
    if (rest.length > 0) tail = list ? new IdmarkMoreList(doc, rest, look).build() : [plainMore(doc, rest)];
    el.replaceChildren(...marks, ...tail);
}
