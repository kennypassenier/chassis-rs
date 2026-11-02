// The attribute, selectors and shapes of the settled row [parts-1102].

/** A row whose item left the list while the page is open; the value is where it went ("Deleted", "Moved to Work", "Done"). */
export const SETTLED_ATTRIBUTE = 'data-kp-settled';
/** Any settled row. */
export const SETTLED = '[data-kp-settled]';
/** The lists a settled row stands in: a reorder list, a checklist, a task list, or any list marked for it. */
export const SETTLED_LISTS = '[data-kp-reorder], .kp-checklist, .kp-task-list, [data-kp-settled-list]';
/** The word a settled row shows, drawn by this module at the row's end. */
export const WORD_CLASS = 'kp-settled__word';
/** Fired on the row, bubbling, when it settles: `{ key, word }`. */
export const SETTLED_EVENT = 'kp-settled';
