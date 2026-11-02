// The selector, attributes, events and timings of the context menu [habits-1101].

export { LONG_PRESS_MS } from '../row-select/rows.js';

/** An element that has a context menu. */
export const CONTEXT_MENU = '[data-kp-context-menu]';
/** The value of `data-kp-context-menu` that shows the menu of the element's own menu button (a row's ⋯). */
export const INNER = 'inner';
/** The class of the one menu a document shows at the pointer. */
export const ANCHOR_CLASS = 'kp-context-menu';
/** Elements that cannot hold the menu as a child; it stands after them instead. */
export const NO_CHILD = 'input, textarea, select, img, ul, ol, dl, table, thead, tbody, tfoot, tr, [data-kp-reorder]';
/** Where a long press keeps its own meaning (typing, dragging), so it opens no menu. */
export const OWN_PRESS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-kp-handle]';
/** How far a finger may wander before a press counts as a scroll instead [px]. */
export const PRESS_SLOP_PX = 10;
/** A `contextmenu` event this soon after a key opened the menu is the key's own echo, not a second request [ms]. */
export const KEY_ECHO_MS = 400;
/** A menu opened by a key hangs from the focused element's start edge, this far in [px]. */
export const KEY_INSET_PX = 16;
/** Fired on the element, bubbling, when its context menu opened: `{ x, y, source }`; `source` is `pointer`, `touch` or `keyboard`. */
export const CONTEXT_OPEN_EVENT = 'kp-context-menu-open';
