// Pure time maths for the axis: wall time, zones, strides and ticks.
import { getStrings } from '../strings.js';
import { CHART_TIME_ZONE } from './constants.js';
/** @typedef {import('./words.js').ChartPoint} ChartPoint */
/** @typedef {import('./words.js').ChartTimeFormat} ChartTimeFormat */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** One reader per zone: the wall-clock parts of a moment. @type {Map<string, Intl.DateTimeFormat>} */
const WALL = new Map();
/**
 * The wall-clock date and time of `ms` in `timeZone`, to the minute. An
 * unknown zone throws a RangeError (from Intl).
 * @param {number} ms
 * @param {string} [timeZone]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number }}
 */
export function wallTime(ms, timeZone = CHART_TIME_ZONE) {
    let format = WALL.get(timeZone);
    if (!format) {
        // The parts are read one by one, so the locale's order and
        // punctuation never reach the page; h23 keeps midnight at 00.
        format = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        WALL.set(timeZone, format);
    }
    const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
    for (const part of format.formatToParts(ms)) if (part.type in out) out[/** @type {keyof typeof out} */ (part.type)] = Number(part.value);
    out.hour %= 24;
    return out;
}
/** `ms` truncated to its minute. @param {number} ms */
const toMinute = (ms) => ms - (((ms % MINUTE) + MINUTE) % MINUTE);
/** How far `timeZone`'s wall clock runs ahead of UTC at `ms`. @param {number} ms @param {string} timeZone */
function offsetAt(ms, timeZone) {
    const w = wallTime(ms, timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - toMinute(ms);
}
/**
 * The moment a wall-clock time in `timeZone` names: null when the clock
 * skips it (the hour lost when summer time starts); the earlier of the two
 * when the clock runs it twice (the hour gained when it ends).
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {string} [timeZone]
 * @returns {number | null}
 */
export function zonedTime(year, month, day, hour, minute, timeZone = CHART_TIME_ZONE) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    // The offsets a day either side cover any one change of the clock.
    const offsets = new Set([offsetAt(guess - DAY, timeZone), offsetAt(guess, timeZone), offsetAt(guess + DAY, timeZone)]);
    const candidates = [...offsets].map((o) => guess - o).sort((a, b) => a - b);
    for (const t of candidates) {
        const w = wallTime(t, timeZone);
        if (w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute) return t;
    }
    return null;
}
/** Two digits. @param {number} n */
const two = (n) => String(n).padStart(2, '0');
/**
 * The built-in way a chart prints a time (rule 52): `clock` `14:05`, `full`
 * `04/10/2026 14:05`, `tick` `14:00` below a day's stride and `04/10/2026`
 * from a day on, `range` `14:00–16:30` within one day of `timeZone` and
 * `03/10/2026 22:00 – 04/10/2026 02:00` across days. 24-hour, day before
 * month, no weekday or month name, in whatever language the page is.
 * @param {string} [timeZone] an IANA zone, `Europe/Brussels` by default
 * @returns {ChartTimeFormat}
 */
export function numericTime(timeZone = CHART_TIME_ZONE) {
    wallTime(0, timeZone); // an unknown zone fails here, at attach, not at the first hover
    /** @param {ReturnType<typeof wallTime>} w */
    const clock = (w) => `${two(w.hour)}:${two(w.minute)}`;
    /** @param {ReturnType<typeof wallTime>} w */
    const date = (w) => `${two(w.day)}/${two(w.month)}/${String(w.year).padStart(4, '0')}`;
    return (ms, style, ctx = {}) => {
        const w = wallTime(ms, timeZone);
        if (style === 'clock') return clock(w);
        if (style === 'tick') return (ctx.stride ?? 0) >= DAY ? date(w) : clock(w);
        if (style === 'range') {
            const a = wallTime(ctx.from ?? ms, timeZone);
            const b = wallTime(ctx.to ?? ms, timeZone);
            const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
            return sameDay ? `${clock(a)}–${clock(b)}` : `${date(a)} ${clock(a)} – ${date(b)} ${clock(b)}`;
        }
        return `${date(w)} ${clock(w)}`;
    };
}
/** What a trend's axis says while it has no line to name: two no-break spaces keep the row. */
export const BLANK = '\u00a0';
/** `YYYY-MM-DD` of a wall-clock date. @param {{ year: number, month: number, day: number }} w */
const dayKeyOf = (w) => `${w.year}-${two(w.month)}-${two(w.day)}`;
/**
 * The words under a key figure's trend (`data-kp-spark-axis="relative"`):
 * where it starts, as the first point's clock and its day (`14:40
 * yesterday`, `07:00 today`, or `08:10 02/10/2026` when older), and where it
 * ends: `now` while the last point is at most two steps old, else that
 * point's clock (`14:00`, with its day when it is not today's). Fewer than
 * two points: a no-break space each, so the row keeps its height. Days are
 * the wall clock's in `timeZone` (rule 52).
 * @param {readonly ChartPoint[]} points oldest first
 * @param {{ now: number, step?: number, timeZone?: string, time?: ChartTimeFormat,
 *   words?: { now: string, today: string, yesterday: string } }} context `step` is the points' spacing (10 min by
 *   default); `time` prints the clock and an older date (`numericTime(timeZone)` by default); `words` are the
 *   dictionary's `chartNow`, `chartToday` and `chartYesterday` unless given
 * @returns {[string, string]}
 */
