// Level aliases and the time and level words a line prints.

const ALIASES = /** @type {Record<string, string>} */ ({
    trace: 'debug',
    debug: 'debug',
    info: 'info',
    information: 'info',
    notice: 'notice',
    warn: 'warning',
    warning: 'warning',
    err: 'error',
    error: 'error',
    crit: 'critical',
    critical: 'critical',
    fatal: 'critical',
    alert: 'critical',
    emerg: 'critical',
    emergency: 'critical',
});

/** The canonical level of a word. @param {string} word */
export const logLevel = (word) => ALIASES[String(word).trim().toLowerCase()] ?? 'info';

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/** @param {number} ts @param {boolean} date */
export function clock(ts, date) {
    const d = new Date(ts);
    const time = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    return date ? `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${time}` : time;
}

/** @param {unknown} value @returns {number} */
export function stamp(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
}
