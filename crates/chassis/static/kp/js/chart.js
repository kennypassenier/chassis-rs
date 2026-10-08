// The one time chart every page draws, so its controls mean the same
// everywhere [scope-143]:
//
//   legend   hover / focus singles a source out (the others fade); a click
//            keeps it on or off, one or several, no modifier keys; Show all
//            and Esc reset
//   plot     a crosshair on every chart of the group, and a tooltip beside it
//            with each visible source's value, the time, the change over the
//            hour before (▲/▼ and the amount) and the events within reach; a
//            click pins the tooltip (✕ or Esc releases it)
//   drag     zooms every chart of the group to that span, with a "Zoomed ·
//            Reset" chip; a double-click or Esc resets
//   keys     ←/→ move the crosshair (Shift: ten points), Home/End, Enter
//            pins, Esc steps back: releases → shows all → resets the zoom
//   events   markers above the plot; hover shows the event, a click pins it
//            with its link
//   ranges   `[data-kp-chart-range]` buttons set the group's window
//   spark    `data-kp-chart="spark"`: the 24 h line of a tile, drawn by
//            drawSparkline() (js/kpi.js), on the group's crosshair
//   trend    the spark variant in a key figure (`.kp-kpi--trend`):
//            `data-kp-spark-head="none"` leaves out the name and value
//            line and reads a point in a chip over the line instead, on
//            the trend's own crosshair; `data-kp-spark-axis="relative"`
//            puts the axis under it (`14:40 yesterday` … `now`, see
//            trendAxis()); a click that was not a drag follows the
//            tile's `.kp-kpi__link`
//
// Under the lines a soft area while one or two sources are on; with three or
// more, the lines alone. Colours are the theme's `--chart-1..5` in order; from
// the sixth source on they come round again with a dashed line, so no two
// sources look alike.
//
// Every date and time a chart prints is dd/mm/yyyy HH:mm on a 24-hour clock
// in Europe/Brussels (rule 52), whatever the reader's zone and language:
// `attachCharts(root, { timeZone })` picks another zone, `{ time }` prints
// times its own way. The time axis lands on round wall-clock times in that
// zone, so a six-hour tick reads 00:00, 06:00, 12:00, 18:00 across a summer
// time change too.
//
//   <div class="kp-chart-group" data-kp-chart-group data-kp-chart-span="24h">
//       <div class="kp-chart-group__bar">
//           <div class="kp-chart-ranges" role="group" aria-label="Time range">
//               <button type="button" class="kp-button kp-button--sm" data-kp-chart-range="1h">1 h</button>
//               <button type="button" class="kp-button kp-button--sm" data-kp-chart-range="24h">24 h</button>
//           </div>
//           <span class="kp-chart-zoom" data-kp-chart-zoom hidden></span>
//       </div>
//       <figure class="kp-chart" data-kp-chart aria-label="Pressure">
//           <figcaption class="kp-chart__title">Pressure, bar</figcaption>
//           <script type="application/json" data-kp-chart-data>{ "unit": "bar", "series": [ … ] }</script>
//       </figure>
//   </div>
//
// The data comes from the page: a JSON child as above, or setChartData(el,
// data) before or after attachCharts(root). The words are the dictionary's
// (`chart…` in js/strings.js). Nothing runs on import; attachCharts(root)
// returns a detach, and detachChart(el) takes one chart away.
//
// A group is its element's across attachCharts() calls: a chart attached
// later joins the crosshair, the zoom and the range already there (charts
// outside any group element share one group per document). A zoom chip may
// sit anywhere on the page: `data-kp-chart-zoom-for="<group id>"`, else the
// group around it, else the document's. chartSelect() and chartZoom() drive
// a chart from the page (a table that presses a source, a page that resets
// its zoom); `decorate` marks every control a chart builds, each time it
// builds it.
//
// Every state has its look at the chart's final height: `data-kp-chart-
// loading` (the plot pulses, the legend row is kept for
// `data-kp-chart-sources="N"`), no readings (the `chartEmpty` words), an
// error (`{ error }` in the data), one reading (a dot, and with
// `onePointNote` the `chartOnePoint` words).
//
// `unitKind` prints values the dashboard's way: `bytes` and `bytes/s` in
// binary steps (`1.5 GiB`, `3.2 MiB/s`), `percent` (`7.5%`, an axis of 10,
// 25, 50 or 100, above 100 when a value is), `celsius`, `count` and `flag`
// (exact, `12,345`, except on the axis, `12.3k`). For a unit kind the axis
// ticks carry the unit.

import { resolveLocale } from './locale.js';
import { DEFAULT_STRINGS, getStrings } from './strings.js';
import { drawSparkline } from './kpi.js';

/** A chart: `data-kp-chart` (a plot) or `data-kp-chart="spark"`. */
export const CHART = '[data-kp-chart]';
/** Charts that share one crosshair, one zoom and one range. */
export const CHART_GROUP = '[data-kp-chart-group]';
/** Fired on a chart, bubbling, when its sources on change: `detail.on`, indexes (none = all shown). */
export const CHART_SELECT_EVENT = 'kp-chart-select';
/** Fired on a group, bubbling, when its zoom changes: `detail` `{ from, to }` or null. */
export const CHART_ZOOM_EVENT = 'kp-chart-zoom';
/** Fired on a group, bubbling, when a range button is pressed, before the charts redraw: `detail` `{ range, span }`. */
export const CHART_RANGE_EVENT = 'kp-chart-range';
/** The zone a chart prints its times in and aligns its time axis to, unless attachCharts() is given another (rule 52). */
export const CHART_TIME_ZONE = 'Europe/Brussels';
/** A key figure's 24-hour trend: the spark variant without its head line. */
export const TREND_CHART = '[data-kp-chart="spark"][data-kp-spark-head="none"]';

/**
 * @typedef {[number, number]} ChartPoint time (ms since the epoch), value
 * @typedef {object} ChartSeries
 * @property {string} label
 * @property {ChartPoint[]} [points] oldest first
 * @property {number} [start] with `step` and `values`: evenly spaced points, compact in JSON
 * @property {number} [step] ms
 * @property {number[]} [values]
 * @property {string} [colour] the consumer's own colour (`var(--…)`) instead of the next `--chart-n`
 * @property {number} [total] shown in the legend while no time is under the crosshair
 * @typedef {object} ChartEvent
 * @property {number} at ms since the epoch
 * @property {string} label
 * @property {'critical' | 'warning' | 'info'} [tone]
 * @property {string} [href] offered once the event is pinned
 * @typedef {'percent' | 'bytes' | 'bytes/s' | 'rate' | 'celsius' | 'count' | 'flag'} ChartUnitKind a value's kind:
 *   `bytes` and `bytes/s` (`rate` is the same) in binary steps, B to PiB; `percent` with an axis of 10, 25, 50 or
 *   100 (above 100 only when a value is); `celsius` whole degrees; `count` and `flag` exact numbers, abbreviated
 *   (`12.3k`) on the axis only
 * @typedef {'axis' | 'tip' | 'delta' | 'legend' | 'readout' | 'spark'} ChartValueWhere where a value is printed:
 *   `axis` a y-axis label, `tip` the tooltip's value, `delta` the tooltip's change over the hour before (its size),
 *   `legend` a legend button's value, `readout` what a screen reader hears, `spark` the spark variant's value
 * @typedef {(v: number, where: ChartValueWhere, chart: ChartData) => string | null | undefined} ChartValueFormat
 *   prints a value itself; anything but a string leaves it to the chart
 * @typedef {'source' | 'show-all' | 'zoom-reset' | 'release' | 'plot' | 'range'} ChartPartKind
 * @typedef {object} ChartDecorateInfo
 * @property {ChartPartKind} kind which control: a legend `source`, `show-all`, a zoom chip's `zoom-reset`, a pinned
 *   tooltip's `release` (✕), a chart's `plot`, a group's `range` button
 * @property {Element} host the chart's element (for `range` the group's, for `zoom-reset` the chip)
 * @property {string} [key] the chart's `key` (or `data-kp-key`), or the group element's `data-kp-key`
 * @property {number} [index] `source`: the source's place in `series`
 * @property {string} [label] `source`: the source's label
 * @property {string} [value] `range`: the range, as `data-kp-chart-range` names it
 * @typedef {(part: HTMLElement, info: ChartDecorateInfo) => void} ChartDecorate
 * @typedef {object} ChartData
 * @property {string} [label] the chart's name; else the element's `aria-label`
 * @property {string} [key] the chart's stable name for the page (written as `data-kp-key`, passed to `decorate`)
 * @property {string} [unit] printed after a value ("bar", "m³/h"); not on the axis
 * @property {ChartUnitKind} [unitKind] the value's kind, printed and scaled the dashboard's way, its unit on
 *   the axis too; `unit` and `digits` then do nothing
 * @property {number} [digits] fraction digits of a value; else by its size
 * @property {string} [error] why there are no readings: shown in the plot, at its height, instead of the lines
 * @property {boolean} [onePointNote] while every source has a single reading, say so under the plot (`chartOnePoint`)
 * @property {ChartSeries[]} series
 * @property {ChartEvent[]} [events]
 * @property {number} [from] the window, when the group's range should not set it
 * @property {number} [to]
 * @property {number} [yMax] the top of the axis; else a round number above the highest value
 * @property {number} [threshold] a dashed line (an alarm level)
 * @property {boolean} [stacked] sources on top of each other, as areas
 * @property {number} [height] px; else `--kp-chart-height` on the chart (px or rem), else 168
 * @typedef {{ from: number, to: number }} ChartWindow
 * @typedef {'clock' | 'tick' | 'full' | 'range'} ChartTimeStyle where a time is printed: `clock` the crosshair's
 *   and an event line's time, `tick` a time-axis label, `full` the tooltip's head, a marker's title and the readout,
 *   `range` the zoom chip
 * @typedef {object} ChartTimeContext
 * @property {number} [stride] `tick`: the distance between two ticks, ms (a day or more: the ticks are dates)
 * @property {number} [from] `range`: the zoom's start, ms
 * @property {number} [to] `range`: the zoom's end, ms
 * @typedef {(ms: number, style: ChartTimeStyle, ctx: ChartTimeContext) => string} ChartTimeFormat
 * @typedef {object} ChartOptions
 * @property {Partial<Strings>} [strings] any of the dictionary's `chart…` words, for these charts only
 * @property {string} [locale] the numbers; else the nearest `lang` above each group
 * @property {string} [timeZone] the IANA zone every printed time is in and the time axis is aligned to;
 *   `Europe/Brussels` by default
 * @property {ChartTimeFormat} [time] prints every time itself; `numericTime(timeZone)` by default
 * @property {ChartValueFormat} [format] prints values itself, `(v, where, chart) => string`; anything but a
 *   string falls back to formatChartValue()
 * @property {ChartDecorate} [decorate] called with every control a chart builds, each time it builds it (a
 *   rebuilt legend included), so the page can mark it
 * @property {() => number} [now] the moment a trend's axis counts from (`now`, `today`, `yesterday`);
 *   `Date.now()` by default
 * @typedef {ReturnType<typeof chartWords>} ChartStrings
 * @typedef {import('./strings.js').Strings} Strings
 */

