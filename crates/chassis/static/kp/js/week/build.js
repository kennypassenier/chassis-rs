// Builds the week: the frame, the steppers and the day columns.
import { dayKey, shiftDay } from '../calendar.js';
import { AXIS_HOURS } from './constants.js';
import { dayName, dm, keyOf, make, two } from './helpers.js';
/** @typedef {import('./types.js').WeekModel} WeekModel */

/**
 * A step of the week's track: a chevron drawn in the ink of the item, named for a screen reader and in a tooltip.
 * @param {Document} doc @param {string} name @param {string} path the chevron, in a 24 px box
 * @returns {HTMLButtonElement}
 */
function stepButton(doc, name, path) {
    const button = make(doc, 'button', 'kp-segmented__item kp-week__step kp-week__step--icon');
    button.type = 'button';
    button.setAttribute('aria-label', name);
    button.title = name;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'kp-week__chevron');
    const line = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', path);
    svg.append(line);
    button.append(svg);
    return button;
}

/**
 * From here on, what comes later in this agenda arrives the theme's way (js/motion.js: the register's own arrival, one
 * after the other): the items that end a loading state, a new item of a live update, the days of the next range. A
 * pill that is still there keeps its node, so a refresh with the same items moves nothing. Asked by an agenda that can
 * load (its first loading state) or move (its week buttons); one that only ever shows what it was given stays still.
 * @param {WeekModel} c
 */
export function watchArrivals(c) {
    if (c.motion.asked) return;
    c.motion.asked = true;
    void import('../motion.js').then((m) => {
        if (!c.motion.gone) c.motion.stop = m.easeSize(c.el);
    });
}

/** Build the chrome once; the days are filled by paint(). @param {WeekModel} c */
export function build(c) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    const level = c.el.dataset.kpHeadingLevel ?? '2';
    const parts = [];
    if (c.el.hasAttribute('data-kp-week-nav')) {
        // The range's title on the start side and, on the end side, the steps as one control: the package's segmented
        // track (every register dresses it), holding a chevron back, Today and a chevron on. Not three loose buttons
        // (Kenny, 2026-10-16: "de knoppen met Prev, Next, Today zijn basic en lelijk en niet volgens het thema").
        const nav = make(doc, 'div', 'kp-week__nav');
        const title = make(doc, /** @type {'h2'} */ (`h${level}`), 'kp-week__title');
        title.setAttribute('aria-live', 'polite');
        const steps = make(doc, 'div', 'kp-segmented kp-week__steps');
        steps.setAttribute('role', 'group');
        steps.setAttribute('aria-label', s.weekGroup);
        // The dictionary's own Previous and Next name the chevrons (a new word would ask every approved block again: the
        // dictionary is in every block's hash, catalogue/code-version.json).
        const prev = stepButton(doc, s.previous, 'M15 18l-6-6 6-6');
        prev.dataset.kpWeekPrev = '';
        const today = make(doc, 'button', 'kp-segmented__item kp-week__step', s.weekToday);
        today.type = 'button';
        today.dataset.kpWeekToday = '';
        const next = stepButton(doc, s.next, 'M9 6l6 6-6 6');
        next.dataset.kpWeekNext = '';
        steps.append(prev, today, next);
        nav.append(title, steps);
        c.title = title;
        c.today = today;
        c.decorate?.(prev, { kind: 'prev', host: c.el, key: keyOf(c.el) });
        c.decorate?.(next, { kind: 'next', host: c.el, key: keyOf(c.el) });
        c.decorate?.(today, { kind: 'today', host: c.el, key: keyOf(c.el) });
        parts.push(nav);
    }
    const frame = make(doc, 'div', 'kp-week__frame');
    c.frame = frame;
    c.grid = make(doc, 'div', 'kp-week__grid');
    c.grid.setAttribute('role', 'group');
    if (!c.el.hasAttribute('aria-label') && !c.el.hasAttribute('aria-labelledby')) c.grid.setAttribute('aria-label', s.weekGroup);
    c.axis = make(doc, 'div', 'kp-week__axis');
    c.axis.setAttribute('aria-hidden', 'true');
    for (const hour of AXIS_HOURS) {
        const mark = make(doc, 'span', '', `${two(hour)}:00`);
        mark.style.setProperty('--kp-week-at', String(hour / 24));
        c.axis.append(mark);
    }
    c.grid.append(c.axis);
    c.stateLine = make(doc, 'p', 'kp-week__state');
    c.stateLine.setAttribute('role', 'status');
    frame.append(c.grid);
    if (c.upcoming.n > 0) {
        // The phone's list of what comes next [kpadopt3]; shown only below 40rem, in place of the day rows.
        const list = /** @type {HTMLOListElement} */ (make(doc, 'ol', 'kp-week__upcoming'));
        const named = c.el.dataset.kpWeekUpcomingLabel;
        if (named) list.setAttribute('aria-label', named);
        c.upcoming.list = list;
        frame.append(list);
    }
    // Loading is read out by the line and drawn as the busy card; empty and failed are the package's state plate over the
    // whole agenda, with a Retry on a failure [state-plates-1019].
    c.plate = make(doc, 'div', 'kp-week__plate');
    c.plate.hidden = true;
    frame.append(c.stateLine, c.plate);
    c.legend = make(doc, 'ul', 'kp-week__legend');
    c.legend.hidden = true;
    parts.push(frame, c.legend);
    c.el.replaceChildren(...parts);
}

/** (Re)build the day columns for the range; keeps the pills by id. @param {WeekModel} c */
export function buildDays(c) {
    const doc = c.el.ownerDocument;
    const s = c.strings;
    for (const col of c.cols) col.cell.remove();
    c.cols = [];
    const today = dayKey(c.now(), c.zone);
    for (let i = 0; i < c.days; i += 1) {
        const iso = shiftDay(c.start, i);
        const cell = make(doc, 'div', 'kp-week__day');
        cell.setAttribute('role', 'group');
        cell.setAttribute('aria-label', `${dayName(c, iso, 'long')} ${dm(iso, true)}`);
        cell.dataset.kpDate = iso;
        cell.style.setProperty('--kp-week-i', String(i));
        const head = make(doc, 'div', 'kp-week__head');
        head.append(
            make(doc, 'span', 'kp-week__dow', dayName(c, iso)),
            make(doc, 'span', 'kp-week__num', iso.slice(8, 10)),
            make(doc, 'span', 'kp-week__date', dm(iso)),
        );
        const mark = make(doc, 'span', 'kp-week__today', s.weekToday);
        head.append(mark);
        const track = make(doc, 'div', 'kp-week__col');
        const now = make(doc, 'div', 'kp-week__now');
        now.setAttribute('role', 'separator');
        now.hidden = true;
        track.append(now);
        cell.append(head, track);
        c.grid.append(cell);
        c.cols.push({ iso, cell, head, track, items: [], now, more: null, moreButton: null, hidden: [] });
        if (iso === today) {
            cell.dataset.kpToday = '';
            head.setAttribute('aria-current', 'date');
        }
    }
    c.grid.style.setProperty('--kp-week-days', String(c.days));
    if (c.title) {
        const last = c.cols[c.cols.length - 1]?.iso ?? c.start;
        c.title.textContent = `${dm(c.start, true)} – ${dm(last, true)}`;
    }
    if (c.today) {
        // Today has nothing to do while the range already starts today: greyed, and still in the tab order.
        c.today.setAttribute('aria-disabled', String(c.start === today));
    }
}
