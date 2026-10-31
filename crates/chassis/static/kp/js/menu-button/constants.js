// The selector, event names, the line-count property and the gutter of the menu button.

/** A menu button's wrapper: a button, then its `[role=menu]`. */
export const MENU_BUTTON = '[data-kp-menu-button]';

/** Fired on the wrapper, bubbling, when the menu opened. */
export const MENU_OPEN_EVENT = 'kp-menu-open';
/** Fired on the wrapper, bubbling, when the menu closed. */
export const MENU_CLOSE_EVENT = 'kp-menu-close';
/** Fired on the wrapper, bubbling, when an entry was picked: `{ item, value }`. Cancelable: preventing it keeps the menu open. */
export const MENU_SELECT_EVENT = 'kp-menu-select';

/**
 * The custom property written on a menu: how many lines it has to rule
 * (menuLineCount()). A register that opens a menu line by line reads it to
 * give the opening no dead time at its end; CSS alone cannot count children.
 */
export const MENU_COUNT_PROPERTY = '--kp-menu-count';

/** The space an open menu keeps from the screen's edges, in px. */
export const MENU_GUTTER = 8;
