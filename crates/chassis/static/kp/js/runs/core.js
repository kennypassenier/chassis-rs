// One list's state and what changes it: the times, the state, the expanded rows, the busy card and the first run said.

import { Controller } from '../controller.js';
import { openBusyCard } from '../busy-card.js';
import { getStrings } from '../strings.js';
import { toRun } from './input.js';
import { readRunsOptions } from './options.js';
import { buildRunsParts } from './parts.js';
import { runMoment } from './time.js';

/** @typedef {import('../runs.js').Run} Run */
/** @typedef {import('../runs.js').RunsState} RunsState */
/** @typedef {import('../runs.js').RunsOptions} RunsOptions */

/** Gives each list its own ids. */
let seq = 0;

export class RunsCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.s = getStrings();
        this.id = `kp-runs-${++seq}`;
        this.read = readRunsOptions(host, options.now);
        this.parts = buildRunsParts(host, this.id, host.dataset.kpRunsTitle ?? this.s.runsTitle);
        this.doc = host.ownerDocument;
        /** @type {Run[]} */
        this.all = [];
        /** @type {RunsState} */
        this.state = 'ready';
        /** @type {RunsOptions} */
        this.given = {};
        this.expanded = false;
        /** @type {import('../busy-card.js').BusyCard | null} */
        this.busy = null;
        this.lastFirst = NaN;
        this.drawn = false;
    }

    /** The app gave the times (none is the empty state). @param {readonly import('../runs.js').RunInput[]} times @param {RunsOptions} options */
    takeTimes(times, options) {
        this.given = options;
        this.all = times.map(toRun).filter((r) => r !== null);
        this.expanded = this.expanded && this.all.length > this.read.count;
        this.state = this.all.length === 0 ? 'empty' : 'ready';
    }

    /** @param {RunsState} next @param {RunsOptions} options */
    takeState(next, options) {
        this.given = { ...this.given, ...options };
        this.state = next === 'ready' && this.all.length === 0 ? 'empty' : next;
    }

    toggleExpanded() {
        this.expanded = !this.expanded;
    }

    /** The theme's busy card comes with the loading state and goes with it. */
    followBusy() {
        const { stage } = this.parts;
        if (this.state === 'loading' && !this.busy) {
            this.busy = openBusyCard(stage, { words: this.s.runsLoading, area: () => [stage], className: 'kp-runs__busy', arrive: this.drawn });
        } else if (this.state !== 'loading' && this.busy) {
            const b = this.busy;
            this.busy = null;
            void b.close();
        }
        this.drawn = true;
    }

    /** The status region says the first run only when it changes. */
    sayFirst() {
        const first = this.state === 'ready' ? this.all[0]?.at : undefined;
        if (first !== undefined && first !== this.lastFirst) {
            if (Number.isFinite(this.lastFirst)) this.parts.live.textContent = this.s.runsNext(runMoment(first, this.read.zone, this.host.lang || undefined));
            this.lastFirst = first;
        } else if (first === undefined) this.lastFirst = NaN;
    }
}
