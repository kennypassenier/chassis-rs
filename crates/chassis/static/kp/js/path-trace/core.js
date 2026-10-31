// One trace's state: the hops, which state it is in, the message of an error, the busy card and the height kept between states.

import { Controller } from '../controller.js';
import { openBusyCard } from '../busy-card.js';
import { getStrings } from '../strings.js';

/** @typedef {import('../path-trace.js').TraceHop} TraceHop */
/** @typedef {'ready' | 'running' | 'empty' | 'error'} TraceState */

export class TraceCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.summary = this.made('p', 'kp-trace__summary');
        this.stage = this.made('div', 'kp-trace__stage');
        this.foot = this.made('div', 'kp-trace__foot');
        /** @type {readonly TraceHop[]} */
        this.hops = [];
        /** @type {TraceState} */
        this.state = 'empty';
        this.message = '';
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        /** The height of the last ready trace, held while another state stands in its place [px]. */
        this.kept = 0;
    }

    /** @param {string} tag @param {string} className */
    made(tag, className) {
        const el = this.doc.createElement(tag);
        el.className = className;
        return el;
    }

    /** An attribute of the host with a default. @param {string} name @param {string} fallback */
    attr(name, fallback) {
        return this.host.getAttribute(name) ?? fallback;
    }

    /** Whether a hop's verdict ends the packet at the first refusal or counts each hop on its own. @returns {'first-refusal' | 'all'} */
    stop() {
        return this.attr('data-kp-trace-stop', 'first-refusal') === 'all' ? 'all' : 'first-refusal';
    }

    /** The hops were given: the trace is ready. @param {readonly TraceHop[]} hops */
    takeHops(hops) {
        this.hops = hops;
        this.state = 'ready';
        this.kept = 0;
    }

    /** The height of what was drawn is kept for the states that stand in its place. */
    keepHeight() {
        this.kept = this.stage.offsetHeight;
    }

    /** @param {TraceState} next @param {string} message */
    takeState(next, message) {
        if (this.state === 'ready' && this.stage.offsetHeight > 0) this.kept = this.stage.offsetHeight;
        this.state = next;
        this.message = message;
    }

    clearBusy() {
        this.busy?.remove();
        this.busy = null;
    }

    /** The theme's busy card over the placeholder hops. @param {HTMLElement} list */
    openBusy(list) {
        this.busy = openBusyCard(this.stage, { words: getStrings().traceRunning, area: () => [list], className: 'kp-trace__busy', arrive: true });
    }
}
