// What outlives one group controller: the roving tab stop of each group, and the events already handled.

/** The item the roving tab stop sits on, per group; kept when a group is detached and attached again. @type {WeakMap<Element, Element>} */
export const STOPS = new WeakMap();

/** Events already handled, for a group under two attached roots. @type {WeakSet<Event>} */
export const HANDLED = new WeakSet();
