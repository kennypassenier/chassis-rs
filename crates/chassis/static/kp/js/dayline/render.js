// Drawing the day timeline [parts-1102]: its frame (the all-day strip, the scrolling box with the hour grid, the plate and the
// status line), the hours, the blocks and the now line. The controller decides what to draw; this only builds it.

import { MIN_DRAWN_MINUTES } from './constants.js';
import { clockAt, clockOf } from './layout.js';

/** @typedef {import('./constants.js').Placed} Placed */
/** @typedef {import('./constants.js').DaylineItem} DaylineItem */
/** @typedef {import('../strings.js').Strings} Strings */

/** The status palette a tone may name; anything else that is 1 to 12 is a categorical colour. */
const TONES = new Set(['primary', 'success', 'warning', 'destructive', 'info', 'muted']);

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} className @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** The parts of one day timeline, built once. @param {Document} doc */
export function buildFrame(doc) {
    const allDay = make(doc, 'div', 'kp-dayline__allday');
    const allDayName = make(doc, 'p', 'kp-dayline__allday-name');
    const allDayList = make(doc, 'ul', 'kp-dayline__allday-list');
    allDay.append(allDayName, allDayList);
    allDay.hidden = true;
    const grid = make(doc, 'div', 'kp-dayline__grid');
    const scroll = make(doc, 'div', 'kp-dayline__scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.append(grid);
    const plate = make(doc, 'div', 'kp-dayline__plate');
    plate.hidden = true;
    const frame = make(doc, 'div', 'kp-dayline__frame');
    frame.append(scroll, plate);
    const now = make(doc, 'div', 'kp-dayline__now');
    now.setAttribute('aria-hidden', 'true');
    const nowLabel = make(doc, 'span', 'kp-dayline__now-label');
    now.append(nowLabel);
    const drop = make(doc, 'div', 'kp-dayline__drop');
    drop.setAttribute('aria-hidden', 'true');
    drop.hidden = true;
    const status = make(doc, 'span', 'kp-sr-only kp-dayline__status');
    status.setAttribute('role', 'status');
    return { allDay, allDayName, allDayList, grid, scroll, plate, frame, now, nowLabel, drop, status };
}

/** The hour labels and the ruled lines behind the blocks. @param {Document} doc @param {{ startHour: number, hours: number, perHour: number }} g */
export function hourParts(doc, { startHour, hours, perHour }) {
    const lines = make(doc, 'div', 'kp-dayline__lines');
    lines.setAttribute('aria-hidden', 'true');
    const labels = Array.from({ length: hours }, (_, i) => {
        const hour = make(doc, 'span', 'kp-dayline__hour', clockAt(i * 60, startHour));
        hour.style.gridRow = `${i * perHour + 1} / span ${perHour}`;
        hour.setAttribute('aria-hidden', 'true');
        return hour;
    });
    return [lines, ...labels];
}

/** Put a tone on a block or a plate: the status palette by name, a categorical colour by number. @param {HTMLElement} el @param {string | number | undefined} tone */
export function paintTone(el, tone) {
    const name = tone == null ? 'primary' : String(tone);
    if (TONES.has(name)) el.dataset.kpTone = name;
    else if (/^(?:[1-9]|1[0-2])$/.test(name)) {
        el.dataset.kpTone = 'cat';
        el.dataset.kpCat = name;
    } else el.dataset.kpTone = 'primary';
}

/** `09:00–09:30`, the item's real start and end. @param {Placed} p @param {number} startHour */
export const spanOf = (p, startHour) => `${clockAt(p.at, startHour)}–${clockAt(p.at + p.minutes, startHour)}`;

/** What a screen reader hears for a block. @param {Placed} p @param {number} startHour @param {Strings} s */
export function blockName(p, startHour, s) {
    const extra = [p.item.done ? s.daylineDone : '', p.item.readonly ? s.daylineFixed : ''].filter(Boolean);
    return [p.item.label, spanOf(p, startHour), ...extra].join(', ');
}

/** One block: the handle (none for a read-only item, its column kept) and the body with the time and the label. @param {Document} doc @param {Placed} p @param {number} startHour @param {Strings} s */
export function buildBlock(doc, p, startHour, s) {
    const { item } = p;
    const block = make(doc, 'article', 'kp-dayline__item');
    block.dataset.kpDaylineId = item.id;
    paintTone(block, item.readonly && item.tone == null ? 'muted' : item.tone);
    block.toggleAttribute('data-kp-readonly', item.readonly === true);
    block.toggleAttribute('data-kp-done', item.done === true);
    block.toggleAttribute('data-kp-short', p.minutes <= MIN_DRAWN_MINUTES);
    block.setAttribute('aria-label', blockName(p, startHour, s));
    placeBlock(block, p);
    const time = make(doc, 'span', 'kp-dayline__time', spanOf(p, startHour));
    const label = make(doc, 'span', 'kp-dayline__label', item.label);
    const body = make(doc, item.readonly ? 'div' : 'button', 'kp-dayline__body');
    if (body instanceof HTMLButtonElement) body.type = 'button';
    body.title = item.readonly ? `${item.label}, ${spanOf(p, startHour)}` : `${item.label}, ${spanOf(p, startHour)}\n${s.daylineBodyHint}`;
    body.append(time, label);
    block.append(item.readonly ? fixedMark(doc) : handleOf(doc, item, s), body);
    return block;
}

/** The handle that moves an item. @param {Document} doc @param {DaylineItem} item @param {Strings} s */
function handleOf(doc, item, s) {
    const handle = make(doc, 'button', 'kp-icon-button kp-dayline__handle', '⠿');
    handle.type = 'button';
    handle.dataset.kpHandle = '';
    handle.setAttribute('aria-label', s.daylineHandle(item.label));
    handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Enter Escape');
    handle.title = s.daylineHandleHint;
    return handle;
}

/** A read-only item's first column: no handle, its place kept so the words line up with the movable items'. @param {Document} doc */
function fixedMark(doc) {
    const mark = make(doc, 'span', 'kp-dayline__fixed');
    mark.setAttribute('aria-hidden', 'true');
    return mark;
}

/** Stand a block on its rows and in its lane. @param {HTMLElement} block @param {Placed} p */
export function placeBlock(block, p) {
    block.style.gridRow = `${p.row + 1} / span ${p.rows}`;
    block.style.setProperty('--kp-dayline-lane', String(p.lane));
    block.style.setProperty('--kp-dayline-lanes', String(p.lanes));
}

/** The all-day strip's plates. @param {Document} doc @param {readonly DaylineItem[]} items @param {Strings} s */
export function allDayItems(doc, items, s) {
    if (!items.length) return [make(doc, 'li', 'kp-dayline__allday-none', s.daylineAllDayNone)];
    return items.map((item) => {
        const li = make(doc, 'li', 'kp-dayline__allday-item', item.label);
        paintTone(li, item.readonly && item.tone == null ? 'muted' : item.tone);
        li.toggleAttribute('data-kp-readonly', item.readonly === true);
        li.dataset.kpDaylineId = item.id;
        return li;
    });
}

/** The now line's place, as a share of the day, and its words; hidden outside the day. @param {HTMLElement} line @param {HTMLElement} label @param {number | null} minute @param {number} total @param {number} clock @param {Strings} s */
export function placeNow(line, label, minute, total, clock, s) {
    line.hidden = minute === null || minute >= total;
    if (line.hidden || minute === null) return;
    line.style.setProperty('--kp-dayline-now', String(minute / total));
    label.textContent = s.daylineNow(clockOf(clock));
}
