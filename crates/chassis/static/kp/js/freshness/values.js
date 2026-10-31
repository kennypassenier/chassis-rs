// The selector, the zone and the fixed numbers of the freshness line.

/** A ticking line. */
export const AGO = '[data-kp-ago]';

/** The zone a moment is written in, whatever the reader's (rule 52). */
export const FRESHNESS_TIME_ZONE = 'Europe/Brussels';

/** Milliseconds in a second; the one timer repaints every line this often. */
export const MS_PER_SECOND = 1000;
export const TICK_MS = MS_PER_SECOND;

/** The seconds in a minute, an hour and a day: where the units change. */
export const SECONDS = { minute: 60, hour: 3600, day: 86400 };
/** The widest age a line shows in days ("99 days 23 h"), for the width it reserves. */
export const WIDEST_DAYS = 99;
/** The hours that go with them. */
export const WIDEST_HOURS = 23;

/** The attributes whose change repaints a line. */
export const AGO_OBSERVED = [
    'datetime',
    'data-kp-ago',
    'data-kp-ago-verb',
    'data-kp-stale-after',
    'data-kp-ago-width',
    'data-kp-ago-units',
    'data-kp-ago-bare',
];
