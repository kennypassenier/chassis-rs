// Filling every mark under a root, and each one added or renamed later (IdmarkRoot, one controller per attach); marks in one
// `[data-kp-idmark-set]` share out the palette.

import { Controller } from '../controller.js';
import { AVATAR_ATTRIBUTES } from './avatar.js';
import { DRAWN, baseKey, setIdmark } from './draw.js';
import { IDMARK, idmarkColours } from './mark.js';

/** The marks under `root` (and `root` itself). @param {ParentNode} root @returns {HTMLElement[]} */
function marksUnder(root) {
    return /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(IDMARK) ? [root] : []), ...root.querySelectorAll(IDMARK)]);
}

/** The palette slot each mark of a set is given, so the marks of one set do not collide. @param {HTMLElement[]} all @returns {Map<Element, number>} */
function slotsOf(all) {
    /** @type {Map<Element, Element[]>} */
    const sets = new Map();
    for (const el of all) {
        const set = el.closest('[data-kp-idmark-set]');
        if (set) (sets.get(set) ?? sets.set(set, []).get(set))?.push(el);
    }
    /** @type {Map<Element, number>} */
    const slots = new Map();
    for (const members of sets.values()) {
        const colours = idmarkColours(members.map((el) => el.getAttribute('data-kp-idmark') ?? ''));
        for (const el of members) {
            const slot = colours.get((el.getAttribute('data-kp-idmark') ?? '').trim());
            if (slot) slots.set(el, slot);
        }
    }
    return slots;
}

/** Draw every mark under `root` that is not drawn from what it asks for now. @param {ParentNode} root */
function paintMarks(root) {
    const all = marksUnder(root);
    const slots = slotsOf(all);
    for (const el of all) {
        const name = el.getAttribute('data-kp-idmark') ?? '';
        const before = DRAWN.get(el);
        const want = slots.get(el);
        if (before?.base === baseKey(el) && (want === undefined || want === before.slot) && el.querySelector(':scope > .kp-idmark__letters')) continue;
        setIdmark(el, name, { slot: want });
    }
}

/** The attributes whose change can change a drawn mark. */
const WATCHED = ['data-kp-idmark', ...AVATAR_ATTRIBUTES];

/**
 * The marks of one `attachIdmarks` call, now and as they are added or renamed: one repaint per microtask, however many
 * changes arrive in it. The "host" is the root the page passed, which may be the document.
 */
class IdmarkRoot extends Controller {
    /** @param {ParentNode} root */
    constructor(root) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
        this.root = root;
        /** The window of the root's document, whose classes the records are tested against. @type {(Window & typeof globalThis) | null} */
        this.view = null;
        /** Whether a repaint is queued for this microtask. */
        this.queued = false;
    }

    connect() {
        const { root } = this;
        paintMarks(root);
        this.view = (root instanceof Document ? root : root.ownerDocument)?.defaultView ?? null;
        if (!this.view?.MutationObserver) return;
        const watch = this.observe(new this.view.MutationObserver((records) => this.onChange(records)));
        watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED });
    }

    /** Whether a batch of records can have changed a mark: a watched attribute, or a mark added. @param {MutationRecord[]} records */
    relevant(records) {
        const View = /** @type {Window & typeof globalThis} */ (this.view);
        return records.some(
            (record) =>
                record.type === 'attributes' ||
                [...record.addedNodes].some((node) => node instanceof View.Element && (node.matches(IDMARK) || node.querySelector(IDMARK) !== null)),
        );
    }

    /** Queue one repaint for the changes of this microtask. @param {MutationRecord[]} records */
    onChange(records) {
        if (this.queued || !this.relevant(records)) return;
        this.queued = true;
        this.view?.queueMicrotask(() => {
            this.queued = false;
            if (!this.destroyed) paintMarks(this.root);
        });
    }
}

/**
 * Fill every `[data-kp-idmark]` under `root`, and each one added or renamed
 * later. Marks inside one `[data-kp-idmark-set]` share out the palette with
 * idmarkColours(), in document order.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachIdmarks(root = document) {
    // Every call watches its root on its own, as before: the root is not keyed, so a second call is a second watcher.
    const control = new IdmarkRoot(root);
    control.connect();
    return () => control.destroy();
}
