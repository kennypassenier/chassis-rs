// The selectors, attribute names, events, fixed numbers and shapes of the day timeline [parts-1102].

/** A day timeline: `.kp-dayline[data-kp-dayline]`. */
export const DAYLINE = '[data-kp-dayline]';
/** The hour the day starts at, 0 to 23 (default 0); the day runs down to the same hour the next morning. */
export const START_ATTRIBUTE = 'data-kp-start-hour';
/** The minutes of one step: the rows of the grid and every move (default 15). */
export const STEP_ATTRIBUTE = 'data-kp-step';
/** How many hours the day shows from its start (default 24). */
export const HOURS_ATTRIBUTE = 'data-kp-dayline-hours';
/** A frozen clock, `HH:MM`, for a page whose clock is not the visitor's (a demo, a test); else the `now` option or the clock. */
export const NOW_ATTRIBUTE = 'data-kp-dayline-now';
/** An element beside the day whose item can be dropped onto an hour: its value is the item's id. */
export const SOURCE_ATTRIBUTE = 'data-kp-dayline-source';
/** On a source: the id of the one day timeline it may be dropped on; any day timeline when absent. */
export const SOURCE_FOR_ATTRIBUTE = 'data-kp-dayline-for';
/** On a source: the words said when it lands ("Pay the energy bill planned at 15:00"); without it the time alone is said. */
export const SOURCE_LABEL_ATTRIBUTE = 'data-kp-dayline-label';
/** How long a finger holds a block or a source still before it lifts and follows, a time (`500ms`, `0.4s`; default 500 ms). */
export const HOLD_ATTRIBUTE = 'data-kp-dayline-hold';

/** Fired on the day timeline, bubbling, when a person moved an item: `{ id, start, from, source }`, times as `HH:MM`. */
export const DAYLINE_CHANGE_EVENT = 'kp-dayline-change';
/** Fired on the day timeline, bubbling, when an item's body is pressed: `{ id, source }`. */
export const DAYLINE_OPEN_EVENT = 'kp-dayline-open';
/** Fired on the day timeline, bubbling, when an element from beside it was dropped on an hour: `{ id, start }`. */
export const DAYLINE_DROP_EVENT = 'kp-dayline-drop';
/** Fired on the day timeline, bubbling, when Try again is pressed on its failed plate. */
export const DAYLINE_RETRY_EVENT = 'kp-dayline-retry';

/** Minutes in a day. */
export const DAY_MINUTES = 1440;
/** The step when the markup names none or a bad one [minutes]. */
export const DEFAULT_STEP = 15;
/** The shortest block drawn [minutes]: a 15-minute item still has room for its words. */
export const MIN_DRAWN_MINUTES = 30;
/** How often the now line moves [ms]. */
export const NOW_TICK_MS = 60_000;
/** Where the now line stands in the box after the first draw: a quarter from the top, so the next hours show. */
export const NOW_VIEW_SHARE = 0.25;
/** A keyboard walk is one change once the keys rest this long [ms]. */
export const SETTLE_MS = 700;
/** Pixels a mouse or pen press (on a handle, a block or a source) travels before it is a drag; less is a plain press. */
export const DRAG_THRESHOLD_PX = 4;
/** Pixels a finger may wander while it holds still; more before the hold is up is a scroll, never a drag (the context menu's). */
export const TOUCH_SLOP_PX = 10;
/** The band at the top and bottom of the box where a held item scrolls the hours [px], and the fastest scroll [px per frame]. */
export const EDGE_BAND_PX = 40;
export const EDGE_SPEED_PX = 14;
/** Where a press on a source stays the control's own (typing, a check box, a menu, a handle) and starts no drag. */
export const SOURCE_OWN_PRESS = 'input, textarea, select, label, [contenteditable=""], [contenteditable="true"], [data-kp-handle], [aria-haspopup]';

/**
 * One item of the day.
 * @typedef {object} DaylineItem
 * @property {string} id
 * @property {string} label
 * @property {string} [start] `HH:MM`; an item without one (or with `allDay`) stands in the all-day strip
 * @property {number} [minutes] how long it takes; its block is as long (default the step, drawn at least 30 minutes)
 * @property {string | number} [tone] `primary` (default), `success`, `warning`, `destructive`, `info`, `muted`, or 1 to 12 (a
 *   categorical colour, `--kp-cat-N`)
 * @property {boolean} [done] struck through and quiet
 * @property {boolean} [readonly] cannot be moved or opened: dashed, no handle, shares the lanes so a clash shows
 * @property {boolean} [allDay] stands in the strip above the hours
 */

/**
 * An item placed on the grid: its first row, its rows, and its lane among the items it overlaps.
 * @typedef {{ item: DaylineItem, at: number, minutes: number, row: number, rows: number, lane: number, lanes: number }} Placed
 */

/** @typedef {'loading' | 'ready' | 'empty' | 'error'} DaylineState */
