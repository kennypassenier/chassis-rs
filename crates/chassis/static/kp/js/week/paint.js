// Paints the events into the week, draws its busy state, lays it out and ticks the clock line.
import { dayKey } from '../calendar.js';
import { hostStatePlate } from '../state-plate.js';
import { holdRows, placeBusy } from './busy.js';
import { WEEK_RETRY_EVENT } from './constants.js';
import { make, nameOf, timeOfDay, toMs } from './helpers.js';
import { foldMenu, syncTabStops } from './menu.js';
import { pillCapacity, pillFor, stackPills } from './pills.js';
import { modeOf, paintUpcoming, upcomingItems, upcomingOn } from './upcoming.js';
/** @typedef {import('./types.js').WeekItem} WeekItem */
/** @typedef {import('./types.js').WeekModel} WeekModel */

/**
 * While the week loads, the data table's own loading picture stands over the empty days (Kenny, 2026-10-16: "zoals
 * bij table waarbij de hele table het laadicoon centraal krijgt"): the same layer, panel, spinner and words as
 * js/datatable.js drawOverlay() builds (`.kp-datatable__busy-overlay` > `.kp-datatable__busy-panel` > `.kp-spinner`
 * + `.kp-datatable__busy-words`), so every theme dresses it as it dresses its busy table, and it arrives and leaves
 * as that layer does: it arrives the theme's way (easeSize(), asked by the first loading state) and leaves by leave()
 * where the theme leaves its states whole, else its panel closes. Absolutely placed in the frame, so nothing moves
 * when it comes or goes; hidden from assistive technology, which hears the state line.
 * @param {WeekModel} c
 */
function drawBusy(c) {
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        placeBusy(c);
        return;
    }
    const doc = c.el.ownerDocument;
    if (!want) {
        const layer = /** @type {HTMLElement} */ (c.busy);
        c.busy = null;
        const panel = /** @type {HTMLElement | null} */ (layer.querySelector('.kp-datatable__busy-panel'));
        // The items wait until the panel has gone, then arrive: nothing of the week is drawn under a panel on its way out.
        const gone = import('../motion.js').then((m) => {
            if (!layer.isConnected || !panel) {
                layer.remove();
                return undefined;
            }
            if (m.leavesState(layer)) return m.leave(layer);
            layer.setAttribute(m.CLOSING_ATTRIBUTE, '');
            return m.playClose(panel).then(() => layer.remove());
        });
        c.leaving = gone;
        void gone
            .catch(() => layer.remove())
            .then(() => {
                if (c.leaving !== gone) return;
                c.leaving = null;
                if (!c.motion.gone) paint(c);
            });
        return;
    }
    // A layer still leaving from the last load goes at once: one panel at a time, never two over each other.
    for (const old of c.frame.querySelectorAll(':scope > .kp-week__busy')) old.remove();
    c.leaving = null;
    const layer = make(doc, 'div', 'kp-datatable__busy-overlay kp-week__busy');
    layer.setAttribute('aria-hidden', 'true');
    const panel = make(doc, 'div', 'kp-datatable__busy-panel');
    panel.append(make(doc, 'span', 'kp-spinner'), make(doc, 'span', 'kp-datatable__busy-words', c.strings.weekLoading));
    layer.append(panel);
    c.busy = layer;
    placeBusy(c);
    c.frame.append(layer);
}

