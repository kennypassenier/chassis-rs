// The disclosures that remember (a `<details data-kp-remember>`): one RememberedDisclosure per element, and the
// RememberWatch that wires those added later, lets go of those that leave, and paints a held one back when the hold goes.

import { Controller } from '../controller.js';
import { paintDisclosure, paintRemembered } from './painters.js';
import { REMEMBER_ATTRIBUTE, memoryFor } from './store.js';

/** @typedef {import('../remember.js').Memory} Memory */

/** The attribute that holds a disclosure's memory still: while it is on the element or an ancestor, the memory is neither painted nor written. */
export const REMEMBER_HOLD_ATTRIBUTE = 'data-kp-remember-hold';

/** @param {Element} element */
const held = (element) => element.closest(`[${REMEMBER_HOLD_ATTRIBUTE}]`) !== null;

/** The disclosures some attach has wired: a set rather than a mark on the element, which a clone would carry along. @type {WeakSet<Element>} */
const wiredDisclosures = new WeakSet();

/** One remembering disclosure: its memory, painted at once unless held, and written on every toggle. */
class RememberedDisclosure extends Controller {
    /** @param {HTMLDetailsElement} details @param {Memory} memory */
    constructor(details, memory) {
        super(details);
        this.details = details;
        this.memory = memory;
    }

    connect() {
        const details = this.details;
        wiredDisclosures.add(details);
        details.dataset.kpRememberAttached = '';
        this.own(() => {
            wiredDisclosures.delete(details);
            delete details.dataset.kpRememberAttached;
        });
        this.listen(details, 'toggle', () => {
            if (!held(details)) this.memory.write('open', details.open);
        });
    }

    /** A hold that went: paint what was stored back. */
    repaint() {
        if (!held(this.details)) paintDisclosure(this.details, this.memory);
    }
}

/** Every remembering disclosure under a root, now and later. */
export class RememberWatch {
    /** @param {ParentNode} root */
    constructor(root) {
        this.root = root;
        /** @type {Map<HTMLDetailsElement, RememberedDisclosure>} */
        this.wired = new Map();
        this.sweeping = false;
        /** @type {MutationObserver | null} */
        this.later = null;
    }

    /** Wire what is there, then watch for more when the root is in a window. */
    start() {
        this.wire(this.root);
        const root = this.root;
        const doc = root instanceof Document ? root : (root.ownerDocument ?? (typeof document === 'undefined' ? null : document));
        const view = doc?.defaultView;
        if (!view) return;
        this.later = new view.MutationObserver((records) => this.onRecords(records, view));
        this.later.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [REMEMBER_HOLD_ATTRIBUTE],
        });
    }

    stop() {
        this.later?.disconnect();
        for (const disclosure of this.wired.values()) disclosure.destroy();
        this.wired.clear();
    }

    /** @param {ParentNode} scope */
    wire(scope) {
        const selector = `details[${REMEMBER_ATTRIBUTE}]`;
        const found = [...(scope instanceof Element && scope.matches(selector) ? [scope] : []), ...scope.querySelectorAll(selector)];
        for (const element of found) {
            const details = /** @type {HTMLDetailsElement} */ (element);
            if (wiredDisclosures.has(details)) continue;
            const memory = held(details) ? memoryFor(details, 'disclosure') : paintRemembered(details, 'disclosure');
            if (memory === null) continue;
            const disclosure = new RememberedDisclosure(details, memory);
            disclosure.connect();
            this.wired.set(details, disclosure);
        }
    }

    /** @param {MutationRecord[]} records @param {Window & typeof globalThis} view */
    onRecords(records, view) {
        for (const record of records) {
            if (record.type === 'attributes') {
                // A hold that went: paint what was stored back on what it held.
                const target = /** @type {Element} */ (record.target);
                if (target.hasAttribute(REMEMBER_HOLD_ATTRIBUTE)) continue;
                for (const [details, disclosure] of this.wired) if (details === target || target.contains(details)) disclosure.repaint();
                continue;
            }
            for (const node of record.addedNodes) if (node instanceof view.Element) this.wire(node);
            if (record.removedNodes.length && !this.sweeping) {
                this.sweeping = true;
                queueMicrotask(() => this.sweep());
            }
        }
    }

    /** Let go of the disclosures that left the page. */
    sweep() {
        this.sweeping = false;
        for (const [details, disclosure] of this.wired)
            if (!details.isConnected) {
                disclosure.destroy();
                this.wired.delete(details);
            }
    }
}
