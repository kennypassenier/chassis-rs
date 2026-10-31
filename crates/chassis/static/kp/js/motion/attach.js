// Attaches the motion layer to a root: its dialogs, eased boxes and folds, now and as they arrive.
import { Controller } from '../controller.js';
import { FOLD_SELECTOR, SIZE_SELECTOR } from './constants.js';
import { attachClose } from './dialog-close.js';
import { easeSize } from './box-size.js';
import { attachFold } from './fold-control.js';
/** @typedef {import('./fold-size.js').SizeOptions} SizeOptions */

/** The dialogs that leave the way they came. */
const DIALOGS = 'dialog.kp-dialog, dialog.kp-palette, dialog.kp-alarm';

/**
 * The motion of one root: the detach of every element it wired sits on the
 * instance, and the elements that leave the page are let go a microtask later.
 */
export class MotionRoot extends Controller {
    /** @param {HTMLElement} root (a Document passes too) @param {SizeOptions & { size?: string }} [options] */
    constructor(root, options = {}) {
        super(root, options);
        /** The boxes the page asks to ease beside the package's own. */
        this.sizeSelector = options.size?.trim() ? `${SIZE_SELECTOR}, ${options.size}` : SIZE_SELECTOR;
        /** What each box gets when it is eased. @type {SizeOptions} */
        this.sizeOptions = { arrive: options.arrive ?? 'all', arriveKeys: options.arriveKeys ?? [] };
        /** The detach of each element wired here. @type {Map<Element, () => void>} */
        this.detaches = new Map();
        /** Whether a sweep of the elements that left is queued. */
        this.sweeping = false;
    }

    connect() {
        const root = /** @type {ParentNode} */ (/** @type {unknown} */ (this.host));
        // Registered first, so it runs last: every element let go after the watcher stopped.
        this.own(() => this.letGoAll());
        this.scan(root);
        const later = this.observe(new MutationObserver((records) => this.onChange(records)));
        later.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), { childList: true, subtree: true });
    }

    /** @param {Element} el @param {() => void} detach */
    keep(el, detach) {
        const before = this.detaches.get(el);
        this.detaches.set(el, before ? () => (before(), detach()) : detach);
    }

    /** Wire what is under `scope`, `scope` itself included. @param {ParentNode} scope */
    scan(scope) {
        const all = (/** @type {string} */ selector) => [
            ...(scope instanceof Element && scope.matches(selector) ? [scope] : []),
            ...scope.querySelectorAll(selector),
        ];
        for (const el of all(DIALOGS)) if (!el.hasAttribute('data-kp-ghost')) this.keep(el, attachClose(/** @type {HTMLDialogElement} */ (el)));
        for (const el of all(this.sizeSelector))
            if (!el.hasAttribute('data-kp-ghost')) this.keep(el, easeSize(/** @type {HTMLElement} */ (el), this.sizeOptions));
        for (const el of all(FOLD_SELECTOR)) if (el instanceof HTMLDetailsElement && !el.hasAttribute('data-kp-ghost')) this.keep(el, attachFold(el));
    }

    /** What is added is wired; what is removed is let go a microtask later, unless it came back. @param {MutationRecord[]} records */
    onChange(records) {
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof Element) this.scan(node);
            if (record.removedNodes.length && !this.sweeping) {
                this.sweeping = true;
                queueMicrotask(() => this.sweep());
            }
        }
    }

    /** Let go of every wired element no longer in the page. */
    sweep() {
        this.sweeping = false;
        for (const [el, detach] of this.detaches)
            if (!el.isConnected) {
                detach();
                this.detaches.delete(el);
            }
    }

    /** Let go of every element this root wired. */
    letGoAll() {
        for (const one of this.detaches.values()) one();
        this.detaches.clear();
    }
}

/**
 * Give every dialog its leaving motion and every box above its easing, under
 * `root` and in whatever is added to it later. A box, dialog or disclosure
 * that leaves the page is let go (its observers disconnected) a microtask
 * after it left, so a page that rebuilds itself on every navigation does not
 * keep the old boxes' watchers alive; one moved within the page stays.
 *
 * @param {ParentNode} [root]
 * @param {SizeOptions & { size?: string }} [options] `size`: more boxes to ease, as a selector, beside the package's own and `[data-kp-size-motion]` (a consumer's cards and panels, without marking each one); `arrive` and `arriveKeys` as for easeSize()
 * @returns {() => void} detach
 */
export function attachMotion(root = document, { size = '', arrive = 'all', arriveKeys = [] } = {}) {
    // Every call watches its root on its own, as before: the root is not keyed, so a second call is a second watcher.
    const motion = new MotionRoot(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)), { size, arrive, arriveKeys });
    motion.connect();
    return () => motion.destroy();
}
