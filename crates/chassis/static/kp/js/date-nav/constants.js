// The selectors, attribute names, events and fixed numbers of the date navigation [ux-1101].

/** A date navigation: `data-kp-date-nav` is its mode, `month` (default), `week` or `day`. */
export const DATE_NAV = '[data-kp-date-nav]';
/** The day the shown range holds, `YYYY-MM-DD`; today when absent. Read again when it changes. */
export const AT_ATTRIBUTE = 'data-kp-date-nav-at';
/** The id of the week agenda or calendar the navigation drives. */
export const FOR_ATTRIBUTE = 'data-kp-date-nav-for';
/** Today, `YYYY-MM-DD`, for a page whose clock is not the visitor's (a frozen demo, a test). */
export const TODAY_ATTRIBUTE = 'data-kp-date-nav-today';
/** Written on the navigation while the shown range holds today. */
export const CURRENT_ATTRIBUTE = 'data-kp-date-nav-current';

/**
 * Fired on the navigation, bubbling, when a person moved the range: `detail` `{ mode, at, start, end, by }`, the dates as
 * `YYYY-MM-DD`, `by` being `prev`, `next` or `today`.
 */
export const DATE_NAV_EVENT = 'kp-date-nav-change';

/** The modes, in the order a page is most likely to want them. */
export const DATE_NAV_MODES = /** @type {const} */ (['month', 'week', 'day']);

/** Days in a week. */
export const DAYS_PER_WEEK = 7;
/** Thursday, as Date#getUTCDay counts: the day that names an ISO week's year. */
export const ISO_WEEK_THURSDAY = 4;
/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;
/** The pause before a status sentence is written, after the region was cleared, so the same sentence twice is still heard [ms]. */
export const SAY_DELAY_MS = 60;

/** @typedef {'month' | 'week' | 'day'} DateNavMode */
/** @typedef {{ mode: DateNavMode, at: string, start: string, end: string }} DateNavRange */
