// Attaches the segmented groups under a root: delegated click, key and focus handling, and groups that arrive later.

import { Controller, controllerOf } from '../controller.js';
import { OVERFLOW_ATTRIBUTE, SEGMENTED, SEGMENTED_ITEM } from './constants.js';
import { HANDLED, STOPS } from './state.js';
import { groupDisabled, isAll, isMulti, isTri, itemDisabled, itemsOf } from './read.js';
import { enhance, SegmentedGroup } from './group.js';
import { choose, turnTri } from './actions.js';
import { targetIndex } from './keys.js';
import { roving } from './roving.js';

/** The item and the group an event happened in, or nulls. @param {Event} event */
function itemAndGroup(event) {
    const item = event.target instanceof Element ? event.target.closest(SEGMENTED_ITEM) : null;
    return { item, group: item?.parentElement?.closest(SEGMENTED) ?? null };
}

/** The listeners of one attach. The "host" is the root the page attached, which may be the document. */
export class SegmentedRoot extends Controller {
    /** @param {ParentNode} root */
    constructor(root) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
        this.root = root;
        /** Every group this attach has enhanced, for the detach. @type {Set<Element>} */
        this.groups = new Set();
    }

    connect() {
        const { root } = this;
        for (const group of root.querySelectorAll(SEGMENTED)) this.groups.add(group);
        if (root instanceof Element && root.matches(SEGMENTED)) this.groups.add(root);
        for (const group of this.groups) enhance(group);
        this.own(() => this.releaseGroups());
        this.listen(root, 'focusin', (event) => this.onFocus(/** @type {FocusEvent} */ (event)));
        this.listen(root, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(root, 'click', (event) => this.onClick(event));
        this.watchArrivals();
    }

    /** A group that arrives later (rendered by the page, or a copy of one) is wired when it arrives, so its first paint already has the plate in place. */
    watchArrivals() {
        if (typeof MutationObserver === 'undefined') return;
        const arrivals = this.observe(
            new MutationObserver((records) => {
                for (const record of records) for (const node of record.addedNodes) this.wireArrival(node);
            }),
        );
        arrivals.observe(this.root, { childList: true, subtree: true });
    }

    /** @param {Node} node */
    wireArrival(node) {
        if (!(node instanceof Element)) return;
        const found = node.matches(SEGMENTED) ? [node] : [];
        for (const group of [...found, ...node.querySelectorAll(SEGMENTED)]) {
            this.groups.add(group);
            enhance(group);
        }
    }

    /** Let go of every group this attach enhanced. */
    releaseGroups() {
        for (const group of this.groups) controllerOf(/** @type {HTMLElement} */ (group), SegmentedGroup)?.destroy();
    }

    /** @param {Event} event */
    onClick(event) {
        const { item, group } = itemAndGroup(event);
        if (!(item instanceof HTMLElement) || !group || HANDLED.has(event)) return;
        HANDLED.add(event);
        enhance(group);
        STOPS.set(group, item);
        roving(group);
        choose(group, item);
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const { item, group } = itemAndGroup(event);
        if (!(item instanceof HTMLElement) || !group || HANDLED.has(event) || event.altKey || event.ctrlKey || event.metaKey) return;
        const items = itemsOf(group).filter((one) => !itemDisabled(one));
        const at = items.indexOf(item);
        if (at < 0) return;
        if (isTri(group) && (event.key === 'Delete' || event.key === 'Backspace') && !isAll(item)) {
            HANDLED.add(event);
            event.preventDefault();
            enhance(group);
            if (!groupDisabled(group) && !itemDisabled(item)) turnTri(group, item, 'any');
            return;
        }
        const to = targetIndex(event, group, at, items.length);
        if (to < 0) return;
        HANDLED.add(event);
        event.preventDefault();
        enhance(group);
        const next = items[to];
        STOPS.set(group, next);
        roving(group);
        next.focus();
        // A radio group chooses as the focus moves; a toggle group only moves.
        if (!isMulti(group) && !isTri(group)) choose(group, next);
    }

    /** @param {FocusEvent} event */
    onFocus(event) {
        const { item, group } = itemAndGroup(event);
        if (!item || !group) return;
        STOPS.set(group, item);
        roving(group);
        if (group instanceof HTMLElement && group.hasAttribute(OVERFLOW_ATTRIBUTE)) item.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
}

/**
 * Wire every `[data-kp-segmented]` under `root`: its roles and states, its
 * roving tab stop, its clicks and its arrow keys, and the plate under the
 * chosen segment. A group rendered later is picked up on its first use, or
 * by calling this again on its subtree.
 *
 * Groups added later, linked ones too [fix-1031]: while this attach is
 * live, a group that arrives anywhere under `root` is wired as it arrives,
 * and a `data-kp-segmented-for` group is linked to its field then, so one
 * `attachSegmented(document)` at start links every chip group the page draws
 * afterwards. A group outside every attached root is wired by calling this
 * again on that root (or on the group's subtree). The link is read once,
 * when a group is first wired: `data-kp-segmented-for` belongs in the
 * group's markup when it arrives, and set later on a wired group it links
 * nothing (draw the group again as a new element). The field is found by id
 * at every change, so it may arrive in the same frame as the group.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSegmented(root = document) {
    // One controller per call, not per root: two attaches on one root keep their own listeners, as before (HANDLED dedupes them).
    const controller = new SegmentedRoot(root);
    controller.connect();
    return () => controller.destroy();
}
