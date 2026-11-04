// The undo toast's class, event and fixed numbers.

/** The toast's own class. */
export const UNDO_TOAST = 'kp-toast--undo';
/** Fired on the toast region, bubbling, when the action is committed, undone or failed: `{ toast, outcome }`. */
export const UNDO_TOAST_EVENT = 'kp-undo-toast';
/** How long the toast says "Restored" [ms]. */
export const UNDO_RESTORED_MS = 1500;
/** The key that undoes the newest toast when the page names none (a key spec, js/key-spec.js; `none` or `false` for no key). */
export const UNDO_KEY = 'Mod+Z';
/**
 * The key that moves the focus to the newest toast's Undo button (a key spec; `none` or `false` for no key). Unlike `UNDO_KEY` it
 * also works while typing in a field, because it holds Alt and types nothing [js-1104].
 */
export const UNDO_FOCUS_KEY = 'Alt+Z';
/** How many toasts stand at once. */
export const UNDO_MAX = 3;

/** Milliseconds in a second, for the seconds the clock says. */
export const MS_PER_SECOND = 1000;
/** How often the seconds on the toast are written, in ms. */
export const CLOCK_TICK_MS = 250;
