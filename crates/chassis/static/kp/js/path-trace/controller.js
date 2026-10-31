// One wired trace: its parts placed, its handle, the redraw when an option changes, the swap key, and the way it is taken down.

import { registerShortcuts } from '../shortcuts.js';
import { getStrings } from '../strings.js';
import { TraceDraw } from './draw.js';
import { traceText } from './states.js';
import { TRACE_SWAP_EVENT, WATCHED_ATTRIBUTES } from './values.js';

export class Trace extends TraceDraw {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** What the page gets back, the same object every time. @type {import('../path-trace.js').TraceHandle} */
        this.handle = {
            element: host,
            set: (next) => {
                this.takeHops(next);
                this.draw();
                this.keepHeight();
            },
            setState: (next, given = {}) => {
                this.takeState(next, given.message ?? '');
                this.draw();
            },
            text: () => traceText(this.hops, this.stop()),
        };
    }

    connect() {
        const el = this.host;
        el.classList.add('kp-trace');
        this.own(() => el.classList.remove('kp-trace'));
        el.replaceChildren(this.summary, this.stage, this.foot);
        this.own(() => el.replaceChildren());
        this.own(() => this.busy?.remove());
        this.observe(new MutationObserver(() => this.draw())).observe(el, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
        if (el.hasAttribute('data-kp-trace-swap')) this.own(this.registerSwapKey());
        this.draw();
    }

    /** The S key asks for a swap, for a form that swaps source and target. */
    registerSwapKey() {
        const s = getStrings();
        return registerShortcuts(
            this.host,
            [
                {
                    keys: 's',
                    what: s.traceKeySwap,
                    group: s.traceKeyGroup,
                    run: () => this.host.dispatchEvent(new CustomEvent(TRACE_SWAP_EVENT, { bubbles: true })),
                },
            ],
            { layoutGuard: 'warn' },
        );
    }
}