/** Everything the week shows, from the model. @param {WeekModel} c */
export function paint(c) {
    const s = c.strings;
    const doc = c.el.ownerDocument;
    const byDay = new Map(c.cols.map((col) => [col.iso, /** @type {WeekItem[]} */ ([])]));
    const live = new Set();
    // `data-kp-week-off="hide"` leaves the items that are off out of the week [homelab gap 43]; `show`, the default, draws them muted.
    const hideOff = c.el.getAttribute('data-kp-week-off') === 'hide';
    for (const event of c.events) {
        if (hideOff && event.state === 'off') continue;
        const ms = toMs(event.start);
        if (!Number.isFinite(ms)) continue;
        const day = dayKey(ms, c.zone);
        const list = byDay.get(day);
        if (!list) continue;
        const { hhmm, at } = timeOfDay(c, ms);
        const button = pillFor(c, event);
        live.add(event.id);
        button.dataset.kpSeries = String(event.series ?? 1);
        if (event.state) button.dataset.kpState = event.state;
        else delete button.dataset.kpState;
        const time = /** @type {HTMLElement} */ (button.querySelector('.kp-week__time'));
        const label = /** @type {HTMLElement} */ (button.querySelector('.kp-week__label'));
        if (time.textContent !== hhmm) time.textContent = hhmm;
        if (label.textContent !== event.label) label.textContent = event.label;
        const name = nameOf(c, event, hhmm, day);
        if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
        button.setAttribute('data-kp-hovercard', event.detail || `${event.label} · ${hhmm}`);
        if (event.state === 'reference') button.setAttribute('role', 'note');
        list.push({ event, ms, at, hhmm, button, day });
    }
    for (const [id, button] of c.pills)
        if (!live.has(id)) {
            button.remove();
            c.pills.delete(id);
        }
    for (const col of c.cols) {
        col.items = (byDay.get(col.iso) ?? []).sort((a, b) => a.ms - b.ms);
    }
    c.el.dataset.kpState = c.state;
    c.grid.toggleAttribute('aria-busy', c.state === 'loading');
    const words =
        c.state === 'loading'
            ? s.weekLoading
            : c.state === 'empty'
              ? c.stateLine.dataset.kpWords || s.weekEmpty
              : c.stateLine.dataset.kpWords || s.heatFailed;
    const said = c.state === 'loading' ? words : '';
    if ((c.stateLine.textContent ?? '') !== said) c.stateLine.textContent = said;
    c.stateLine.dataset.kpState = c.state;
    const plateKind = c.state === 'empty' || c.state === 'error' ? c.state : null;
    // Rebuilt only when what it says changes, so the focus on its Retry survives a repaint.
    const plateKey = plateKind ? `${plateKind}|${words}|${c.plateText}` : '';
    if (c.plateKey !== plateKey) {
        c.plateKey = plateKey;
        c.plate.replaceChildren();
        if (plateKind)
            c.plate.append(
                hostStatePlate(c.el, {
                    kind: plateKind,
                    title: words,
                    ...(c.plateText ? { text: c.plateText } : {}),
                    art: c.plateArt,
                    retryEvent: WEEK_RETRY_EVENT,
                }),
            );
    }
    c.plate.hidden = plateKind === null;
    const was = c.upcoming.on;
    c.upcoming.on = upcomingOn(c);
    // The rows of the last mode let go of their hold: the other mode holds its own boxes.
    if (was !== c.upcoming.on) c.held = null;
    const waiting = c.state === 'loading' || c.leaving !== null;
    drawBusy(c);
    // The boxes are held at the height they have before their items leave them.
    holdRows(c);
    if (c.upcoming.list) paintUpcoming(c, c.upcoming.on && !waiting ? upcomingItems(c, c.now()) : []);
    for (const col of c.cols) {
        const nodes = c.state === 'loading' || c.leaving || c.upcoming.on ? [] : col.items.map((item) => item.button);
        const wanted = [col.now, ...nodes];
        // Re-order only when the order differs: moving a focused node loses its focus.
        const have = [...col.track.children].filter((n) => n !== col.moreButton?.parentElement);
        const same = wanted.length === have.length && wanted.every((n, i) => n === have[i]);
        if (!same) {
            // What the track holds and is no longer wanted leaves it: a loading state takes every pill out (it once
            // only re-appended the wanted nodes, so the old pills stayed, lost their place and stood stacked at the
            // top of the day, two items' words drawn on top of each other).
            const keep = new Set(/** @type {Element[]} */ (wanted));
            for (const n of have) if (!keep.has(n)) n.remove();
            for (const n of nodes) n.remove();
            col.track.append(...nodes);
        }
    }
    layout(c);
    if (!c.active || !c.pills.has(c.active)) {
        const first = c.cols.flatMap((col) => col.items).find((i) => i.button.tagName === 'BUTTON');
        c.active = first?.event.id ?? null;
    }
    syncTabStops(c);
    tick(c);
    void doc;
}

/** Place the pills of every column, fold what does not fit. @param {WeekModel} c */
export function layout(c) {
    c.mode = modeOf(c);
    c.el.dataset.kpWeekMode = c.mode;
    for (const col of c.cols) {
        for (const item of col.items) {
            item.button.removeAttribute('data-kp-overflow');
            item.button.style.removeProperty('--kp-week-top');
        }
        col.hidden = [];
        if (c.mode === 'list' || c.state === 'loading') {
            foldMenu(c, col);
            continue;
        }
        const height = col.track.clientHeight;
        const sample = col.items.find((i) => i.button.offsetHeight > 0)?.button.offsetHeight ?? 0;
        if (!height || !sample) {
            foldMenu(c, col);
            continue;
        }
        const room = pillCapacity(height, sample);
        const items = col.items;
        const keep = items.length > room ? items.slice(0, room - 1) : items;
        col.hidden = items.length > room ? items.slice(room - 1) : [];
        const wants = keep.map((i) => i.at);
        if (col.hidden.length) wants.push(col.hidden[0]?.at ?? 1);
        const tops = stackPills(wants, height, sample);
        keep.forEach((item, i) => item.button.style.setProperty('--kp-week-top', `${tops[i]}px`));
        for (const item of col.hidden) item.button.setAttribute('data-kp-overflow', '');
        foldMenu(c, col, tops[keep.length] ?? 0);
    }
}

/** The now-line and the past marks. @param {WeekModel} c */
export function tick(c) {
    const now = c.now();
    const today = dayKey(now, c.zone);
    const { hhmm, at } = timeOfDay(c, now);
    for (const col of c.cols) {
        const isToday = col.iso === today;
        col.cell.toggleAttribute('data-kp-today', isToday);
        if (isToday) col.head.setAttribute('aria-current', 'date');
        else col.head.removeAttribute('aria-current');
        col.now.hidden = !isToday;
        if (isToday) {
            col.now.style.setProperty('--kp-week-at', String(at));
            col.now.setAttribute('aria-label', c.strings.weekNowAt(hhmm));
        }
        for (const item of col.items) item.button.toggleAttribute('data-kp-past', item.ms < now);
    }
    // An item of the upcoming list that has passed leaves it, and the next one comes in [kpadopt3].
    if (c.upcoming.on && c.upcoming.items.some((item) => item.ms < now)) paint(c);
}
