// A status list's voice: the polite region it speaks in, and what a row's change says.

import { getStrings } from '../strings.js';
import { el, pending, stateWord } from './state.js';

/** @typedef {import('./state.js').StatusState} StatusState */

/** @param {Element} list @param {string} text */
export function sayText(list, text) {
    const region = regionOf(list);
    region.textContent = '';
    window.setTimeout(() => {
        region.textContent = text;
    }, 30);
}

/**
 * The list's status region, made on first need (right after the list).
 * @param {Element} list
 * @returns {HTMLElement}
 */
export function regionOf(list) {
    const next = list.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('kp-statuslist__live')) return next;
    const region = el('kp-sr-only kp-statuslist__live');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    list.after(region);
    return region;
}

/**
 * Say something through the list's region; a burst in one tick is one message.
 * @param {Element} list
 * @param {{ label: string, state: StatusState, detail: string }} entry
 */
export function say(list, entry) {
    const fresh = !(list.nextElementSibling?.classList.contains('kp-statuslist__live') ?? false);
    const region = regionOf(list);
    const queue = pending.get(region);
    if (queue) {
        queue.push(entry);
        return;
    }
    pending.set(region, [entry]);
    // A region put in the page and written to in the same breath is often not read; one made just now waits a moment.
    setTimeout(
        () => {
            const entries = pending.get(region) ?? [];
            pending.delete(region);
            const s = getStrings();
            region.textContent =
                entries.length > 3
                    ? s.statusAnnounceMany(entries.length, entries.filter((e) => e.state === 'failed').length)
                    : entries.map((e) => s.statusAnnounce(e.label, stateWord(e.state), e.detail)).join('. ');
        },
        fresh ? 100 : 0,
    );
}
