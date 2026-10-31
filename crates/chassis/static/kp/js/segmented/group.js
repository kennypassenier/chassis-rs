// One segmented group: the roles and states its markup left out, its size and scroll watching, and its mode watching.

import { Controller, attachOne, controllerOf } from '../controller.js';
import { watchOptions } from '../live-options.js';
import { getSegmentedValues, isAll, isMulti, isTri, itemsOf, triOf } from './read.js';
import { layout, reach } from './plate.js';
import { paint } from './paint.js';
import { rewriteForMode } from './mode.js';
import { LINK_ATTRIBUTE, SegmentedLink } from './link.js';
import { paintTri, setTriValues, writeTri } from './tri.js';

/** Wires one group. Idempotent: `refresh()` brings the group in line again whenever a page touches it. */
export class SegmentedGroup extends Controller {
    /** @param {HTMLElement} host the group */
    constructor(host) {
        super(host);
        /** Watches the group and its items for a change of size. @type {ResizeObserver | null} */
        this.sizes = null;
        /** The value of `data-kp-segmented` last seen, to know what the mode was before a change. */
        this.mode = 'single';
    }

    connect() {
        const group = this.host;
        if (!group.hasAttribute('role')) group.setAttribute('role', isMulti(group) || isTri(group) ? 'group' : 'radiogroup');
        if (typeof ResizeObserver !== 'undefined') {
            this.sizes = this.observe(new ResizeObserver(() => layout(group)));
            this.sizes.observe(group);
        }
        this.listen(group, 'scroll', () => reach(group), { passive: true });
        if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => layout(group));
        // The mode (`single`, `multi`, `tri`) is read again when `data-kp-segmented` changes [live-options-1019].
        this.mode = group.getAttribute('data-kp-segmented') ?? 'single';
        this.own(
            watchOptions(group, ['data-kp-segmented'], () => {
                const was = this.mode;
                this.mode = group.getAttribute('data-kp-segmented') ?? 'single';
                this.switchMode(was);
            }),
        );
        // A group tied to a tag input or combobox keeps the two in step. (Until mc-r2 this registered the attach as an undo step, so the link was
        // never made: the chips and the field did not follow each other, which is what Kenny found.)
        if (group.hasAttribute(LINK_ATTRIBUTE)) {
            const link = attachOne(group, SegmentedLink);
            if (link) this.own(() => link.destroy());
        }
        this.refresh();
    }

    /** Give the items their type and roles, let the size watcher see them, and paint the state. */
    refresh() {
        const group = this.host;
        const multi = isMulti(group);
        for (const item of itemsOf(group)) {
            if (item instanceof HTMLButtonElement && !item.hasAttribute('type')) item.type = 'button';
            if (!multi && !isTri(group) && !item.hasAttribute('role')) item.setAttribute('role', 'radio');
            if (isTri(group) && !isAll(item)) writeTri(item, triOf(item));
            this.sizes?.observe(item);
        }
        if (isTri(group)) paintTri(group);
        else paint(group, getSegmentedValues(group));
    }

    /**
     * `data-kp-segmented` changed from `was` to something else: the roles and the state attributes are written the way the new
     * mode reads them, and the values that were on stay on (a single group keeps the first of several).
     * @param {string} was
     */
    switchMode(was) {
        const values = rewriteForMode(this.host, was);
        if (isTri(this.host)) {
            this.refresh();
            setTriValues(this.host, { include: values });
        } else paint(this.host, values);
    }
}

/**
 * Give a group the roles and states its markup left out, and watch its size.
 * Idempotent; called by attach and, for a group added later, by its first use.
 * @param {Element} group
 */
export function enhance(group) {
    const el = /** @type {HTMLElement} */ (group);
    const existing = controllerOf(el, SegmentedGroup);
    if (existing) existing.refresh();
    else attachOne(el, SegmentedGroup);
}