/**
 * The words a chart says, from the dictionary (`chart…` in js/strings.js),
 * with the caller's own on top: `attachCharts(root, { strings })` takes any
 * of the dictionary's keys.
 * @param {Partial<Strings>} [overrides]
 */
export function chartWords(overrides) {
    const s = { ...getStrings(), ...overrides };
    return {
        plot: s.chartPlot,
        spark: s.chartSpark,
        sources: s.chartSources,
        source: s.chartSource,
        showAll: s.chartShowAll,
        showAllTitle: s.chartShowAllTitle,
        hintPointer: s.chartHintPointer,
        hintTouch: s.chartHintTouch,
        pinned: s.chartPinned,
        release: s.chartRelease,
        change: s.chartChange,
        open: s.chartOpen,
        mark: s.chartMark,
        zoomed: s.chartZoomed,
        zoomedSpan: s.chartZoomedSpan,
        // A consumer who reworded the chip before chartZoomedSpan existed
        // keeps their words, given the zoom's two ends.
        zoomedByEnds: s.chartZoomed !== DEFAULT_STRINGS.chartZoomed && s.chartZoomedSpan === DEFAULT_STRINGS.chartZoomedSpan,
        reset: s.chartReset,
        resetTitle: s.chartResetTitle,
        up: s.chartUp,
        down: s.chartDown,
        same: s.chartSame,
        now: s.chartNow,
        empty: s.chartEmpty,
        onePoint: s.chartOnePoint,
        loading: s.chartLoading,
        pinnedOutside: s.chartPinnedOutside,
        today: s.chartToday,
        yesterday: s.chartYesterday,
        trendKeys: s.chartTrendKeys,
    };
}

/**
 * The dash of the `i`-th source's line: none for the first five (each its
 * own `--chart-n`), one of three dashes when the colours come round again.
 * @param {number} i
 * @returns {0 | 1 | 2 | 3} 0 = solid
 */
export const dashOf = (i) => /** @type {0 | 1 | 2 | 3} */ (i < 5 ? 0 : (Math.floor(i / 5 - 1) % 3) + 1);

/**
 * "1h", "24h", "7d", "15m" in ms; anything else null.
 * @param {string | null | undefined} text
 * @returns {number | null}
 */
export function parseSpan(text) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|h|d)\s*$/.exec(text ?? '');
    if (!m) return null;
    return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[/** @type {'m' | 'h' | 'd'} */ (m[2])];
}

/** Binary byte units, a step of 1024 apart. */
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
/** @param {ChartUnitKind | undefined} kind */
const isBytes = (kind) => kind === 'bytes' || kind === 'bytes/s' || kind === 'rate';

/**
 * The top of the y axis: a round number just above the highest value. For
 * `percent` 10, 25, 50 or 100 (above 100 the round number, so nothing is
 * cut off); for `bytes` and `bytes/s` round in the binary unit the value is
 * printed in (2 GiB, not 1.86).
 * @param {number} v
 * @param {ChartUnitKind} [kind]
 * @returns {number}
 */
export function niceMax(v, kind) {
    if (kind === 'percent' && !(v > 100)) return v > 50 ? 100 : v > 25 ? 50 : v > 10 ? 25 : 10;
    if (isBytes(kind) && v >= 1024) {
        let unit = 1;
        for (let i = 1; i < BYTE_UNITS.length && v / unit >= 1024; i++) unit *= 1024;
        return niceMax(v / unit) * unit;
    }
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p;
    return 10 * p;
}

/** One number format per locale and digits. @type {Map<string, Intl.NumberFormat>} */
const NUMBERS = new Map();
/** @param {string} locale @param {number} min @param {number} max */
function numberFormat(locale, min, max) {
    const key = `${locale} ${min} ${max}`;
    let nf = NUMBERS.get(key);
    if (!nf) {
        nf = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
        NUMBERS.set(key, nf);
    }
    return nf;
}

/**
 * A value as a chart prints it, without a page's own `format`. With a
 * `unitKind`: `percent` one decimal under 10 (`7.5%`, `42%`, `0%`); `bytes`
 * in binary steps, a decimal under 100 of a unit (`512 B`, `1.5 GiB`,
 * `120 MiB`); `bytes/s` (or `rate`) the same per second (`3.2 MiB/s`);
 * `celsius` whole degrees (`54 °C`); `count` and `flag` exact and grouped
 * (`12,345`), on the axis only abbreviated (`12.3k`). The axis carries the
 * unit for a unit kind. Without one: `digits` (else by size) and `unit`
 * after it, not on the axis.
 * @param {number} v
 * @param {ChartValueWhere} [where]
 * @param {Pick<ChartData, 'unit' | 'unitKind' | 'digits'>} [data]
 * @param {string} [locale] the numbers' grouping and decimal sign; `en-GB` by default
 */
export function formatChartValue(v, where = 'tip', data = {}, locale = 'en-GB') {
    const kind = data.unitKind;
    /** @param {number} x @param {number} min @param {number} [max] */
    const n = (x, min, max = min) => numberFormat(locale, min, max).format(x);
    if (kind === 'percent') return `${n(v, v !== 0 && Math.abs(v) < 10 ? 1 : 0)}%`;
    if (isBytes(kind)) {
        let x = v;
        let i = 0;
        while (Math.abs(x) >= 1024 && i < BYTE_UNITS.length - 1) {
            x /= 1024;
            i++;
        }
        const text = `${n(x, Math.abs(x) >= 100 || i === 0 ? 0 : 1)} ${BYTE_UNITS[i]}`;
        return kind === 'bytes' ? text : `${text}/s`;
    }
    if (kind === 'celsius') return `${n(v, 0)} °C`;
    if (kind === 'count' || kind === 'flag') {
        const a = Math.abs(v);
        // Counters are exact (R-COUNT); only the axis, which has no room,
        // rounds a large one.
        if (where === 'axis') {
            if (a >= 1e7) return `${n(v / 1e6, 1)}M`;
            if (a >= 1e4) return `${n(v / 1e3, 1)}k`;
            if (a >= 100) return n(v, 0);
            return Number.isInteger(v) ? n(v, 0) : n(v, 2);
        }
        return n(v, 0, Number.isInteger(v) ? 0 : 2);
    }
    const digits = data.digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
    const text = n(v, data.digits ?? 0, digits);
    return where === 'axis' || !data.unit ? text : `${text} ${data.unit}`;
}

/**
 * The index of the point nearest to `t` (the points oldest first).
 * @param {readonly ChartPoint[]} points
 * @param {number} t
 */
export function indexAt(points, t) {
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid][0] < t) lo = mid;
        else hi = mid;
    }
    return Math.abs(points[hi][0] - t) < Math.abs(points[lo][0] - t) ? hi : lo;
}

/**
 * A source's change over the hour before point `i`: its value there minus
 * the value an hour of points earlier (or the first point).
 * @param {readonly ChartPoint[]} points
 * @param {number} i
 */
export function hourChange(points, i) {
    const step = points.length > 1 ? points[1][0] - points[0][0] || 3_600_000 : 3_600_000;
    const back = Math.max(0, i - Math.max(1, Math.round(3_600_000 / step)));
    return points[i][1] - points[back][1];
}

/**
 * The legend's selection after a click on source `i` of `n`: on or off,
 * several allowed; all on is the same as none (everything shown).
 * @param {ReadonlySet<number>} sel
 * @param {number} i
 * @param {number} n
 * @returns {Set<number>}
 */
export function toggleSource(sel, i, n) {
    const next = new Set(sel);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    if (next.size === n) next.clear();
    return next;
}

/**
 * The legend's selection after chartSelect(el, index, on): `null` shows
 * every source again; without `on` source `index` toggles, as a click does;
 * with `on` it is put on or off. Null when nothing changes (an index outside
 * `0..n-1`, or a source already as asked).
 * @param {ReadonlySet<number>} sel
 * @param {number | null} index
 * @param {number} n the number of sources
 * @param {boolean} [on]
 * @returns {Set<number> | null}
 */
export function nextSelection(sel, index, n, on) {
    if (index == null) return sel.size === 0 ? null : new Set();
    if (!Number.isInteger(index) || index < 0 || index >= n) return null;
    if (on !== undefined && on === sel.has(index)) return null;
    return toggleSource(sel, index, n);
}

/**
 * A series' points, whichever way it was given.
 * @param {ChartSeries} series
 * @returns {ChartPoint[]}
 */
