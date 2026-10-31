// The time axis: ticks, day marks and edge ticks.
import { dayKey, formatDayKey, shiftDay } from '../calendar.js';
import { wallTime, zonedTime } from '../chart.js';
import { axisStep, clock, zoneOffset } from './scale.js';
import { MONDAY, make } from './constants.js';
/** @typedef {import('./constants.js').GanttModel} GanttModel */

/** Axis ticks for the window. @param {GanttModel} c @param {{ from: number, end: number }} w */
export function syncTicks(c, w) {
    const room = c.plot.clientWidth || 600;
    const step = axisStep(c.span, room);
    const fromMs = (w.from + c.base) * 1000;
    const offset = zoneOffset(fromMs, c.zone);
    // A week or longer starts on a Monday [kpadopt4]; shorter steps keep the clock's own multiples.
    const anchor = step >= 604_800 ? MONDAY : 0;
    const firstAbs = anchor + Math.ceil((w.from + c.base + offset - anchor) / step) * step - offset;
    /** @type {number[]} */
    const list = [];
    for (let t = firstAbs; t <= w.end + c.base + 1; t += step) list.push(t - c.base);
    const key = `${step}:${list.map((t) => t.toFixed(0)).join(',')}`;
    if (key === c.tickKey) return;
    c.tickKey = key;
    const doc = c.el.ownerDocument;
    const keep = new Set(list.map((t) => Math.round(t)));
    for (const [t, parts] of c.ticks)
        if (!keep.has(t)) {
            parts.label.remove();
            parts.line.remove();
            c.ticks.delete(t);
        }
    for (const t of list) {
        const id = Math.round(t);
        const ms = (id + c.base) * 1000;
        const w2 = wallTime(ms, c.zone);
        const midnight = w2.hour === 0 && w2.minute === 0;
        const isDay = step >= 86_400 || midnight;
        // A day the axis names is a button when the timeline asks for them [kpadopt3].
        const tag = c.days && isDay ? 'BUTTON' : 'SPAN';
        let parts = c.ticks.get(id);
        if (!parts) {
            parts = { label: make(doc, 'span', 'kp-gantt__tick'), line: make(doc, 'i', 'kp-gantt__rule') };
            c.axis.append(parts.label);
            c.lines.append(parts.line);
            c.ticks.set(id, parts);
        }
        if (parts.label.tagName !== tag) {
            const fresh = make(doc, tag === 'BUTTON' ? 'button' : 'span', 'kp-gantt__tick');
            if (fresh instanceof HTMLButtonElement) fresh.type = 'button';
            parts.label.replaceWith(fresh);
            parts.label = fresh;
        }
        const day = dayKey(ms, c.zone);
        parts.label.textContent = isDay ? formatDayKey(day).slice(0, 5) : clock(c, ms);
        parts.label.toggleAttribute('data-kp-day', isDay);
        if (tag === 'BUTTON') {
            parts.label.dataset.kpGanttDay = day;
            parts.label.setAttribute('aria-label', dayWords(c, day));
            parts.label.title = dayWords(c, day);
        } else if (c.days) parts.label.setAttribute('aria-hidden', 'true');
        parts.label.style.setProperty('--kp-g-t', String(id));
        parts.line.style.setProperty('--kp-g-t', String(id));
    }
    // A day button is pressed whole: one that would run past the end of the axis stands against its end instead, and
    // one that has no room there without touching the label before it is not offered (its day is the window's last, partial one).
    if (c.days) {
        const room = c.axis.clientWidth;
        let before = -Infinity;
        for (const id of [...c.ticks.keys()].sort((a, b) => a - b)) {
            const label = /** @type {{ label: HTMLElement }} */ (c.ticks.get(id)).label;
            const x = ((id - w.from) / c.span) * room;
            const width = label.offsetWidth;
            const edge = label.tagName === 'BUTTON' && x + width > room;
            const start = edge ? room - width : x;
            const crowded = edge && start < before + 6;
            label.toggleAttribute('data-kp-gantt-edge', edge);
            label.toggleAttribute('data-kp-gantt-crowded', crowded);
            if (!crowded) before = start + width;
        }
    }
    syncDays(c);
}
/**
 * A day as a person reads it on a button: `We 14/10/2026`, the dictionary's weekday (rule 52: dd/mm, the year in the name).
 * @param {GanttModel} c @param {string} day
 */
function dayWords(c, day) {
    const weekday = c.strings.weekdays[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7] ?? '';
    return `${weekday} ${formatDayKey(day)}`.trim();
}
/** The moments a day of the zone starts and ends, epoch ms. @param {GanttModel} c @param {string} day */
export function dayBounds(c, day) {
    const at = (/** @type {string} */ iso) =>
        zonedTime(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)), 0, 0, c.zone) ?? Date.parse(`${iso}T00:00:00Z`);
    return { from: at(day), to: at(shiftDay(day, 1)) };
}
/** The day buttons: pressed while their day is the selection, one tab stop among them. @param {GanttModel} c */
export function syncDays(c) {
    if (!c.days) return;
    for (const b of /** @type {HTMLButtonElement[]} */ ([...c.axis.querySelectorAll('button[data-kp-gantt-day][data-kp-gantt-crowded]')]))
        b.tabIndex = -1;
    const buttons = /** @type {HTMLButtonElement[]} */ ([...c.axis.querySelectorAll('button[data-kp-gantt-day]:not([data-kp-gantt-crowded])')]);
    const sel = c.selected;
    let picked = '';
    for (const b of buttons) {
        const day = b.dataset.kpGanttDay ?? '';
        const { from, to } = dayBounds(c, day);
        const on = sel !== null && sel.from === from && sel.to === to;
        if (on) picked = day;
        b.setAttribute('aria-pressed', String(on));
    }
    const stop = buttons.find((b) => b.dataset.kpGanttDay === c.dayStop) ?? buttons.find((b) => b.dataset.kpGanttDay === picked) ?? buttons[0];
    for (const b of buttons) b.tabIndex = b === stop ? 0 : -1;
}
/**
 * A tick label that would run past the axis's end edge (the newest hour entering the window) stands on the other
 * side of its rule, ending at it, so no label is ever cut by the edge.
 * @param {GanttModel} c @param {{ from: number, end: number }} w
 */
export function edgeTicks(c, w) {
    const room = c.axis.clientWidth;
    if (!room) return;
    let before = -Infinity;
    for (const t of [...c.ticks.keys()].sort((a, b) => a - b)) {
        const parts = /** @type {{ label: HTMLElement }} */ (c.ticks.get(t));
        // A day button (`data-kp-gantt-days`) has its own edge rule in syncTicks: it stands against the end, whole.
        if (parts.label.tagName === 'BUTTON') continue;
        const at = ((t - w.from) / c.span) * room;
        const width = parts.label.offsetWidth;
        const edge = room - at < width + 2;
        parts.label.toggleAttribute('data-kp-gantt-edge', edge);
        // A label turned before its rule that would run into the label before it steps aside [kpadopt4].
        const start = edge ? at - width : at;
        const crowded = edge && start < before + 4;
        parts.label.toggleAttribute('data-kp-gantt-crowded', crowded);
        if (!crowded) before = start + width;
    }
}