export function trendAxis(points, { now, step = 600_000, timeZone = CHART_TIME_ZONE, time, words }) {
    if (points.length < 2) return [BLANK, BLANK];
    const print = time ?? numericTime(timeZone);
    const s = getStrings();
    const say = words ?? { now: s.chartNow, today: s.chartToday, yesterday: s.chartYesterday };
    const w = wallTime(now, timeZone);
    const today = dayKeyOf(w);
    const yesterday = dayKeyOf(wallTime(Date.UTC(w.year, w.month - 1, w.day - 1, 12), 'UTC'));
    /** @param {number} ms */
    const dayWord = (ms) => {
        const day = dayKeyOf(wallTime(ms, timeZone));
        if (day === today) return say.today;
        if (day === yesterday) return say.yesterday;
        return print(ms, 'tick', { stride: DAY });
    };
    const first = points[0][0];
    const last = points[points.length - 1][0];
    const left = `${print(first, 'clock', {})} ${dayWord(first)}`;
    const right =
        now - last <= 2 * step
            ? say.now
            : dayKeyOf(wallTime(last, timeZone)) === today
              ? print(last, 'clock', {})
              : `${print(last, 'clock', {})} ${dayWord(last)}`;
    return [left, right];
}
/** The sub-day strides a time axis may use, each a whole divisor of a day. */
const SUB_DAY_STRIDES = [15, 30, 60, 120, 180, 360, 720].map((m) => m * MINUTE);
/** The strides of a day or more, in days. */
const DAY_STRIDES = [1, 2, 3, 7, 14, 28];
/**
 * The distance between two time ticks over a window of `span`: the finest
 * the span allows (15 min up to 2 h, 30 min up to 4 h, 1 h up to 8 h, 3 h up
 * to 16 h, 6 h up to 1.2 days, a day beyond), coarser until no more than
 * `most` strides fit.
 * @param {number} span ms
 * @param {number} most
 */
export function tickStride(span, most) {
    const fit = Math.max(1, most);
    const least =
        span <= 2 * HOUR
            ? 15 * MINUTE
            : span <= 4 * HOUR
              ? 30 * MINUTE
              : span <= 8 * HOUR
                ? HOUR
                : span <= 16 * HOUR
                  ? 3 * HOUR
                  : span <= 28.8 * HOUR
                    ? 6 * HOUR
                    : DAY;
    for (const stride of SUB_DAY_STRIDES) if (stride >= least && span / stride <= fit) return stride;
    for (const days of DAY_STRIDES) if (days * DAY >= least && span / (days * DAY) <= fit) return days * DAY;
    let days = DAY_STRIDES[DAY_STRIDES.length - 1] * 2;
    while (span / (days * DAY) > fit) days *= 2;
    return days * DAY;
}
/**
 * The time ticks of a window: round wall-clock times in `timeZone` (six-hour
 * ticks on 00:00, 06:00, 12:00 and 18:00, day ticks at midnight), worked out
 * one by one, so a change of the clock inside the window neither moves them
 * off the round hour nor prints an hour twice. Weeks start on a Monday.
 * @param {number} from ms
 * @param {number} to ms
 * @param {number} most the most strides that fit (the plot's width over 70 px)
 * @param {string} [timeZone]
 * @returns {{ stride: number, ticks: number[] }}
 */
export function timeTicks(from, to, most, timeZone = CHART_TIME_ZONE) {
    if (!(to > from)) return { stride: tickStride(0, most), ticks: [] };
    const stride = tickStride(to - from, most);
    const a = wallTime(from, timeZone);
    const b = wallTime(to, timeZone);
    const first = Date.UTC(a.year, a.month - 1, a.day) / DAY;
    const last = Date.UTC(b.year, b.month - 1, b.day) / DAY;
    /** @type {Set<number>} */
    const ticks = new Set();
    for (let n = first; n <= last; n++) {
        const d = new Date(n * DAY);
        const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
        if (stride >= DAY) {
            const k = stride / DAY;
            // Day 0 (1 January 1970) was a Thursday: +3 puts Mondays on 0.
            if ((((n + 3) % k) + k) % k !== 0) continue;
            // A zone whose clock skips midnight starts that day at 01:00.
            const t = zonedTime(y, m, dd, 0, 0, timeZone) ?? zonedTime(y, m, dd, 1, 0, timeZone);
            if (t != null) ticks.add(t);
        } else {
            // Only the wall-clock minutes the window covers on its first and
            // last day: a hover redraws the whole group.
            const step = stride / MINUTE;
            const start = n === first ? Math.floor((a.hour * 60 + a.minute) / step) * step : 0;
            const end = n === last ? b.hour * 60 + b.minute : 24 * 60 - 1;
            for (let min = start; min <= end; min += step) {
                const t = zonedTime(y, m, dd, Math.floor(min / 60), min % 60, timeZone);
                if (t != null) ticks.add(t);
            }
        }
    }
    return { stride, ticks: [...ticks].filter((t) => t >= from && t <= to).sort((x, y) => x - y) };
}