export function pointsOf(series) {
    if (series.points) return series.points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const { start = 0, step = 60_000, values = [] } = series;
    /** @type {ChartPoint[]} */
    const out = [];
    values.forEach((v, at) => {
        if (Number.isFinite(v)) out.push([start + at * step, v]);
    });
    return out;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
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
const BLANK = '\u00a0';

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

/** The data a page gave a chart before or after it was attached. @type {WeakMap<Element, ChartData>} */
const DATA = new WeakMap();
/** The chart drawn in an element. @type {WeakMap<Element, ChartState>} */
const CHARTS = new WeakMap();
/** Every group by its element, whichever attachCharts() call made it. @type {WeakMap<Element, ChartGroup>} */
const GROUPS = new WeakMap();
/** The group of the charts outside any group element, one per document. @type {WeakMap<Document, ChartGroup>} */
const LOOSE = new WeakMap();
/** The group a zoom chip was given to. @type {WeakMap<Element, ChartGroup>} */
const CHIPS = new WeakMap();
/** A document's live groups and its one Esc listener. @type {WeakMap<Document, { groups: Set<ChartGroup>, onEsc: (e: KeyboardEvent) => void }>} */
const PAGES = new WeakMap();

/**
 * @typedef {object} ChartState
 * @property {HTMLElement} host
 * @property {boolean} spark
 * @property {ChartGroup} group
 * @property {() => void} draw
 * @property {(t: number | null, own: boolean) => void} cursorAt
 * @property {(data: ChartData) => void} setData
 * @property {(i: number | null, on?: boolean) => boolean} select
 * @property {() => number | null} lastTime
 * @property {() => void} destroy
 * @property {() => void} unobserve set by attachCharts(): its resize watch off
 *
 * @typedef {object} ChartContext what one attachCharts() call gives its charts
 * @property {ChartStrings} strings
 * @property {ChartTimeFormat} time
 * @property {string} timeZone
 * @property {ChartValueFormat | undefined} format
 * @property {ChartDecorate | undefined} decorate
 * @property {() => number} now
 */

/**
 * Give a chart its sources and events (the page's own data). Before the chart
 * is attached the data waits for it; a `<script type="application/json"
 * data-kp-chart-data>` child is the markup way to do the same. Data ends a
 * `data-kp-chart-loading` the element carries. Called again (a live
 * update), the chart keeps its crosshair, pin, zoom, selection and focus;
 * only new sources reset the selection (with a `kp-chart-select` of `[]`).
 * @param {Element} el the `[data-kp-chart]` element
 * @param {ChartData} data
 */
export function setChartData(el, data) {
    DATA.set(el, data);
    el.removeAttribute('data-kp-chart-loading');
    CHARTS.get(el)?.setData(data);
}

/**
 * @typedef {object} TrendData a key figure's trend, the short way
 * @property {ChartPoint[]} points `[[ms, value]…]`, oldest first
 * @property {number} [step] the points' spacing, ms (the axis says `now` while the last is at most two steps old)
 * @property {string} [unit]
 * @property {ChartUnitKind} [unitKind]
 * @property {number} [digits]
 */

/**
 * Give a key figure's trend its points: setChartData() with one source, the
 * short way. `null` is loading: the trend stays empty at its final height
 * and the tile around it is `aria-busy` until data comes. An empty
 * `points` is a tile with no trend.
 * @param {Element} figure the `[data-kp-chart="spark"]` element
 * @param {TrendData | null} data
 */
export function setTrendData(figure, data) {
    if (data == null) {
        figure.setAttribute('data-kp-chart-loading', '');
        CHARTS.get(figure)?.draw();
        return;
    }
    const { points, step, unit, unitKind, digits } = data;
    setChartData(figure, { unit, unitKind, digits, series: [{ label: figure.getAttribute('aria-label') ?? '', points, step }] });
}

/**
 * Press legend source `index` of a chart, the way a click does: on or off
 * (a toggle without `on`, else on when `on` is true and off when false), or
 * with `null` every source shown again. Fires `kp-chart-select` when the
 * selection changes. For a page that drives the chart from elsewhere (a
 * table whose row presses its source).
 * @param {Element} el the `[data-kp-chart]` element
 * @param {number | null} index
 * @param {boolean} [on]
 * @returns {boolean} whether the selection changed
 */
export function chartSelect(el, index, on) {
    return CHARTS.get(el)?.select(index, on) ?? false;
}

/**
 * Zoom a group to `zoom` (ms), or with `null` show its whole range again,
 * the way a drag and Reset do; fires `kp-chart-zoom`. `el` is a chart, a
 * group element (or anything inside one), or the document (its charts
 * outside any group).
 * @param {Element | Document} el
 * @param {ChartWindow | null} zoom
 * @returns {boolean} whether a group was found
 */
export function chartZoom(el, zoom) {
    const group = groupOf(el);
    if (!group) return false;
    group.setZoom(zoom && zoom.to > zoom.from ? { from: zoom.from, to: zoom.to } : null);
    return true;
}

/**
 * Take one chart away: its drawn parts, its place in its group and its
 * resize watch. The rest of its group draws on; a group left with no chart
 * lets go of its range buttons and zoom chips. The page's data stays, so
 * attaching again draws it.
 * @param {Element} el the `[data-kp-chart]` element
 * @returns {boolean} whether a chart was attached there
 */
export function detachChart(el) {
    const state = CHARTS.get(el);
    if (!state) return false;
    CHARTS.delete(el);
    state.unobserve();
    state.destroy();
    const { group } = state;
    group.charts.delete(state);
    if (group.charts.size === 0) group.stop();
    // The newest point of the group may have gone with it.
    else for (const c of group.charts) c.draw();
    return true;
}

/** @param {Element | Document} el @returns {ChartGroup | null} */
function groupOf(el) {
    if (el.nodeType === 9) return LOOSE.get(/** @type {Document} */ (el)) ?? null;
    const element = /** @type {Element} */ (el);
    const state = CHARTS.get(element);
    if (state) return state.group;
    const groupEl = element.closest(CHART_GROUP);
    if (groupEl) return GROUPS.get(groupEl) ?? null;
    return LOOSE.get(element.ownerDocument) ?? null;
}

/**
 * The group a zoom chip belongs to, as a key: `data-kp-chart-zoom-for`'s
 * element, else the group element around the chip, else the document.
 * @param {Element} chip
 * @returns {Element | Document | null}
 */
function chipKey(chip) {
    const doc = chip.ownerDocument;
    const id = chip.getAttribute('data-kp-chart-zoom-for');
    if (id) return doc.getElementById(id);
    return chip.closest(CHART_GROUP) ?? doc;
}

/** The data in a chart's JSON child, if any. @param {Element} el @returns {ChartData | null} */
function dataInMarkup(el) {
    const script = el.querySelector(':scope > script[type="application/json"][data-kp-chart-data]');
    if (!script) return null;
    try {
        return JSON.parse(script.textContent ?? '');
    } catch {
        return null;
    }
}

const SVGNS = 'http://www.w3.org/2000/svg';
let clipIds = 0;

/**
 * An element with attributes and children.
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @param {...(Node | string)} kids
 * @returns {HTMLElement}
 */
function h(doc, tag, attrs = {}, ...kids) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    el.append(...kids);
    return el;
}

/**
 * An SVG element with attributes.
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @returns {SVGElement}
 */
function s(doc, tag, attrs = {}) {
    const el = /** @type {SVGElement} */ (doc.createElementNS(SVGNS, tag));
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
    return el;
}

/**
 * Hand a control to the page's `decorate`, the info without its empty
 * fields. A throwing decorate is the page's fault and must not stop the
 * chart drawing.
 * @param {ChartDecorate | undefined} decorate
 * @param {HTMLElement} part
 * @param {ChartDecorateInfo} info
 */
function decorateWith(decorate, part, info) {
    if (!decorate) return;
    /** @type {Record<string, unknown>} */
    const clean = {};
    for (const [k, v] of Object.entries(info)) if (v != null) clean[k] = v;
    try {
        decorate(part, /** @type {ChartDecorateInfo} */ (clean));
    } catch (error) {
        globalThis.reportError?.(error);
    }
}

/** Charts that share one crosshair, one zoom and one range, across attachCharts() calls. */
class ChartGroup {
    /**
     * @param {HTMLElement | null} el the `[data-kp-chart-group]`, or none (the document's loose charts)
     * @param {Document} doc
     * @param {ChartContext} ctx the first call's words and times, for the chips
     */
    constructor(el, doc, ctx) {
        this.el = el;
        this.doc = doc;
        this.ctx = ctx;
        /** @type {Set<ChartState>} */
        this.charts = new Set();
        /** @type {ChartWindow | null} */
        this.zoom = null;
        /** The chart the crosshair was last moved on: the only one, unpinned, that shows its tooltip. @type {ChartState | null} */
        this.owner = null;
        this.span = parseSpan(el?.dataset.kpChartSpan);
        /** @type {(() => void)[]} */
        this.stops = [];
        /** Every chip given to this group, and its words. @type {Map<HTMLElement, HTMLElement>} */
        this.chips = new Map();
        if (el) {
            GROUPS.set(el, this);
            this.wireRanges();
        } else LOOSE.set(doc, this);
        let page = PAGES.get(doc);
        if (!page) {
            // Esc anywhere outside a chart (and outside a dialog) resets
            // every zoom on the page.
            /** @param {KeyboardEvent} e */
            const onEsc = (e) => {
                if (e.key !== 'Escape') return;
                const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
                if (target?.closest('.kp-chart__plot, dialog')) return;
                for (const group of PAGES.get(doc)?.groups ?? []) if (group.zoom) group.setZoom(null);
            };
            page = { groups: new Set(), onEsc };
            PAGES.set(doc, page);
            doc.addEventListener('keydown', onEsc);
        }
        page.groups.add(this);
        this.bindChips();
    }

    /** Take every chip on the page that names this group and is not taken yet. */
    bindChips() {
        const key = this.el ?? this.doc;
        for (const chip of /** @type {HTMLElement[]} */ ([...this.doc.querySelectorAll('[data-kp-chart-zoom]')])) {
            if (!CHIPS.has(chip) && chipKey(chip) === key) this.bindChip(chip);
        }
    }

    /** @param {HTMLElement} chip */
    bindChip(chip) {
        const { strings, decorate } = this.ctx;
        const doc = this.doc;
        const text = h(doc, 'span');
        const reset = h(doc, 'button', { type: 'button', class: 'kp-chart-zoom__reset', title: strings.resetTitle }, strings.reset);
        reset.addEventListener('click', () => this.setZoom(null));
        chip.classList.add('kp-chart-zoom');
        chip.setAttribute('role', 'status');
        chip.replaceChildren(text, reset);
        chip.hidden = this.zoom == null;
        if (this.zoom) text.textContent = this.zoomText(this.zoom);
        CHIPS.set(chip, this);
        this.chips.set(chip, text);
        decorateWith(decorate, reset, { kind: 'zoom-reset', host: chip, key: this.el?.getAttribute('data-kp-key') ?? undefined });
    }

