// The keys of the day grid: which day an arrow, Home, End, Page Up or Page Down goes to.

import { DAYS_PER_WEEK, MONTHS_PER_YEAR } from './constants.js';
import { shiftDay, shiftMonth, weekday } from './dates.js';

/**
 * The day a key moves the focus to from `iso`, or null for a key the grid does not take. Arrows move a day or a week, Home and End go
 * to the week's ends, Page Up and Page Down change the month (with Shift, the year).
 * @param {string} key @param {boolean} shift @param {string} iso `YYYY-MM-DD` @param {number} firstDay
 * @returns {string | null}
 */
export function targetDay(key, shift, iso, firstDay) {
    switch (key) {
        case 'ArrowLeft':
            return shiftDay(iso, -1);
        case 'ArrowRight':
            return shiftDay(iso, 1);
        case 'ArrowUp':
            return shiftDay(iso, -DAYS_PER_WEEK);
        case 'ArrowDown':
            return shiftDay(iso, DAYS_PER_WEEK);
        case 'Home':
            return shiftDay(iso, -weekday(iso, firstDay));
        case 'End':
            return shiftDay(iso, DAYS_PER_WEEK - 1 - weekday(iso, firstDay));
        case 'PageUp':
            return shiftMonth(iso, shift ? -MONTHS_PER_YEAR : -1);
        case 'PageDown':
            return shiftMonth(iso, shift ? MONTHS_PER_YEAR : 1);
        default:
            return null;
    }
}
