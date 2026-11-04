// One segmented group: the roles and states its markup left out, its size and scroll watching, and its mode watching.

import { Controller, attachOne, controllerOf } from '../controller.js';
import { watchOptions } from '../live-options.js';
import { getSegmentedValues, isAll, isMulti, isTri, itemsOf, triOf } from './read.js';
import { layoutGroups, reach } from './plate.js';
import { paint } from './paint.js';
import { rewriteForMode } from './mode.js';
import { LINK_ATTRIBUTE, SegmentedLink } from './link.js';
import { paintTri, setTriValues, writeTri } from './tri.js';
import { FIT_ATTRIBUTE, FOLD_AT_ATTRIBUTE, FOLD_ATTRIBUTE, fitGroup } from './fit.js';
import { dropFold } from './fold.js';
import { SEGMENTED_EVENT } from './constants.js';
import { isTrackedGroup, listenGroupWrites, writeGroupTrack } from './track.js';

/** The groups waiting for their plates, placed together in the next microtask [attach-1104]. @type {Set<HTMLElement>} */
const WAITING = new Set();

/** The group each watched element belongs to, for the shared size observer. @type {WeakMap<Element, HTMLElement>} */
const OWNERS = new WeakMap();

/** @type {ResizeObserver | null} */
let sharedObserver = null;

/** Place the plates of every waiting group: all reads, then all writes, then the chips' tracks. */
function flushWaiting() {
    const groups = [...WAITING];
    WAITING.clear();
    layoutGroups(groups);
    for (const group of groups) fitGroup(group);
}

/**
 * Place a group's plate and lay its tracks with the other groups asking in the same task. A task is one attach pass, one size
 * change of several groups or one arrival of fonts, so a page of many groups costs one layout instead of one per group.
 * @param {HTMLElement} group
 */
function placeSoon(group) {
    WAITING.add(group);
    if (WAITING.size === 1) queueMicrotask(flushWaiting);
}

/**
 * The size watch of one group over the one observer all groups share. One observer delivers every changed group in one callback,
 * so their plates are placed together; an observer per group delivered them one by one, each write forcing the next read to lay
 * the page out again. Has the `observe` and `disconnect` of a ResizeObserver, so the controller can own it.
 */
class GroupSizes {
    constructor() {
        /** @type {Set<Element>} */
        this.watching = new Set();
        sharedObserver ??= new ResizeObserver((entries) => {
            for (const { target } of entries) {
                const group = OWNERS.get(target);
                if (group) placeSoon(group);
            }
        });
    }

    /** @param {Element} element @param {HTMLElement} group */
    watch(element, group) {
        OWNERS.set(element, group);
        this.watching.add(element);
        sharedObserver?.observe(element);
    }

    disconnect() {
        for (const element of this.watching) {
            sharedObserver?.unobserve(element);
            OWNERS.delete(element);
        }
        this.watching.clear();
    }
}

/** Wires one group. Idempotent: `refresh()` brings the group in line again whenever a page touches it. */
export class SegmentedGroup extends Controller {
    /** @param {HTMLElement} host the group */
    constructor(host) {
        super(host);
        /** Watches the group and its items for a change of size. @type {GroupSizes | null} */
        this.sizes = null;
        /** The value of `data-kp-segmented` last seen, to know what the mode was before a change. */
        this.mode = 'single';
    }

    connect() {
        const group = this.host;
        if (!group.hasAttribute('role')) group.setAttribute('role', isMulti(group) || isTri(group) ? 'group' : 'radiogroup');
        if (typeof ResizeObserver !== 'undefined') {
            this.sizes = this.observe(new GroupSizes());
            this.sizes.watch(group, group);
        }
        this.listen(group, 'scroll', () => reach(group), { passive: true });
        this.afterFonts(() => placeSoon(group));
        this.own(() => WAITING.delete(group));
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
        // Chips on tracks and their fold [ux-1101] are read again when their attributes change; the fold goes with the group.
        this.own(watchOptions(group, [FIT_ATTRIBUTE, FOLD_AT_ATTRIBUTE, FOLD_ATTRIBUTE], () => fitGroup(group)));
        // A three-way group's own visible words are written again when they change [ux-1101].
        this.own(watchOptions(group, ['data-kp-segmented-tags'], () => this.refresh()));
        this.own(() => dropFold(group));
        if (group.hasAttribute(LINK_ATTRIBUTE)) {
            const link = attachOne(group, SegmentedLink);
            if (link) this.own(() => link.destroy());
        }
        // A tracked group [forms-1102]: a press is a person's change; a value written back (Discard, Undo) is painted.
        if (isTrackedGroup(group)) {
            this.listen(group, SEGMENTED_EVENT, (event) => event.target === group && writeGroupTrack(group, true));
            this.own(listenGroupWrites(group, { values: (g, v) => paint(g, v), tri: (g, v) => setTriValues(g, v) }));
        }
        this.refresh(true);
    }

    /**
     * Give the items their type and roles, let the size watcher see them, and paint the state.
     * @param {boolean} [together] the plate and the tracks wait for the other groups of the pass, which `connect()` asks
     */
    refresh(together = false) {
        const group = this.host;
        const multi = isMulti(group);
        for (const item of itemsOf(group)) {
            if (item instanceof HTMLButtonElement && !item.hasAttribute('type')) item.type = 'button';
            if (!multi && !isTri(group) && !item.hasAttribute('role')) item.setAttribute('role', 'radio');
            if (isTri(group) && !isAll(item)) writeTri(item, triOf(item));
            this.sizes?.watch(item, group);
        }
        if (isTri(group)) paintTri(group);
        else paint(group, getSegmentedValues(group), !together);
        if (together) placeSoon(group);
        else fitGroup(group);
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