    wireRanges() {
        const el = /** @type {HTMLElement} */ (this.el);
        const buttons = /** @type {HTMLElement[]} */ ([...el.querySelectorAll('[data-kp-chart-range]')]).filter((b) => b.closest(CHART_GROUP) === el);
        const paint = () => {
            for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.kpChartRange === el.dataset.kpChartSpan));
        };
        /** @param {Event} event */
        const onClick = (event) => {
            const button = /** @type {HTMLElement} */ (event.currentTarget);
            const range = button.dataset.kpChartRange ?? '';
            const span = parseSpan(range);
            if (span == null) return;
            el.dataset.kpChartSpan = range;
            this.span = span;
            paint();
            this.zoom = null;
            // The page may hand the charts new data for this range first.
            el.dispatchEvent(new CustomEvent(CHART_RANGE_EVENT, { bubbles: true, detail: { range, span } }));
            this.setZoom(null);
        };
        for (const b of buttons) {
            b.addEventListener('click', onClick);
            decorateWith(this.ctx.decorate, b, {
                kind: 'range',
                host: el,
                key: el.getAttribute('data-kp-key') ?? undefined,
                value: b.dataset.kpChartRange,
            });
        }
        paint();
        this.stops.push(() => buttons.forEach((b) => b.removeEventListener('click', onClick)));
    }

    /** The newest point of any plot in the group. */
    end() {
        let end = -Infinity;
        for (const c of this.charts) if (!c.spark) end = Math.max(end, c.lastTime() ?? -Infinity);
        return Number.isFinite(end) ? end : null;
    }

    /** @param {ChartWindow | null} zoom */
    setZoom(zoom) {
        this.zoom = zoom;
        for (const c of this.charts) c.draw();
        // A chip the page added since the group was made.
        this.bindChips();
        for (const [chip, text] of this.chips) {
            chip.hidden = zoom == null;
            if (zoom) text.textContent = this.zoomText(zoom);
        }
        (this.el ?? this.doc).dispatchEvent(new CustomEvent(CHART_ZOOM_EVENT, { bubbles: true, detail: zoom }));
    }

    /**
     * The chip's words for a zoom: its span in the `range` style (dates
     * once it spans more than one day).
     * @param {ChartWindow} zoom
     */
    zoomText(zoom) {
        const { strings, time, timeZone } = this.ctx;
        if (!strings.zoomedByEnds) return strings.zoomedSpan(time(zoom.from, 'range', { from: zoom.from, to: zoom.to }));
        const a = wallTime(zoom.from, timeZone);
        const b = wallTime(zoom.to, timeZone);
        const style = a.year === b.year && a.month === b.month && a.day === b.day ? 'clock' : 'full';
        return strings.zoomed(time(zoom.from, style, {}), time(zoom.to, style, {}));
    }

    /** @param {number | null} t @param {ChartState | null} owner */
    cursor(t, owner) {
        this.owner = owner;
        for (const c of this.charts) c.cursorAt(t, c === owner);
    }

    /** No chart left: let go of the page. */
    stop() {
        for (const f of this.stops) f();
        for (const chip of this.chips.keys()) {
            chip.replaceChildren();
            chip.hidden = true;
            CHIPS.delete(chip);
        }
        this.chips.clear();
        if (this.el) {
            if (GROUPS.get(this.el) === this) GROUPS.delete(this.el);
        } else if (LOOSE.get(this.doc) === this) LOOSE.delete(this.doc);
        const page = PAGES.get(this.doc);
        page?.groups.delete(this);
        if (page && page.groups.size === 0) {
            this.doc.removeEventListener('keydown', page.onEsc);
            PAGES.delete(this.doc);
        }
    }
}

/**
 * Draw every `[data-kp-chart]` under `root` and wire it: the charts of one
 * `[data-kp-chart-group]` (or, outside any group, all the others on the
 * page) share their crosshair, zoom and range, also with charts an earlier
 * or a later call attached. A chart's data comes from its JSON child or from
 * setChartData(), before or after this runs.
 * Every time is printed as dd/mm/yyyy HH:mm (or a part of it) on a 24-hour
 * clock in `timeZone`, Europe/Brussels by default, whatever the page's
 * language (rule 52); `time` prints them another way.
 * @param {ParentNode} [root]
 * @param {ChartOptions} [options] `strings`: any of the dictionary's `chart…` words for these charts only;
 *   `locale`: the numbers, else the nearest `lang` above each group; `timeZone`: the zone of every printed time
 *   and of the time axis; `time`: prints every time itself (`(ms, style, ctx) => string`); `format`: prints
 *   values itself (`(v, where, chart) => string`); `decorate`: marks every control a chart builds
 * @returns {() => void} detach: these charts taken away (detachChart() each)
 */
export function attachCharts(root = document, options = {}) {
    return attachMatching(root, options, CHART);
}

/**
 * Draw only the key figures' trends under `root` (`TREND_CHART`), with the
 * options attachCharts() takes; for a page that wires its trends apart from
 * its other charts. attachCharts() draws them too.
 * @param {ParentNode} [root]
 * @param {ChartOptions} [options]
 * @returns {() => void} detach
 */
export function attachTrendCharts(root = document, options = {}) {
    return attachMatching(root, options, TREND_CHART);
}

/**
 * attachCharts() over the elements `selector` finds.
 * @param {ParentNode} root
 * @param {ChartOptions} options
 * @param {string} selector
 * @returns {() => void}
 */
function attachMatching(root, options, selector) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    if (!view) return () => {};
    // Times are numeric in one zone (rule 52), not the page's language; a
    // chart's numbers are the locale given, else the nearest `lang` above
    // its group (or above the chart, outside a group).
    const timeZone = options.timeZone ?? CHART_TIME_ZONE;
    /** @type {ChartContext} */
    const ctx = {
        strings: chartWords(options.strings),
        time: options.time ?? numericTime(timeZone),
        timeZone,
        format: options.format,
        decorate: options.decorate,
        now: options.now ?? (() => Date.now()),
    };

    /** @type {Set<ChartGroup>} */
    const touched = new Set();
    /** @type {ChartState[]} */
    const states = [];
    const resize = new view.ResizeObserver((entries) => {
        for (const entry of entries) CHARTS.get(entry.target)?.draw();
    });
    for (const host of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)])) {
        if (CHARTS.has(host)) continue;
        const groupEl = /** @type {HTMLElement | null} */ (host.closest(CHART_GROUP));
        const group = (groupEl ? GROUPS.get(groupEl) : LOOSE.get(doc)) ?? new ChartGroup(groupEl, doc, ctx);
        const locale = resolveLocale(options.locale, groupEl ?? host);
        const state = host.dataset.kpChart === 'spark' ? sparkChart(host, group, locale, ctx) : plotChart(host, group, locale, ctx);
        state.unobserve = () => resize.unobserve(host);
        CHARTS.set(host, state);
        group.charts.add(state);
        touched.add(group);
        states.push(state);
        resize.observe(host);
    }
    // The window of a range depends on every chart's newest point: draw once
    // all of a group are in, the charts already there included.
    for (const group of touched) {
        group.bindChips();
        for (const c of group.charts) c.draw();
    }

    return () => {
        for (const state of states) if (CHARTS.get(state.host) === state) detachChart(state.host);
        resize.disconnect();
    };
}

/**
 * The colour hooks of source `i` on an element: `data-kp-series` (1-5, its
 * `--chart-n`), `data-kp-dash` from the sixth on, or the series' own colour.
 * @param {Element} el
 * @param {ChartSeries} series
 * @param {number} i
 */
function paintSeries(el, series, i) {
    el.setAttribute('data-kp-series', String((i % 5) + 1));
    const dash = dashOf(i);
    if (dash) el.setAttribute('data-kp-dash', String(dash));
    if (series.colour) /** @type {HTMLElement | SVGElement} */ (el).style.setProperty('--kp-chart-series', series.colour);
}

/**
 * A chart's value printer: the page's `format` first, else formatChartValue().
 * @param {string} locale
 * @param {ChartContext} ctx
 * @param {() => ChartData} current the chart's data now
 * @returns {(v: number, where: ChartValueWhere) => string}
 */
function valueFormat(locale, ctx, current) {
    return (v, where) => {
        const data = current();
        const own = ctx.format?.(v, where, data);
        return typeof own === 'string' ? own : formatChartValue(v, where, data, locale);
    };
}

/**
 * A plot's height: its data's, else `--kp-chart-height` on the chart (px or
 * rem), else 168.
 * @param {HTMLElement} host
 * @param {ChartData} data
 */
function chartHeight(host, data) {
    if (data.height != null) return data.height;
    const view = host.ownerDocument.defaultView;
    const raw = view?.getComputedStyle(host).getPropertyValue('--kp-chart-height').trim() ?? '';
    const m = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(raw);
    if (!view || !m) return 168;
    const n = Number(m[1]);
    return m[2] === 'rem' ? n * (parseFloat(view.getComputedStyle(host.ownerDocument.documentElement).fontSize) || 16) : n;
}

/**
 * The full chart: axes, sources, events, legend, tooltip, readout.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState}
 */
