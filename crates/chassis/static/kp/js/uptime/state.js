// The per-strip memory the parts share: specs, cards, groups and info.
/** @typedef {import('./types.js').UptimeSpec} UptimeSpec */

/** What each strip was last given. @type {WeakMap<HTMLElement, UptimeSpec>} */
export const SPECS = new WeakMap();
/** The busy card over a loading strip. @type {WeakMap<HTMLElement, import('../busy-card.js').BusyCard>} */
export const CARDS = new WeakMap();
/** A card on its way out and the spec that waits for it. @type {WeakMap<HTMLElement, { card: import('../busy-card.js').BusyCard, spec: UptimeSpec }>} */
export const WAITING = new WeakMap();
/** The one busy card of a group of strips, and the strips of the group that are loading now [state-plates-1019]. @type {WeakMap<Element, { card: import('../busy-card.js').BusyCard, loading: Set<HTMLElement>, closing: boolean }>} */
export const GROUPS = new WeakMap();
/** The group host a loading strip shares its card with. @type {WeakMap<HTMLElement, Element>} */
export const GROUP_OF = new WeakMap();
/** Scrolling strips the reader scrolled away from the latest period. @type {WeakSet<HTMLElement>} */
export const UNPINNED = new WeakSet();
/** Strips drawn before: a card on the first render is the page, not news. @type {WeakSet<HTMLElement>} */
export const DRAWN = new WeakSet();
/** The open quick info of a strip, and how to shut it at once (a redraw). @type {WeakMap<HTMLElement, () => void>} */
export const INFO = new WeakMap();
/** The mutable values the parts of this module share. */
export const uptimeState = {
    /** Ids for the quick-info panels. */
    infoMade: 0,
};
