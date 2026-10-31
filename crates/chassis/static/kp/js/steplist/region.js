// The list's status region: made on first need, right after the list, and the messages said through it.

import { FRESH_REGION_DELAY } from './values.js';
import { span } from './dom.js';

/** The messages of one region that wait for their turn: a burst in one tick is one message. */
class StepRegion {
    /** @param {HTMLElement} element */
    constructor(element) {
        this.element = element;
        /** The messages waiting to be announced, or null when nothing is waiting. @type {string[] | null} */
        this.queue = null;
    }

    /** @param {string} message @param {boolean} fresh whether the region was made just now */
    say(message, fresh) {
        if (this.queue) {
            this.queue.push(message);
            return;
        }
        this.queue = [message];
        // A region put in the page and written to in the same breath is often not
        // read; one made just now waits a moment.
        setTimeout(() => this.flush(), fresh ? FRESH_REGION_DELAY : 0);
    }

    flush() {
        this.element.textContent = (this.queue ?? []).join('. ');
        this.queue = null;
    }
}

/** The state of each region. @type {WeakMap<Element, StepRegion>} */
const regions = new WeakMap();

/**
 * The list's status region, made on first need (right after the list).
 * @param {Element} list
 * @returns {HTMLElement}
 */
export function regionOf(list) {
    const next = list.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('kp-steplist__live')) return next;
    const region = span('kp-sr-only kp-steplist__live');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    list.after(region);
    return region;
}

/**
 * Say something through the list's region; a burst in one tick is one message.
 * @param {Element} list
 * @param {string} message
 */
export function say(list, message) {
    const fresh = !(list.nextElementSibling?.classList.contains('kp-steplist__live') ?? false);
    const element = regionOf(list);
    let region = regions.get(element);
    if (!region) regions.set(element, (region = new StepRegion(element)));
    region.say(message, fresh);
}