function plotChart(host, group, locale, ctx) {
    const doc = host.ownerDocument;
    const { strings, time, decorate } = ctx;
    /** @type {ChartData} */
    let data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
    /** @type {ChartPoint[][]} */
    let points = [];
    const fmt = valueFormat(locale, ctx, () => data);
    /** @type {Set<number>} */
    let sel = new Set();
    /** @type {number | null} */
    let hot = null;
    /** @type {number | null} */
    let pinned = null;
    /** @type {number | null} */
    let cursor = null;
    /** @type {{ x0: number, x1: number } | null} */
    let brush = null;
    const clip = `kp-chart-clip-${++clipIds}`;
    const label = () => data.label ?? host.getAttribute('aria-label') ?? '';
    const key = () => data.key ?? host.getAttribute('data-kp-key') ?? undefined;
    /** The time axis of the last window drawn: a hover redraws, the window stays. */
    let axisMemo = { key: '', axis: { stride: 0, ticks: /** @type {number[]} */ ([]) } };
    /** The state the plot shows instead of lines, and its words, as last drawn. */
    let shown = '';

    host.classList.add('kp-chart');
    const plot = h(doc, 'div', { class: 'kp-chart__plot', tabindex: '0', role: 'application' });
    // The tooltip's parts stay: a live update changes their words, so a
    // focused ✕ keeps its focus.
    const tipTime = h(doc, 'b');
    const release = h(doc, 'button', { type: 'button', class: 'kp-chart__release', 'aria-label': strings.release, title: strings.release }, '✕');
    const pinWord = h(doc, 'span');
    const pin = h(doc, 'span', { class: 'kp-chart__pin' }, pinWord, release);
    const tipRows = h(doc, 'div', { class: 'kp-chart__tip-rows' });
    const tipFoot = h(doc, 'p', { class: 'kp-chart__tip-foot' }, strings.change);
    const tipEvents = h(doc, 'div', { class: 'kp-chart__tip-events' });
    const tip = h(doc, 'div', { class: 'kp-chart__tip' }, h(doc, 'p', { class: 'kp-chart__tip-head' }, tipTime, pin), tipRows, tipFoot, tipEvents);
    tip.hidden = true;
    const note = h(doc, 'p', { class: 'kp-chart__note' }, strings.onePoint);
    note.hidden = true;
    const readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
    const legend = h(doc, 'div', { class: 'kp-chart__legend', role: 'group' });
    const showAll = h(doc, 'button', { type: 'button', class: 'kp-chart__show-all', title: strings.showAllTitle }, strings.showAll);
    showAll.hidden = true;
    const hint = h(
        doc,
        'p',
        { class: 'kp-chart__hint' },
        h(doc, 'span', { 'data-kp-when': 'pointer' }, strings.hintPointer),
        h(doc, 'span', { 'data-kp-when': 'touch' }, strings.hintTouch),
    );
    const parts = [plot, tip, note, readout, legend, hint];
    host.append(...parts);

    /** @type {{ button: HTMLElement, value: HTMLElement }[]} */
    let items = [];
    /** The legend row holds skeletons while the chart loads. */
    let skeleton = false;
    /** @type {null | { x: (t: number) => number, inv: (px: number) => number, W: number, P: { l: number, r: number, t: number, b: number }, from: number, to: number, svg: SVGSVGElement }} */
    let geo = null;

    const visible = () => points.map((_, i) => i).filter((i) => sel.size === 0 || sel.has(i));
    /** @returns {ChartWindow | null} */
    const range = () => {
        if (group.zoom) return group.zoom;
        const first = Math.min(...points.map((p) => p[0]?.[0] ?? Infinity));
        const to = data.to ?? group.end() ?? Math.max(...points.map((p) => p[p.length - 1]?.[0] ?? -Infinity));
        let from = data.from ?? (group.span != null ? to - group.span : first);
        // One reading and no range: an hour up to it, so its dot is drawn.
        if (from === to && data.from == null) from = to - HOUR;
        return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
    };
    /** @param {Set<number>} next */
    const setSel = (next) => {
        sel = next;
        host.dispatchEvent(new CustomEvent(CHART_SELECT_EVENT, { bubbles: true, detail: { on: [...sel].sort((a, b) => a - b) } }));
    };
    /** Mark the chart's own controls again (its key may have changed). */
    const decorateOwn = () => {
        decorateWith(decorate, plot, { kind: 'plot', host, key: key() });
        decorateWith(decorate, showAll, { kind: 'show-all', host, key: key() });
        decorateWith(decorate, release, { kind: 'release', host, key: key() });
    };

    function buildLegend() {
        skeleton = false;
        legend.removeAttribute('aria-hidden');
        legend.setAttribute('aria-label', strings.sources(label()));
        plot.setAttribute('aria-label', strings.plot(label()));
        items = data.series.map((series, i) => {
            const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
            const value = h(doc, 'b', { class: 'kp-chart__value' });
            const button = h(
                doc,
                'button',
                { type: 'button', class: 'kp-chart__source', title: strings.source(series.label) },
                swatch,
                h(doc, 'span', { class: 'kp-chart__source-label' }, series.label),
                value,
            );
            paintSeries(button, series, i);
            const isolate = (/** @type {number | null} */ v) => () => {
                hot = v;
                draw();
            };
            button.addEventListener('pointerenter', isolate(i));
            button.addEventListener('pointerleave', isolate(null));
            button.addEventListener('focus', isolate(i));
            button.addEventListener('blur', isolate(null));
            button.addEventListener('click', () => {
                setSel(toggleSource(sel, i, data.series.length));
                draw();
            });
            decorateWith(decorate, button, { kind: 'source', host, key: key(), index: i, label: series.label });
            return { button, value };
        });
        legend.replaceChildren(...items.map((it) => it.button), showAll);
    }

    /** The legend row kept for `data-kp-chart-sources` sources while loading. */
    function skeletonLegend() {
        const n = Number(host.getAttribute('data-kp-chart-sources'));
        skeleton = true;
        items = [];
        legend.setAttribute('aria-hidden', 'true');
        legend.replaceChildren(
            ...Array.from({ length: n > 1 ? Math.min(n, 50) : 0 }, () => {
                const stub = h(doc, 'span', { class: 'kp-chart__source-stub kp-skeleton kp-skeleton--block' }, '\u2007'.repeat(12));
                // A source button's height, not a block skeleton's.
                stub.style.setProperty('--kp-skeleton-block', 'auto');
                return stub;
            }),
        );
        legend.hidden = !(n > 1);
    }

    showAll.addEventListener('click', () => {
        setSel(new Set());
        draw();
    });
    legend.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || sel.size === 0) return;
        e.stopPropagation();
        setSel(new Set());
        draw();
    });
    release.addEventListener('click', () => {
        pinned = null;
        draw();
        plot.focus();
    });

    /**
     * The plot at its height with no lines: loading (a pulse), empty or an
     * error (a sentence), so the card keeps its place in every state.
     * @param {'loading' | 'empty' | 'error'} kind
     * @param {number} H
     */
    function drawState(kind, H) {
        geo = null;
        tip.hidden = true;
        note.hidden = true;
        hint.hidden = true;
        const box = h(doc, 'div', {
            class: kind === 'loading' ? 'kp-chart__state kp-skeleton kp-skeleton--block' : 'kp-chart__state',
            'data-kp-state': kind,
        });
        // The plot's own height, borders and padding inside it.
        box.style.boxSizing = 'border-box';
        box.style.blockSize = `${H}px`;
        const words = kind === 'loading' ? strings.loading : kind === 'error' ? (data.error ?? '') : strings.empty;
        if (kind === 'loading') box.append(h(doc, 'span', { class: 'kp-sr-only' }, words));
        else if (kind === 'error')
            box.append(
                h(
                    doc,
                    'div',
                    { class: 'kp-chart__state-text' },
                    h(doc, 'i', { class: 'kp-chart__dot', 'data-kp-tone': 'critical', 'aria-hidden': 'true' }),
                    words,
                ),
            );
        else box.append(h(doc, 'div', { class: 'kp-chart__state-text' }, words));
        plot.replaceChildren(box);
        // Said once, not on every redraw.
        if (shown !== `${kind} ${words}`) {
            shown = `${kind} ${words}`;
            if (kind !== 'loading') readout.textContent = `${label()}: ${words}`;
        }
    }

    function draw() {
        const H = chartHeight(host, data);
        const loading = host.hasAttribute('data-kp-chart-loading');
        plot.setAttribute('aria-busy', String(loading));
        if (loading) {
            skeletonLegend();
            drawState('loading', H);
            return;
        }
        if (skeleton) buildLegend();
        legend.hidden = data.series.length <= 1;
        if (data.error) {
            drawState('error', H);
            return;
        }
        const win = range();
        if (!win || points.every((p) => p.length === 0)) {
            drawState('empty', H);
            return;
        }
        shown = '';
        hint.hidden = data.series.length <= 1;
        const { from, to } = win;
        const W = Math.max(240, plot.clientWidth);
        const vis = visible();
        const stacked = data.stacked ?? false;
        const kind = data.unitKind;
        const inR = (/** @type {ChartPoint} */ p) => p[0] >= from && p[0] <= to;
        let hi = data.yMax ?? 0;
        if (data.yMax == null) {
            if (stacked) {
                (points[0] ?? []).forEach((p, k) => {
                    if (inR(p))
                        hi = Math.max(
                            hi,
                            vis.reduce((sum, si) => sum + (points[si][k]?.[1] ?? 0), 0),
                        );
                });
            } else for (const si of vis) for (const p of points[si]) if (inR(p)) hi = Math.max(hi, p[1]);
            if (data.threshold != null) hi = Math.max(hi, data.threshold * 1.08);
            hi = niceMax(hi, kind);
        }
        const ticksY = [0, hi / 2, hi].map((v) => fmt(v, 'axis'));
        const P = { l: Math.max(30, Math.max(...ticksY.map((t) => t.length)) * 7 + 12), r: 10, t: 18, b: 22 };
        const x = (/** @type {number} */ t) => P.l + ((t - from) / (to - from)) * (W - P.l - P.r);
        const y = (/** @type {number} */ v) => H - P.b - (v / hi) * (H - P.t - P.b);
        const svg = /** @type {SVGSVGElement} */ (s(doc, 'svg', { viewBox: `0 0 ${W} ${H}`, height: H, 'aria-hidden': 'true' }));
        const defs = s(doc, 'defs');
        const cp = s(doc, 'clipPath', { id: clip });
        cp.append(s(doc, 'rect', { x: P.l, y: 0, width: W - P.l - P.r, height: H }));
        defs.append(cp);
        svg.append(defs);
        [0, hi / 2, hi].forEach((v, k) => {
            svg.append(s(doc, 'line', { class: 'kp-chart__grid', x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }));
            const tick = s(doc, 'text', { class: 'kp-chart__tick', x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end' });
            tick.textContent = ticksY[k];
            svg.append(tick);
        });
        // Time ticks on round wall-clock times in the group's zone: 15 or
        // 30 min, one, two, three, six or twelve hours, or days (the
        // dashboard's tiers, with 30 min and 3 h added so a zoomed span keeps
        // more than one tick), at least 70 px apart.
        const most = Math.max(2, Math.floor((W - P.l - P.r) / 70));
        const axisKey = `${from} ${to} ${most} ${ctx.timeZone}`;
        if (axisKey !== axisMemo.key) axisMemo = { key: axisKey, axis: timeTicks(from, to, most, ctx.timeZone) };
        const { axis } = axisMemo;
        for (const t of axis.ticks) {
            const tick = s(doc, 'text', { class: 'kp-chart__tick', x: x(t), y: H - 6, 'text-anchor': 'middle' });
            tick.textContent = time(t, 'tick', { stride: axis.stride });
            svg.append(tick);
        }
        const g = s(doc, 'g', { 'clip-path': `url(#${clip})` });
        svg.append(g);
        if (data.threshold != null)
            g.append(s(doc, 'line', { class: 'kp-chart__threshold', x1: P.l, x2: W - P.r, y1: y(data.threshold), y2: y(data.threshold) }));
        const events = (data.events ?? []).filter((ev) => ev.at >= from && ev.at <= to);
        for (const ev of events) g.append(s(doc, 'line', { class: 'kp-chart__event-line', x1: x(ev.at), x2: x(ev.at), y1: P.t - 4, y2: H - P.b }));
        const base = (points[0] ?? []).map(() => 0);
        const fill = vis.length <= 2 && !stacked;
        data.series.forEach((series, si) => {
            if (!vis.includes(si)) return;
            const pts = points[si].map((p, k) => [x(p[0]), y(stacked ? (base[k] ?? 0) + p[1] : p[1])]);
            if (pts.length === 0) return;
            const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
            const sg = s(doc, 'g', { class: 'kp-chart__series' });
            paintSeries(sg, series, si);
            if (hot != null) sg.setAttribute('data-kp-state', hot === si ? 'hot' : 'dim');
            if (stacked) {
                const back = points[si]
                    .map((p, k) => [x(p[0]), y(base[k] ?? 0)])
                    .reverse()
                    .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                    .join('');
                sg.append(s(doc, 'path', { class: 'kp-chart__area kp-chart__area--stacked', d: `${d}${back}Z` }));
                points[si].forEach((p, k) => (base[k] = (base[k] ?? 0) + p[1]));
            } else if (fill) {
                const last = pts[pts.length - 1];
                sg.append(
                    s(doc, 'path', {
                        class: vis.length === 1 ? 'kp-chart__area kp-chart__area--alone' : 'kp-chart__area',
                        d: `${d}L${last[0]},${y(0)}L${pts[0][0]},${y(0)}Z`,
                    }),
                );
            }
            sg.append(s(doc, 'path', { class: 'kp-chart__line', d }));
            g.append(sg);
            // A lone reading's dot outside the clip, so one at the window's
            // edge (the newest) shows whole.
            if (pts.length === 1 && inR(points[si][0])) {
                const dot = s(doc, 'g', { class: 'kp-chart__series' });
                paintSeries(dot, series, si);
                if (hot != null) dot.setAttribute('data-kp-state', hot === si ? 'hot' : 'dim');
                dot.append(s(doc, 'circle', { class: 'kp-chart__point', cx: pts[0][0], cy: pts[0][1], r: 3.5 }));
                svg.append(dot);
            }
        });
        for (const ev of events) {
            const mark = s(doc, 'g', { class: 'kp-chart__mark', 'data-kp-tone': ev.tone ?? 'info', 'data-at': ev.at });
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-hit', cx: x(ev.at), cy: P.t - 9, r: 10 }));
            mark.append(s(doc, 'circle', { class: 'kp-chart__mark-dot', cx: x(ev.at), cy: P.t - 9, r: 5 }));
            const title = s(doc, 'title');
            title.textContent = strings.mark(ev.label, time(ev.at, 'full', {}));
            mark.append(title);
            svg.append(mark);
        }
        if (brush) {
            svg.append(
                s(doc, 'rect', {
                    class: 'kp-chart__brush',
                    x: Math.min(brush.x0, brush.x1),
                    y: P.t,
                    width: Math.abs(brush.x1 - brush.x0),
                    height: H - P.t - P.b,
                }),
            );
        }
        const t = pinned ?? cursor;
        if (t != null && t >= from && t <= to) {
            svg.append(
                s(doc, 'line', {
                    class: pinned != null ? 'kp-chart__crosshair kp-chart__crosshair--pinned' : 'kp-chart__crosshair',
                    x1: x(t),
                    x2: x(t),
                    y1: P.t,
                    y2: H - P.b,
                }),
            );
            const acc = (points[0] ?? []).map(() => 0);
            data.series.forEach((series, si) => {
                if (!vis.includes(si) || points[si].length === 0) return;
                const k = indexAt(points[si], t);
                const v = points[si][k][1] + (stacked ? (acc[k] ?? 0) : 0);
                if (stacked) points[si].forEach((p, j) => (acc[j] += p[1]));
                const dot = s(doc, 'circle', { class: 'kp-chart__snap', cx: x(points[si][k][0]), cy: y(v), r: hot === si ? 4.5 : 3.5 });
                paintSeries(dot, series, si);
                svg.append(dot);
            });
        }
        plot.replaceChildren(svg);
        geo = { x, inv: (px) => from + ((px - P.l) / (W - P.l - P.r)) * (to - from), W, P, from, to, svg };
        const withPoints = vis.filter((si) => points[si].length > 0);
        note.hidden = !(data.onePointNote && withPoints.length > 0 && withPoints.every((si) => points[si].length === 1));
        paintLegend();
        paintTip();
    }

    function paintLegend() {
        const t = pinned ?? cursor;
        data.series.forEach((series, si) => {
            const it = items[si];
            if (!it) return;
            const on = sel.size === 0 || sel.has(si);
            const pts = points[si];
            const v = pts.length === 0 ? null : t != null ? pts[indexAt(pts, t)][1] : pts[pts.length - 1][1];
            it.button.setAttribute('aria-pressed', String(sel.has(si)));
            it.button.toggleAttribute('data-kp-off', !on);
            it.value.textContent = series.total != null && t == null ? series.total.toLocaleString(locale) : v == null ? '' : fmt(v, 'legend');
        });
        showAll.hidden = sel.size === 0;
    }

    /**
     * What is under the crosshair at `t`, for the tooltip and the readout;
     * for a pin outside the window only the sources whose readings still
     * reach it (within an hour), not a reading from another time.
     * @param {number} t @param {boolean} [strict]
     */
    const rowsAt = (t, strict = false) =>
        visible()
            .filter((si) => {
                const p = points[si];
                return p.length > 0 && (!strict || (t >= p[0][0] - HOUR && t <= p[p.length - 1][0] + HOUR));
            })
            .map((si) => {
                const k = indexAt(points[si], t);
                return { si, label: data.series[si].label || label(), v: points[si][k][1], d: hourChange(points[si], k) };
            })
            .sort((a, b) => b.v - a.v);
    /** The events within reach of `t`: a thirtieth of the window. @param {number} t */
    const eventsNear = (t) => {
        if (!geo) return [];
        const reach = (geo.to - geo.from) / 30;
        return (data.events ?? []).filter((ev) => Math.abs(ev.at - t) < reach);
    };
    /** @param {number} d */
    const change = (d) => (d === 0 ? '±0' : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 'delta')}`);

    function paintTip() {
        // Only the chart the crosshair was moved on shows its tooltip, or a
        // pinned one: a redraw of the whole group (a zoom, a live update)
        // pops up no other.
        const t = pinned ?? (group.owner === state ? cursor : null);
        if (t == null || !geo) {
            tip.hidden = true;
            return;
        }
        // A pin the window moved past (a live update while pinned) stays,
        // docked, until it is released.
        const outside = t < geo.from || t > geo.to;
        if (outside && pinned == null) {
            tip.hidden = true;
            return;
        }
        tipTime.textContent = time(Math.round(t / MINUTE) * MINUTE, 'full', {});
        pin.hidden = pinned == null;
        pinWord.textContent = outside ? strings.pinnedOutside : strings.pinned;
        const rows = rowsAt(t, outside).map((r) => {
            const swatch = h(doc, 'i', { class: 'kp-chart__swatch', 'aria-hidden': 'true' });
            paintSeries(swatch, data.series[r.si], r.si);
            const row = h(
                doc,
                'div',
                { class: 'kp-chart__tip-row' },
                swatch,
                h(doc, 'span', {}, r.label),
                h(doc, 'span', { class: 'kp-chart__num' }, fmt(r.v, 'tip')),
                h(
                    doc,
                    'span',
                    { class: 'kp-chart__num kp-chart__delta', 'data-kp-direction': r.d > 0 ? 'up' : r.d < 0 ? 'down' : null },
                    change(r.d),
                ),
            );
            if (hot === r.si) row.setAttribute('data-kp-state', 'hot');
            return row;
        });
        tipRows.replaceChildren(...rows);
        tipRows.hidden = rows.length === 0;
        tipFoot.hidden = rows.length === 0;
        tipEvents.replaceChildren(
            ...eventsNear(t).map((ev) => {
                const line = h(
                    doc,
                    'p',
                    { class: 'kp-chart__tip-event' },
                    h(doc, 'i', { class: 'kp-chart__dot', 'data-kp-tone': ev.tone ?? 'info', 'aria-hidden': 'true' }),
                    `${time(ev.at, 'clock', {})} ${ev.label}`,
                );
                if (pinned != null && ev.href) line.append(h(doc, 'a', { href: ev.href }, strings.open));
                return line;
            }),
        );
        tip.hidden = false;
        tip.toggleAttribute('data-kp-pinned', pinned != null);
        tip.toggleAttribute('data-kp-outside', outside);
        // Beside the crosshair, on whichever side has room, never past the
        // chart's edge; docked, in the corner away from it; a pin outside
        // the window at the edge it left by.
        const room = host.clientWidth || geo.W;
        const w = Math.min(tip.offsetWidth || 240, room);
        const px = outside ? (t < geo.from ? 0 : room) : geo.x(t);
        const left = outside ? (t < geo.from ? 0 : room - w) : px + 14 + w > room ? px - w - 14 : px + 14;
        tip.style.setProperty('--kp-chart-tip-x', `${Math.max(0, Math.min(room - w, left))}px`);
        tip.setAttribute('data-kp-side', px > room / 2 ? 'start' : 'end');
    }

    /** Say what is under the crosshair (keys and pins only: a pointer would talk too much). */
    function announce() {
        const t = pinned ?? cursor;
        if (t == null) return;
        const outside = geo != null && (t < geo.from || t > geo.to);
        const said = rowsAt(t, outside).map(
            (r) =>
                `${r.label} ${fmt(r.v, 'readout')}, ${r.d > 0 ? strings.up : r.d < 0 ? strings.down : strings.same}${r.d ? ` ${fmt(Math.abs(r.d), 'readout')}` : ''}`,
        );
        const near = eventsNear(t).map((ev) => `${ev.label} ${time(ev.at, 'clock', {})}`);
        const head = `${time(t, 'full', {})}${pinned == null ? '' : outside ? ` ${strings.pinnedOutside}` : ` (${strings.pinned})`}`;
        readout.textContent = [head, ...said, ...near].join('; ');
    }

    /** @param {PointerEvent} e */
    const timeAt = (e) => {
        if (!geo) return null;
        return geo.inv(e.clientX - geo.svg.getBoundingClientRect().left);
    };
    plot.addEventListener('pointerdown', (e) => {
        if (!geo || e.button !== 0) return;
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        if (mark) {
            pinned = Number(mark.getAttribute('data-at'));
            group.cursor(pinned, state);
            announce();
            return;
        }
        const left = e.clientX - geo.svg.getBoundingClientRect().left;
        brush = { x0: left, x1: left };
        plot.setPointerCapture?.(e.pointerId);
    });
    /** @param {PointerEvent} e */
    const onPointer = (e) => {
        if (!geo) return;
        if (brush) {
            brush.x1 = Math.max(geo.P.l, Math.min(geo.W - geo.P.r, e.clientX - geo.svg.getBoundingClientRect().left));
            draw();
            return;
        }
        // Over a marker the crosshair snaps to its event.
        const mark = /** @type {Element} */ (e.target).closest?.('.kp-chart__mark');
        const t = mark ? Number(mark.getAttribute('data-at')) : timeAt(e);
        if (t == null || t < geo.from || t > geo.to) return;
        group.cursor(t, state);
    };
    // Entering takes the crosshair at once: the move that brought the
    // pointer may have reached the chart it left last.
    plot.addEventListener('pointerenter', onPointer);
    plot.addEventListener('pointermove', onPointer);
    plot.addEventListener('pointerup', (e) => {
        if (!brush || !geo) return;
        const b = brush;
        brush = null;
        if (Math.abs(b.x1 - b.x0) > 6) {
            pinned = null;
            group.setZoom({ from: geo.inv(Math.min(b.x0, b.x1)), to: geo.inv(Math.max(b.x0, b.x1)) });
        } else {
            const t = timeAt(e);
            if (t == null) return;
            pinned = pinned != null && Math.abs(geo.x(pinned) - geo.x(t)) < 4 ? null : t;
            draw();
            announce();
        }
    });
    plot.addEventListener('pointercancel', () => {
        brush = null;
        draw();
    });
    // Leaving clears the crosshair only while this chart has it: the
    // pointer may already have moved it on another chart of the group.
    plot.addEventListener('pointerleave', () => {
        if (!brush && group.owner === state) group.cursor(null, state);
    });
    plot.addEventListener('dblclick', () => group.setZoom(null));
    plot.addEventListener('keydown', (e) => {
        const si = visible().find((i) => points[i].length > 0);
        const pts = si == null ? null : points[si];
        if (!pts) return;
        let k = indexAt(pts, pinned ?? cursor ?? pts[pts.length - 1][0]);
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else if (e.key === 'Enter') {
            e.preventDefault();
            // Nothing under the crosshair yet: pin the newest point.
            const at = cursor ?? pts[k][0];
            pinned = pinned != null ? null : at;
            group.cursor(at, state);
            announce();
            return;
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            if (pinned != null) pinned = null;
            else if (sel.size) setSel(new Set());
            else if (group.zoom) group.setZoom(null);
            draw();
            return;
        } else return;
        e.preventDefault();
        // Within the window on view (a zoom keeps the crosshair inside it).
        const win = range();
        k = Math.max(0, Math.min(pts.length - 1, k));
        if (win) {
            while (k > 0 && pts[k][0] > win.to) k--;
            while (k < pts.length - 1 && pts[k][0] < win.from) k++;
        }
        const t = pts[k][0];
        if (pinned != null) pinned = t;
        group.cursor(t, state);
        announce();
    });
    plot.addEventListener('focus', () => {
        if (cursor != null || !plot.matches(':focus-visible')) return;
        const win = range();
        if (win) group.cursor(win.to, state);
        announce();
    });
    plot.addEventListener('blur', (e) => {
        // Into the pinned tooltip (its ✕, an event's link) the reading stays.
        if (pinned == null && group.owner === state && !tip.contains(/** @type {Node | null} */ (e.relatedTarget))) group.cursor(null, state);
    });

    // A page that sets or clears `data-kp-chart-loading` itself.
    const watch = new (doc.defaultView ?? globalThis).MutationObserver(() => draw());
    watch.observe(host, { attributes: true, attributeFilter: ['data-kp-chart-loading', 'data-kp-chart-sources'] });

    /** @param {ChartData} next */
    const setData = (next) => {
        const sameSources = next.series.length === data.series.length && next.series.every((sr, i) => sr.label === data.series[i].label);
        const keyBefore = key();
        data = next;
        if (data.key != null) host.setAttribute('data-kp-key', data.key);
        points = data.series.map(pointsOf);
        if (!sameSources) {
            const had = sel.size > 0;
            sel = new Set();
            hot = null;
            buildLegend();
            if (had) setSel(sel);
        } else {
            legend.setAttribute('aria-label', strings.sources(label()));
            plot.setAttribute('aria-label', strings.plot(label()));
        }
        if (key() !== keyBefore) decorateOwn();
        // The group's window follows its newest point: every chart redraws.
        for (const c of group.charts) c.draw();
    };
    if (data.key != null) host.setAttribute('data-kp-key', data.key);
    points = data.series.map(pointsOf);
    buildLegend();
    decorateOwn();

    /** @type {ChartState} */
    const state = {
        host,
        spark: false,
        group,
        draw,
        setData,
        select: (i, on) => {
            const next = nextSelection(sel, i, data.series.length, on);
            if (!next) return false;
            setSel(next);
            draw();
            return true;
        },
        cursorAt: (t, own) => {
            cursor = t;
            if (!own && t == null) hot = null;
            draw();
        },
        lastTime: () => {
            const last = points.map((p) => p[p.length - 1]?.[0] ?? -Infinity);
            const max = Math.max(-Infinity, ...last);
            return Number.isFinite(max) ? max : null;
        },
        destroy: () => {
            watch.disconnect();
            if (group.owner === state) group.owner = null;
            for (const part of parts) part.remove();
            host.classList.remove('kp-chart');
        },
        unobserve: () => {},
    };
    return state;
}

/**
 * The spark variant: one source's last 24 hours as a tile's sparkline
 * (drawSparkline(), the KPI tile's own drawing), on the group's crosshair,
 * with its value at the crosshair (or now) beside its name.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState}
 */
function sparkChart(host, group, locale, ctx) {
    if (host.dataset.kpSparkHead === 'none') return trendChart(host, group, locale, ctx);
    const doc = host.ownerDocument;
    const { strings, time, decorate } = ctx;
    /** @type {ChartData} */
    let data = DATA.get(host) ?? dataInMarkup(host) ?? { series: [] };
    /** @type {ChartPoint[]} */
    let pts = [];
    const fmt = valueFormat(locale, ctx, () => data);
    /** @type {number | null} */
    let cursor = null;
    const label = () => data.label ?? data.series[0]?.label ?? host.getAttribute('aria-label') ?? '';

    host.classList.add('kp-chart', 'kp-chart--spark');
    const name = h(doc, 'span', { class: 'kp-chart__spark-label' });
    const value = h(doc, 'b', { class: 'kp-chart__spark-value kp-chart__num' });
    const head = h(doc, 'p', { class: 'kp-chart__spark-head' }, name, value);
    const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (s(doc, 'svg', { class: 'kp-chart__spark' })));
    const plot = h(doc, 'div', { class: 'kp-chart__plot kp-chart__spark-plot', tabindex: '0', role: 'application' });
    plot.append(svg);
    const readout = h(doc, 'p', { class: 'kp-chart__readout kp-sr-only', 'aria-live': 'polite' });
    const axis = trendAxisRow(host);
    const parts = [head, plot, ...(axis ? [axis.row] : []), readout];
    host.append(...parts);
    if (data.key != null) host.setAttribute('data-kp-key', data.key);
    decorateWith(decorate, plot, { kind: 'plot', host, key: data.key ?? host.getAttribute('data-kp-key') ?? undefined });

    function draw() {
        const series = data.series[0];
        name.textContent = label();
        if (axis) [axis.from.textContent, axis.to.textContent] = trendWords(pts, series, ctx);
        plot.setAttribute('aria-label', strings.spark(label()));
        if (!series || pts.length < 2) {
            svg.replaceChildren();
            value.textContent = '';
            return;
        }
        drawSparkline(
            svg,
            pts.map((p) => p[1]),
            { parts: 'kp-chart__spark' },
        );
        paintSeries(svg, series, 0);
        const first = pts[0][0];
        const last = pts[pts.length - 1][0];
        const on = cursor != null && cursor >= first && cursor <= last;
        if (on) {
            const k = indexAt(pts, /** @type {number} */ (cursor));
            const cx = (k / (pts.length - 1)) * 100;
            svg.append(s(doc, 'line', { class: 'kp-chart__crosshair', x1: cx, x2: cx, y1: 0, y2: 28, 'vector-effect': 'non-scaling-stroke' }));
            value.textContent = `${time(pts[k][0], 'clock', {})} · ${fmt(pts[k][1], 'spark')}`;
        } else value.textContent = `${strings.now} · ${fmt(pts[pts.length - 1][1], 'spark')}`;
    }

    /** @param {number} t */
    const say = (t) => {
        const k = indexAt(pts, t);
        readout.textContent = `${label()}: ${time(pts[k][0], 'full', {})}, ${fmt(pts[k][1], 'readout')}`;
    };
    plot.addEventListener('pointermove', (e) => {
        if (pts.length < 2) return;
        const r = svg.getBoundingClientRect();
        const k = Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * (pts.length - 1));
        group.cursor(pts[Math.max(0, Math.min(pts.length - 1, k))][0], state);
    });
    plot.addEventListener('pointerleave', () => {
        if (group.owner === state) group.cursor(null, state);
    });
    plot.addEventListener('keydown', (e) => {
        if (pts.length < 2) return;
        let k = cursor == null ? pts.length - 1 : indexAt(pts, cursor);
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') k -= step;
        else if (e.key === 'ArrowRight') k += step;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = pts.length - 1;
        else if (e.key === 'Escape') {
            if (cursor == null) return;
            e.stopPropagation();
            group.cursor(null, state);
            return;
        } else return;
        e.preventDefault();
        k = Math.max(0, Math.min(pts.length - 1, k));
        group.cursor(pts[k][0], state);
        say(pts[k][0]);
    });
    plot.addEventListener('blur', () => {
        if (group.owner === state) group.cursor(null, state);
    });

    /** @param {ChartData} next */
    const setData = (next) => {
        data = next;
        if (data.key != null) host.setAttribute('data-kp-key', data.key);
        pts = data.series[0] ? pointsOf(data.series[0]) : [];
        draw();
    };
    pts = data.series[0] ? pointsOf(data.series[0]) : [];

    /** @type {ChartState} */
    const state = {
        host,
        spark: true,
        group,
        draw,
        setData,
        select: () => false,
        cursorAt: (t) => {
            cursor = t;
            draw();
        },
        lastTime: () => pts[pts.length - 1]?.[0] ?? null,
        destroy: () => {
            if (group.owner === state) group.owner = null;
            for (const part of parts) part.remove();
            host.classList.remove('kp-chart', 'kp-chart--spark');
        },
        unobserve: () => {},
    };
    return state;
}

/**
 * The axis row under a trend, when the spark asks for one
 * (`data-kp-spark-axis="relative"`): where the line starts and where it ends.
 * @param {HTMLElement} host
 * @returns {{ row: HTMLElement, from: HTMLElement, to: HTMLElement, read: HTMLElement } | null}
 */
function trendAxisRow(host) {
    if (host.dataset.kpSparkAxis !== 'relative') return null;
    const doc = host.ownerDocument;
    const from = h(doc, 'span', { class: 'kp-kpi__chart-from' }, BLANK);
    const to = h(doc, 'span', { class: 'kp-kpi__chart-to' }, BLANK);
    // The reading, here only when even a stacked chip is too wide for the trend.
    const read = h(doc, 'span', { class: 'kp-kpi__chart-read' });
    read.hidden = true;
    const row = h(doc, 'span', { class: 'kp-kpi__chart-axis', 'aria-hidden': 'true' }, from, to, read);
    return { row, from, to, read };
}

/**
 * trendAxis() for a spark's points, in its chart context.
 * @param {readonly ChartPoint[]} pts
 * @param {ChartSeries | undefined} series
 * @param {ChartContext} ctx
 */
function trendWords(pts, series, ctx) {
    const step = series?.step ?? (pts.length > 1 ? pts[pts.length - 1][0] - pts[pts.length - 2][0] : undefined);
    const { now, today, yesterday } = ctx.strings;
    return trendAxis(pts, { now: ctx.now(), step, timeZone: ctx.timeZone, time: ctx.time, words: { now, today, yesterday } });
}

/**
 * The spark variant as a key figure's 24-hour trend
 * (`data-kp-spark-head="none"`): no name and value line; a pointer, a finger
 * or the arrow keys read one point, with a crosshair and a chip over the line
 * (its moment and value, kept inside the trend; the value under the moment
 * when the two do not fit on one line, and in the axis row when even that
 * does not fit). The trend keeps its own crosshair, not the group's. A click
 * that was not a drag follows the tile's `.kp-kpi__link`. The plot is a tab
 * stop only while there are two points or more. Loading (no data yet, or
 * `data-kp-chart-loading`) keeps the trend empty at its height and marks the
 * tile `aria-busy`.
 * @param {HTMLElement} host
 * @param {ChartGroup} group
 * @param {string} locale
 * @param {ChartContext} ctx
 * @returns {ChartState}
 */
function trendChart(host, group, locale, ctx) {
    const doc = host.ownerDocument;
    const { strings, time, decorate } = ctx;
    /** @type {ChartData | null} */
    let data = DATA.get(host) ?? dataInMarkup(host);
    /** @type {ChartPoint[]} */
    let pts = [];
    const fmt = valueFormat(locale, ctx, () => data ?? { series: [] });
    /** The moment being read, kept across a live update; null while nothing is read. @type {number | null} */
    let at = null;
    /** @type {number | null} */
    let index = null;
    const loading = () => data == null || host.hasAttribute('data-kp-chart-loading');

    const svg = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (s(doc, 'svg', { class: 'kp-kpi__spark' })));
    const cross = h(doc, 'span', { class: 'kp-kpi__chart-cross' });
    cross.hidden = true;
    const chip = h(doc, 'span', { class: 'kp-kpi__chart-chip', 'aria-hidden': 'true' });
    chip.hidden = true;
    const plot = h(doc, 'span', { class: 'kp-kpi__chart-plot', role: 'application' }, svg, cross, chip);
    const keys = h(doc, 'span', { class: 'kp-sr-only', id: `kp-trend-keys-${(clipIds += 1)}` }, strings.trendKeys);
    plot.setAttribute('aria-describedby', keys.id);
    const axis = trendAxisRow(host);
    const live = h(doc, 'span', { class: 'kp-sr-only', 'aria-live': 'polite' });
    const parts = [plot, ...(axis ? [axis.row] : []), keys, live];
    host.append(...parts);
    if (data?.key != null) host.setAttribute('data-kp-key', data.key);
    decorateWith(decorate, plot, { kind: 'plot', host, key: data?.key ?? host.getAttribute('data-kp-key') ?? undefined });
    const link = /** @type {HTMLElement | null} */ (host.closest('.kp-kpi')?.querySelector('.kp-kpi__link') ?? null);

    const hide = () => {
        at = null;
        index = null;
        cross.hidden = true;
        chip.hidden = true;
        if (axis) {
            axis.read.hidden = true;
            axis.from.hidden = false;
            axis.to.hidden = false;
        }
    };

    /**
     * Read point `k`: the crosshair, and the chip with its moment and value
     * over the line, inside the trend.
     * @param {number} k
     * @param {boolean} [announce] say it to a screen reader (keys only)
     */
    const show = (k, announce = false) => {
        if (pts.length < 2) return;
        const i = Math.max(0, Math.min(pts.length - 1, k));
        const [ms, value] = pts[i];
        at = ms;
        index = i;
        const width = plot.clientWidth;
        const x = (i / (pts.length - 1)) * width;
        const moment = time(ms, 'full', {});
        const shown = fmt(value, 'spark');
        cross.style.insetInlineStart = `${x}px`;
        cross.hidden = false;
        const words = () => [h(doc, 'span', { class: 'kp-kpi__chart-at' }, moment), h(doc, 'span', { class: 'kp-kpi__chart-value' }, shown)];
        chip.replaceChildren(...words());
        chip.hidden = false;
        chip.removeAttribute('data-kp-stacked');
        let chipWidth = chip.offsetWidth;
        if (chipWidth > width) {
            chip.setAttribute('data-kp-stacked', '');
            chipWidth = chip.offsetWidth;
        }
        const toAxis = chipWidth > width && axis != null;
        if (!toAxis) chip.style.insetInlineStart = `${Math.max(0, Math.min(width - chipWidth, x - chipWidth / 2))}px`;
        chip.hidden = toAxis;
        if (axis) {
            axis.read.replaceChildren(...(toAxis ? words() : []));
            axis.read.hidden = !toAxis;
            axis.from.hidden = toAxis;
            axis.to.hidden = toAxis;
        }
        if (announce) live.textContent = `${moment} · ${fmt(value, 'readout')}`;
    };

    function draw() {
        const series = data?.series[0];
        pts = !loading() && series ? pointsOf(series) : [];
        plot.setAttribute('aria-label', data?.label ?? host.getAttribute('aria-label') ?? series?.label ?? '');
        drawSparkline(
            svg,
            pts.map((p) => p[1]),
        );
        if (axis) [axis.from.textContent, axis.to.textContent] = trendWords(pts, series, ctx);
        const usable = pts.length >= 2;
        if (usable) plot.tabIndex = 0;
        else plot.removeAttribute('tabindex');
        const tile = host.closest('.kp-kpi');
        if (loading()) tile?.setAttribute('aria-busy', 'true');
        else tile?.removeAttribute('aria-busy');
        if (!usable) hide();
        else if (at != null) show(indexAt(pts, at));
    }

    /** @param {number} clientX */
    const indexAtX = (clientX) => {
        const box = plot.getBoundingClientRect();
        return Math.round(((clientX - box.left) / Math.max(1, box.width)) * (pts.length - 1));
    };
    /** @type {{ x: number, moved: boolean, touch: boolean } | null} */
    let press = null;
    /** @param {PointerEvent} event */
    const onDown = (event) => {
        press = { x: event.clientX, moved: false, touch: event.pointerType !== 'mouse' };
        if (press.touch) {
            try {
                plot.setPointerCapture(event.pointerId);
            } catch {
                // A pointer the browser no longer knows (a synthetic one): read without capture.
            }
            show(indexAtX(event.clientX));
        }
    };
    /** @param {PointerEvent} event */
    const onMove = (event) => {
        if (press && Math.abs(event.clientX - press.x) > 6) press.moved = true;
        if (event.pointerType === 'mouse' || press) show(indexAtX(event.clientX));
    };
    /** @param {PointerEvent} event */
    const onLeave = (event) => {
        if (event.pointerType === 'mouse') hide();
    };
    const onCancel = () => {
        press = null;
        hide();
    };
    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const dragged = press?.moved ?? false;
        press = null;
        // A click without a drag follows the tile's link, as a click anywhere
        // else on the tile does; a drag only read the trend.
        if (!dragged && link && event.button === 0) link.click();
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const n = pts.length;
        if (n < 2) return;
        const shown = !cross.hidden;
        const from = index ?? n - 1;
        /** @type {number | null} */
        let to = null;
        if (event.key === 'ArrowLeft') to = shown ? from - (event.shiftKey ? 10 : 1) : n - 1;
        else if (event.key === 'ArrowRight') to = shown ? from + (event.shiftKey ? 10 : 1) : n - 1;
        else if (event.key === 'Home') to = 0;
        else if (event.key === 'End') to = n - 1;
        else if (event.key === 'Escape' && shown) {
            event.preventDefault();
            event.stopPropagation();
            hide();
            return;
        }
        if (to == null) return;
        event.preventDefault();
        show(to, true);
    };
    plot.addEventListener('pointerdown', onDown);
    plot.addEventListener('pointermove', onMove);
    plot.addEventListener('pointerleave', onLeave);
    plot.addEventListener('pointercancel', onCancel);
    plot.addEventListener('click', onClick);
    plot.addEventListener('keydown', onKey);
    plot.addEventListener('blur', hide);

    /** @type {ChartState} */
    const state = {
        host,
        spark: true,
        group,
        draw,
        setData: (next) => {
            data = next;
            if (data.key != null) host.setAttribute('data-kp-key', data.key);
            draw();
        },
        select: () => false,
        // The trend reads on its own crosshair, not the group's.
        cursorAt: () => {},
        lastTime: () => pts[pts.length - 1]?.[0] ?? null,
        destroy: () => {
            for (const part of parts) part.remove();
            host.closest('.kp-kpi')?.removeAttribute('aria-busy');
        },
        unobserve: () => {},
    };
    return state;
}
