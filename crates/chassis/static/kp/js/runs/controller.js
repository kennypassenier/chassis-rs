// One wired list: placed and built, its handle, the retry and "show more" presses, the minute refresh, and its first state.

import { RunsNote } from './note.js';
import { REFRESH_MS, RUNS_RETRY_EVENT } from './values.js';

export class RunsList extends RunsNote {
    /**
     * @param {HTMLElement} host
     * @param {{ now?: () => number }} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../runs.js').RunsHandle} */
        this.handle = {
            element: host,
            set: (times, given = {}) => {
                this.takeTimes(times, given);
                this.sync();
            },
            setState: (next, given = {}) => {
                this.takeState(next, given);
                this.sync();
            },
            runs: () => this.all.slice(),
            state: () => this.state,
        };
    }

    connect() {
        const el = this.host;
        const { title, stage, button, live } = this.parts;
        el.classList.add('kp-runs');
        el.style.setProperty('--kp-runs-count', String(this.read.count));
        el.dataset.kpRunsAttached = '';
        el.replaceChildren(title, stage, button, live);
        // Registered first, so they run last on detach: the list is emptied and its marks go.
        this.own(() => {
            el.replaceChildren();
            el.style.removeProperty('--kp-runs-count');
            delete el.dataset.kpRunsAttached;
        });
        this.own(() => this.busy?.remove());
        this.listenForRefresh();
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(button, 'click', () => this.onMore());
        this.start();
    }

    /** The relative words are refreshed every minute unless the clock is fixed. */
    listenForRefresh() {
        if (this.read.fixed) return;
        const tick = window.setInterval(() => this.state === 'ready' && this.draw(), REFRESH_MS);
        this.own(() => clearInterval(tick));
    }

    /** The first state: a page that writes `data-kp-state` and `data-kp-runs-values` (ISO, comma separated) gets it at once. */
    start() {
        const el = this.host;
        const initial = (el.dataset.kpRunsValues ?? '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
        if (el.dataset.kpState === 'loading') this.handle.setState('loading');
        else this.handle.set(initial);
    }

    sync() {
        this.draw();
        this.paintNote();
        this.host.dataset.kpState = this.state;
        this.followBusy();
        this.sayFirst();
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-runs-retry]')) this.host.dispatchEvent(new CustomEvent(RUNS_RETRY_EVENT, { bubbles: true, detail: { element: this.host } }));
    }

    onMore() {
        this.toggleExpanded();
        this.draw();
    }
}
