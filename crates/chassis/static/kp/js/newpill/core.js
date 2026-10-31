// One live list's state and where it looks: the options it read, the pill, what is following and what is unseen, and the scroll position.

import { Controller } from '../controller.js';
import { buildPill } from './parts.js';
import { placementOf, readNewPillOptions } from './options.js';

/** @typedef {import('../newpill.js').NewPillOptions} NewPillOptions */

export class NewPillCore extends Controller {
    /**
     * @param {HTMLElement} host the scroller
     * @param {NewPillOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.view = this.doc.defaultView;
        this.pillOptions = options;
        this.read = readNewPillOptions(host, options);
        this.strings = this.read.strings;
        this.head = this.read.head;
        const { pill, number, back, live } = buildPill(this.doc, this.placementNow());
        this.pill = pill;
        this.number = number;
        this.back = back;
        this.live = live;
        this.following = true;
        this.paused = false;
        /** The rows that came while the reader was elsewhere. @type {Set<Element>} */
        this.unseen = new Set();
        /** Whether the scroll in progress is our own, so it does not read as the reader leaving. */
        this.programmatic = false;
        /** In `tbody` mode: the keys of the rows already seen, so a sort or a filter that re-adds them counts none. @type {Set<string>} */
        this.known = new Set();
        this.lastSaid = 0;
        /** @type {number | undefined} */
        this.sayLater = undefined;
    }

    /** Set whether the list follows its end and whether the reader paused it. @param {boolean} following @param {boolean} paused */
    setFollowing(following, paused) {
        this.following = following;
        this.paused = paused;
    }

    /** The pill's end, read from the page's options and the attribute. */
    placementNow() {
        return placementOf(this.host, this.pillOptions, this.head);
    }

    /** How many unseen rows are still shown. */
    count() {
        return [...this.unseen].filter((row) => row.isConnected && !(/** @type {HTMLElement} */ (row).hidden) && !row.closest('[hidden]')).length;
    }

    atEnd() {
        const el = this.host;
        return this.head ? el.scrollTop <= this.read.threshold : el.scrollHeight - el.clientHeight - el.scrollTop <= this.read.threshold;
    }

    /** Scroll to the end the rows arrive at, without it reading as the reader leaving. */
    toEnd() {
        const { view } = this;
        this.programmatic = true;
        this.host.scrollTop = this.head ? 0 : this.host.scrollHeight;
        view?.requestAnimationFrame(() => view.requestAnimationFrame(() => (this.programmatic = false)));
    }

    /** The buttons that pause and resume this list. */
    toggles() {
        const { id } = this.host;
        return /** @type {HTMLElement[]} */ (id ? [...this.doc.querySelectorAll(`[data-kp-follow-toggle="${id}"]`)] : []);
    }

    /** Whether the list is following and not paused. */
    isFollowing() {
        return this.following && !this.paused;
    }
}
