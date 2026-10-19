// A week agenda: seven day columns, the items of the week placed in time
// [kpadopt-time; the admin dashboard's `sch-week` and `sch-pill`].
//
// `section.kp-week[data-kp-week]` is filled by attachWeeks(): optionally a
// row of week buttons (`data-kp-week-nav`), the head of each day, an hour
// axis, and one column per day in which every item is a pill placed at its
// time of day. The page gives the items (setWeekEvents) and the state of the
// whole (setWeekState); the agenda paints them in place.
//
//   <section class="kp-week" data-kp-week data-kp-week-start="2026-10-16"
//            aria-label="Runs in the next 7 days"></section>
//
//   setWeekEvents(el, [
//       { id: 'backup', start: '2026-10-17T02:00:00+02:00', label: 'Backup photos', series: 1, detail: 'nightly, keeps 14' },
//       { id: 'host',   start: '2026-10-17T03:30:00+02:00', label: 'Host round',    state: 'reference' },
//   ]);
//
//   start    the day the week begins on, `YYYY-MM-DD` (`data-kp-week-start`,
//            else today in `data-kp-time-zone`, Europe/Brussels by default);
//            `data-kp-week-days` is how many columns (7)
//   series   1 to 5: the pill's colour, from `--chart-1` to `--chart-5`; the
//            colour never carries the meaning alone, the label does
//   state    `next` (a ring), `off` and `skipped` (muted, struck through),
//            `reference` (dashed, not a button: the host's own round)
//   crowd    a column holds as many pills as its height fits at one pill's
//            height; what does not fit is folded into a `+N` menu button at
//            the end of the stack, and its menu lists them. The page never
//            grows and no pill sits on another
//   narrow   below the agenda's own width of 40rem (a container query) the
//            seven columns become seven rows: the day on the left, its items
//            in time order on the right, every item shown, no `+N`
//   now      a line across today's column (`aria-label` "now, 14:32"),
//            moved every 30 s; items already past are muted
//   keys     one tab stop: ↑ ↓ move within a day, ← → to the neighbouring day
//            (the item nearest in time), Home and End to the day's first and
//            last, Enter or Space opens; Tab leaves the agenda
//   hover    the item's `detail` (else its name and time) in the page's one
//            hover card (js/hovercard.js)
//   loading  the days stay empty and the data table's busy panel (the
//            theme's spinner and "Reading the week") stands centred over
//            them, arriving and leaving as the busy table's does
//   upcoming opt-in, `data-kp-week-upcoming="8"` [kpadopt3]: below 40rem the
//            agenda lists the next 8 items instead of its day rows, the way
//            a phone reads a schedule: one row per item, its day on the left
//            on one line (named once for a run of the same day, Today for
//            today), the item's own pill on
//            the right. "Next" is from now within the range shown, and an
//            item that is off, skipped or only there for reference is not
//            one; an item that passes leaves the list on the next tick. The
//            same pills, keys (↑ ↓ Home End), hover card, events, loading
//            card and arrivals as the rows; `data-kp-week-upcoming-label`
//            names the list for a screen reader, `data-kp-week-upcoming-empty`
//            is its sentence when nothing is still to come (else the
//            dictionary's weekEmpty). Wider, the week is the week
//
// Events (bubbling, on the agenda):
//   kp-week-open    { id, event, source: 'pointer' | 'keyboard' }  an item was opened
//   kp-week-range   { start: 'YYYY-MM-DD', source: 'nav' }         a week button moved the range; give the new items
//
// Every date a person reads is dd/mm (the year in the day's name, rule 52);
// the machine's day is `YYYY-MM-DD`. Every word is in the dictionary (`week…`
// in js/strings.js). Nothing runs on import; attachWeeks(root) returns a
// detach. `decorate` marks every control the agenda builds (`pill`, `more`,
// `prev`, `next`, `today`), the shape every kp module's `decorate` takes.

import { CHART_TIME_ZONE, wallTime } from './chart.js';
import { dayKey, shiftDay } from './calendar.js';
import { resolveLocale } from './locale.js';
import { resolveStrings } from './strings.js';
import { hostStatePlate } from './state-plate.js';

/** A week agenda: `section.kp-week[data-kp-week]`. */
export const WEEK = '[data-kp-week]';
/** Fired on the agenda, bubbling, when an item was opened: `detail` `{ id, event, source: 'pointer' | 'keyboard' }`. */
export const WEEK_OPEN_EVENT = 'kp-week-open';
/** Fired on the agenda, bubbling, when a week button moved the range: `detail` `{ start: 'YYYY-MM-DD', source: 'nav' }`. */
export const WEEK_RANGE_EVENT = 'kp-week-range';
/** How often the now-line and the past marks move, in ms. */
export const WEEK_TICK_MS = 30_000;
/** Fired on the agenda, bubbling, when the Retry of its failed state is pressed [state-plates-1019]. */
export const WEEK_RETRY_EVENT = 'kp-week-retry';

/**
 * @typedef {'next' | 'off' | 'skipped' | 'reference'} WeekEventState
 * @typedef {object} WeekEvent
 * @property {string} id what the page calls the item; reported by `kp-week-open`
 * @property {number | string} start the moment: epoch ms, or an ISO string with its offset
 * @property {string} label what it is, one line (clipped with an ellipsis)
 * @property {1 | 2 | 3 | 4 | 5} [series] the colour, from `--chart-1`; 1 when absent
 * @property {WeekEventState} [state] absent for a plain item
 * @property {string} [detail] the hover card's words, and the end of the item's accessible name
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} WeekState
 * @typedef {import('./strings.js').Strings} Strings
 */

/**
 * What `decorate` is told about the control it is handed.
 * `kind` is `pill`, `more`, `prev`, `next` or `today`; `id` is the item's (a pill) or the day's `YYYY-MM-DD` (`more`).
 * @typedef {{ kind: 'pill' | 'more' | 'prev' | 'next' | 'today', host: HTMLElement, key?: string, id?: string }} WeekDecorateInfo
 *
 * @typedef {object} WeekOptions
 * @property {string} [timeZone] the IANA zone that decides which day an item is on; else `data-kp-time-zone`, else `Europe/Brussels`
 * @property {string} [locale] the weekday names; else `data-kp-locale`, else the nearest `lang`
 * @property {() => number} [now] the clock, `Date.now` by default
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these agendas only
 * @property {(part: HTMLElement, info: WeekDecorateInfo) => void} [decorate]
 *
 * @typedef {{ event: WeekEvent, ms: number, at: number, hhmm: string, button: HTMLButtonElement, day: string }} WeekItem
 * @typedef {{ iso: string, cell: HTMLElement, head: HTMLElement, track: HTMLElement, items: WeekItem[], now: HTMLElement,
 *   more: HTMLElement | null, moreButton: HTMLButtonElement | null, hidden: WeekItem[] }} WeekDay
 * @typedef {{ el: HTMLElement, zone: string, locale: string, now: () => number, strings: Strings, decorate?: WeekOptions['decorate'],
 *   start: string, days: number, events: WeekEvent[], state: WeekState, active: string | null, grid: HTMLElement,
 *   axis: HTMLElement, cols: WeekDay[], frame: HTMLElement, busy: HTMLElement | null, leaving: Promise<unknown> | null, held: number[] | null, stateLine: HTMLElement, plate: HTMLElement, plateKey: string, plateText: string, plateArt: Node | string | null, title: HTMLElement | null, today: HTMLButtonElement | null, legend: HTMLElement,
 *   motion: { gone: boolean, stop: (() => void) | null, asked: boolean },
 *   pills: Map<string, HTMLButtonElement>, timer: number, observer: ResizeObserver | null, mode: 'grid' | 'list',
 *   upcoming: { n: number, on: boolean, list: HTMLOListElement | null, rows: Map<string, HTMLLIElement>, items: WeekItem[] } }} WeekModel
 */

/** @type {WeakMap<Element, WeekModel>} */
const weeks = new WeakMap();
let idSeq = 0;
/** The gap between two stacked pills, px. */
const GAP = 2;
/** The hours the axis names. */
const AXIS_HOURS = [0, 6, 12, 18, 24];

/** Two digits. @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** @param {number | string} when @returns {number} */
const toMs = (when) => (typeof when === 'number' ? when : Date.parse(when));

/** @param {Element} host @returns {string | undefined} */
const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/**
 * Where the pills of one column stand: each at its time of day, pushed down
 * until it clears the one above, and pulled back up where the stack would run
 * out of the bottom. Pure; every number is px of the column's height.
 *
 * @param {number[]} wants each pill's wanted top, as a share of the column (0 to 1), in time order
 * @param {number} height the column's height
 * @param {number} pill one pill's height
 * @param {number} [gap] the space kept between two pills
 * @returns {number[]} each pill's top
 */
export function stackPills(wants, height, pill, gap = GAP) {
    const step = pill + gap;
    const max = Math.max(0, height - pill);
    const tops = wants.map((want) => Math.min(Math.max(0, want * height), max));
    for (let i = 1; i < tops.length; i += 1) tops[i] = Math.max(tops[i] ?? 0, (tops[i - 1] ?? 0) + step);
    const last = tops.length - 1;
    if (last >= 0 && (tops[last] ?? 0) > max) {
        tops[last] = max;
        for (let i = last - 1; i >= 0; i -= 1) tops[i] = Math.min(tops[i] ?? 0, (tops[i + 1] ?? 0) - step);
    }
    return tops;
}

/**
 * How many pills a column of `height` holds at one pill's height.
 * @param {number} height
 * @param {number} pill
 * @param {number} [gap]
 * @returns {number}
 */
export function pillCapacity(height, pill, gap = GAP) {
    return Math.max(1, Math.floor((height - pill) / (pill + gap)) + 1);
}

/** @param {WeekModel} c @param {string} iso */
const dayName = (c, iso, style = /** @type {'short' | 'long'} */ ('short')) =>
    new Intl.DateTimeFormat(c.locale, { weekday: style, timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`));

/** `17/10` for the head, `17/10/2026` for a name. @param {string} iso @param {boolean} [year] */
const dm = (iso, year = false) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}${year ? `/${iso.slice(0, 4)}` : ''}`;

/** @param {WeekModel} c @param {WeekEvent} e @param {string} hhmm @param {string} iso */
function nameOf(c, e, hhmm, iso) {
    const s = c.strings;
    const state =
        e.state === 'next'
            ? s.weekNextRun
            : e.state === 'off'
              ? s.weekOff
              : e.state === 'skipped'
                ? s.weekSkipped
                : e.state === 'reference'
                  ? s.weekReference
                  : '';
    return [`${e.label}, ${dayName(c, iso)} ${dm(iso, true)} ${hhmm}`, state, e.detail ?? ''].filter(Boolean).join(', ');
}

/** The time of day of a moment: `{ hhmm, at }`, `at` a share of the day (0 to 1). @param {WeekModel} c @param {number} ms */
function timeOfDay(c, ms) {
    const w = wallTime(ms, c.zone);
    return { hhmm: `${two(w.hour)}:${two(w.minute)}`, at: (w.hour * 60 + w.minute) / 1440 };
}

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
function watchArrivals(c) {
    if (c.motion.asked) return;
    c.motion.asked = true;
    void import('./motion.js').then((m) => {
        if (!c.motion.gone) c.motion.stop = m.easeSize(c.el);
    });
}

/** Build the chrome once; the days are filled by paint(). @param {WeekModel} c */
function build(c) {
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
function buildDays(c) {
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

/** A pill for an item, kept by id. @param {WeekModel} c @param {WeekEvent} e */
function pillFor(c, e) {
    let button = c.pills.get(e.id);
    const doc = c.el.ownerDocument;
    const reference = e.state === 'reference';
    if (button && (button.tagName === 'BUTTON') === reference) {
        button.remove();
        button = undefined;
    }
    if (!button) {
        button = /** @type {HTMLButtonElement} */ (make(doc, reference ? 'span' : 'button', 'kp-week__pill'));
        if (!reference) button.type = 'button';
        button.append(make(doc, 'b', 'kp-week__time'), make(doc, 'span', 'kp-week__label'));
        c.pills.set(e.id, button);
        c.decorate?.(button, { kind: 'pill', host: c.el, key: keyOf(c.el), id: e.id });
    }
    button.dataset.kpId = e.id;
    return button;
}

/** Grid or list, as the container query has it now. @param {WeekModel} c @returns {'grid' | 'list'} */
const modeOf = (c) => (getComputedStyle(c.grid).getPropertyValue('--kp-week-mode').trim() === 'list' ? 'list' : 'grid');

/** Whether the agenda shows its upcoming list now: asked for, and in rows. @param {WeekModel} c */
const upcomingOn = (c) => c.upcoming.n > 0 && c.upcoming.list !== null && modeOf(c) === 'list';

/** The states that are not a coming run. */
const NOT_UPCOMING = new Set(['off', 'skipped', 'reference']);

/**
 * The next `n` items from now, in time order, of every day of the range.
 * @param {WeekModel} c @param {number} now
 * @returns {WeekItem[]}
 */
function upcomingItems(c, now) {
    return c.cols
        .flatMap((col) => col.items)
        .filter((item) => item.ms >= now && !NOT_UPCOMING.has(item.event.state ?? ''))
        .sort((a, b) => a.ms - b.ms)
        .slice(0, c.upcoming.n);
}

/**
 * Fill the upcoming list: a row per item, the day named on the first row of each day, the item's own pill. Rows are kept
 * by id and moved only when the order changed, so a focused pill keeps its focus.
 * @param {WeekModel} c @param {WeekItem[]} items
 */
function paintUpcoming(c, items) {
    const list = c.upcoming.list;
    if (!list) return;
    const doc = c.el.ownerDocument;
    const today = dayKey(c.now(), c.zone);
    /** @type {HTMLLIElement[]} */
    const wanted = [];
    let lastDay = '';
    for (const item of items) {
        let row = c.upcoming.rows.get(item.event.id);
        if (!row) {
            row = /** @type {HTMLLIElement} */ (make(doc, 'li', 'kp-week__next'));
            const head = make(doc, 'div', 'kp-week__head');
            head.setAttribute('aria-hidden', 'true');
            row.append(head);
            c.upcoming.rows.set(item.event.id, row);
        }
        const head = /** @type {HTMLElement} */ (row.firstElementChild);
        const first = item.day !== lastDay;
        lastDay = item.day;
        const key = `${item.day}|${first}|${item.day === today}`;
        if (head.dataset.kpKey !== key) {
            head.dataset.kpKey = key;
            head.replaceChildren(
                // One line, as tall as a pill: the weekday (or Today) and the date.
                ...(first
                    ? [
                          make(doc, 'span', 'kp-week__dow', dayName(c, item.day)),
                          make(doc, 'span', 'kp-week__today', c.strings.weekToday),
                          make(doc, 'span', 'kp-week__date', dm(item.day)),
                      ]
                    : []),
            );
        }
        row.toggleAttribute('data-kp-today', item.day === today);
        row.toggleAttribute('data-kp-day-start', first);
        if (row.lastElementChild !== item.button) row.append(item.button);
        wanted.push(row);
    }
    const have = /** @type {HTMLElement[]} */ ([...list.children]);
    if (wanted.length !== have.length || wanted.some((row, i) => row !== have[i])) {
        const keep = new Set(/** @type {Element[]} */ (wanted));
        for (const row of have) if (!keep.has(row)) row.remove();
        list.append(...wanted);
    }
    for (const [id, row] of c.upcoming.rows) if (!row.isConnected) c.upcoming.rows.delete(id);
    c.upcoming.items = items;
    // A week with nothing still to come says so in the list's own row; loading and failing say it over the list.
    const none = c.upcoming.on && c.state === 'ready' && c.leaving === null && items.length === 0;
    let empty = /** @type {HTMLLIElement | null} */ (list.querySelector(':scope > .kp-week__next--empty'));
    if (none && !empty) {
        empty = /** @type {HTMLLIElement} */ (make(doc, 'li', 'kp-week__next kp-week__next--empty'));
        empty.append(make(doc, 'span', 'kp-week__head'), make(doc, 'span', 'kp-week__none'));
        list.append(empty);
    }
    if (empty && !none) empty.remove();
    const words = c.el.dataset.kpWeekUpcomingEmpty || c.strings.weekEmpty;
    const none2 = empty?.querySelector('.kp-week__none');
    if (none && none2 && none2.textContent !== words) none2.textContent = words;
}

/**
 * In rows (below 40rem) a day is as tall as its items, so a week that loads again would fold every day shut and open
 * it again when the items come. Instead each day keeps the height it had while the week loads, and lets go of it only
 * once the items that end the load have arrived, so the same items move nothing; a first load starts from the days'
 * own height, as a data table's first load starts from its skeleton rows. In columns the days have a fixed height.
 * @param {WeekModel} c
 */
function holdRows(c) {
    // The upcoming list holds as one [kpadopt3]; the day rows each hold their own.
    const boxes = c.upcoming.on && c.upcoming.list ? [c.upcoming.list] : c.cols.map((col) => col.track);
    if (c.state === 'loading') {
        // The list is held to the fraction of a pixel, so its 8 rows and its hold are the same height.
        if (c.held === null && c.mode === 'list')
            c.held = boxes.map((box) => (c.upcoming.on ? box.getBoundingClientRect().height : box.offsetHeight));
        if (c.held) for (const [i, box] of boxes.entries()) box.style.setProperty('--kp-week-hold', `${c.held[i] ?? 0}px`);
        return;
    }
    if (c.held === null) return;
    const held = c.held;
    const until = performance.now() + 6000;
    const win = c.el.ownerDocument.defaultView ?? window;
    const letGo = () => {
        if (c.held !== held || c.state === 'loading') return;
        // The upcoming list stands beside the grid, not in it: its arriving rows are looked for there [kpadopt3].
        const scope = c.upcoming.on && c.upcoming.list ? c.upcoming.list : c.grid;
        const busy = c.leaving || scope.querySelector('[data-kp-arriving], [data-kp-leaving], [data-kp-reversing]');
        if (busy && performance.now() < until) {
            win.requestAnimationFrame(letGo);
            return;
        }
        c.held = null;
        for (const box of boxes) box.style.removeProperty('--kp-week-hold');
    };
    // Two frames first: the arrivals are set going by the theme's watcher after this paint.
    win.requestAnimationFrame(() => win.requestAnimationFrame(letGo));
}

/**
 * Lays the busy layer over the days' columns (in rows, over the items' column), measured from the columns themselves:
 * the day heads and the hour axis stay readable beside it, as the data table's header stays above its layer.
 * @param {WeekModel} c
 */
function placeBusy(c) {
    const layer = c.busy;
    if (!layer || !c.cols.length) return;
    const host = c.frame.getBoundingClientRect();
    const boxes = (c.upcoming.on && c.upcoming.list ? [c.upcoming.list] : c.cols.map((col) => col.track)).map((box) => box.getBoundingClientRect());
    const top = Math.min(...boxes.map((b) => b.top));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    const left = Math.min(...boxes.map((b) => b.left));
    const right = Math.max(...boxes.map((b) => b.right));
    layer.style.setProperty('--kp-busy-overlay-top', `${Math.max(0, Math.round(top - host.top))}px`);
    layer.style.setProperty('--kp-busy-overlay-bottom', `${Math.max(0, Math.round(host.bottom - bottom))}px`);
    layer.style.setProperty('--kp-busy-overlay-left', `${Math.max(0, Math.round(left - host.left))}px`);
    layer.style.setProperty('--kp-busy-overlay-right', `${Math.max(0, Math.round(host.right - right))}px`);
}

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
        const gone = import('./motion.js').then((m) => {
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
function paint(c) {
    const s = c.strings;
    const doc = c.el.ownerDocument;
    const byDay = new Map(c.cols.map((col) => [col.iso, /** @type {WeekItem[]} */ ([])]));
    const live = new Set();
    for (const event of c.events) {
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
function layout(c) {
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

let menuModule = /** @type {Promise<typeof import('./menu-button.js')> | null} */ (null);

/** The `+N` of one column: a menu button listing what did not fit. @param {WeekModel} c @param {WeekDay} col @param {number} [top] */
function foldMenu(c, col, top = 0) {
    const doc = c.el.ownerDocument;
    const n = col.hidden.length;
    if (!n) {
        col.more?.setAttribute('hidden', '');
        return;
    }
    if (!col.more) {
        const wrapper = make(doc, 'div', 'kp-menu-button kp-week__more');
        wrapper.setAttribute('data-kp-menu-button', '');
        const button = make(doc, 'button', 'kp-week__pill kp-week__pill--more');
        button.type = 'button';
        const menu = make(doc, 'div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        wrapper.append(button, menu);
        col.track.append(wrapper);
        col.more = wrapper;
        col.moreButton = button;
        c.decorate?.(button, { kind: 'more', host: c.el, key: keyOf(c.el), id: col.iso });
        menuModule ??= import('./menu-button.js');
        void menuModule.then((m) => {
            m.attachMenuButtons(wrapper);
            fillMenu(c, col);
        });
        wrapper.addEventListener('kp-menu-select', (event) => {
            const id = /** @type {CustomEvent} */ (event).detail?.value;
            const item = col.hidden.find((i) => i.event.id === id) ?? col.items.find((i) => i.event.id === id);
            if (item) open(c, item, 'keyboard');
        });
    }
    col.more.removeAttribute('hidden');
    col.more.style.setProperty('--kp-week-top', `${top}px`);
    const text = c.strings.weekMore(n);
    if (col.moreButton && col.moreButton.textContent !== text) col.moreButton.textContent = text;
    col.moreButton?.setAttribute('aria-label', c.strings.weekMoreLabel(n, `${dayName(c, col.iso)} ${dm(col.iso, true)}`));
    void menuModule?.then(() => fillMenu(c, col));
}

/** @param {WeekModel} c @param {WeekDay} col */
function fillMenu(c, col) {
    if (!col.more) return;
    void menuModule?.then((m) => {
        if (!col.more?.isConnected) return;
        m.setMenu(col.more, [
            {
                group: '',
                items: col.hidden.map((i) => ({
                    label: `${i.hhmm} ${i.event.label}`,
                    value: i.event.id,
                    ...(i.event.detail ? { hint: i.event.detail } : {}),
                    ...(i.event.state === 'reference' ? { disabled: c.strings.weekReference } : {}),
                })),
            },
        ]);
    });
}

/** The pills a person can reach, per column, in time order. @param {WeekModel} c @param {WeekDay} col */
function reachable(c, col) {
    const list = col.items.filter((i) => i.button.tagName === 'BUTTON' && !(c.mode === 'grid' && i.button.hasAttribute('data-kp-overflow')));
    return /** @type {HTMLElement[]} */ (list.map((i) => i.button)).concat(
        col.hidden.length && col.moreButton && c.mode === 'grid' ? [col.moreButton] : [],
    );
}

/** One tab stop: the active pill. @param {WeekModel} c */
function syncTabStops(c) {
    const all = /** @type {HTMLElement[]} */ (
        c.cols.flatMap((col) => [...col.items.map((i) => i.button), ...(col.moreButton ? [col.moreButton] : [])])
    );
    if (c.upcoming.on) {
        // The upcoming list [kpadopt3]: the tab stop is the active pill when it is listed, else the first listed.
        const listed = c.upcoming.items.map((i) => i.button).filter((b) => b.tagName === 'BUTTON');
        const stop = listed.find((b) => b.dataset.kpId === c.active) ?? listed[0];
        for (const el of all) el.tabIndex = el === stop ? 0 : -1;
        return;
    }
    let target = c.active ? c.pills.get(c.active) : undefined;
    if (!target || !all.includes(target) || (c.mode === 'grid' && target.hasAttribute('data-kp-overflow'))) {
        target = /** @type {HTMLButtonElement | undefined} */ (c.cols.flatMap((col) => reachable(c, col))[0]);
    }
    for (const el of all) el.tabIndex = el === target ? 0 : -1;
}

/** @param {WeekModel} c @param {WeekItem} item @param {'pointer' | 'keyboard'} source */
function open(c, item, source) {
    c.el.dispatchEvent(new CustomEvent(WEEK_OPEN_EVENT, { bubbles: true, detail: { id: item.event.id, event: item.event, source } }));
}

/** The now-line and the past marks. @param {WeekModel} c */
function tick(c) {
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

/** Move the roving focus. @param {WeekModel} c @param {HTMLElement} to */
function focusPill(c, to) {
    c.active = to.dataset.kpId ?? c.active;
    syncTabStops(c);
    if (to.tabIndex !== 0) to.tabIndex = 0;
    to.focus();
}

/**
 * Attach every week agenda under `root`.
 * @param {ParentNode} [root]
 * @param {WeekOptions} [options]
 * @returns {() => void} detach
 */
export function attachWeeks(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(WEEK)])) {
        if (weeks.has(el)) continue;
        const zone = options.timeZone ?? el.dataset.kpTimeZone ?? CHART_TIME_ZONE;
        const now = options.now ?? (() => Date.now());
        const days = Math.min(14, Math.max(1, Number(el.dataset.kpWeekDays) || 7));
        /** @type {WeekModel} */
        const c = {
            el,
            zone,
            locale: resolveLocale(options.locale ?? el.dataset.kpLocale, el),
            now,
            strings: resolveStrings(options.strings),
            ...(options.decorate ? { decorate: options.decorate } : {}),
            start: el.dataset.kpWeekStart ?? dayKey(now(), zone),
            days,
            events: [],
            state: 'ready',
            active: null,
            grid: el,
            axis: el,
            cols: [],
            frame: el,
            busy: null,
            leaving: null,
            held: null,
            stateLine: el,
            plate: el,
            plateKey: '',
            plateText: '',
            plateArt: null,
            title: null,
            today: null,
            motion: { gone: false, stop: null, asked: false },
            legend: el,
            pills: new Map(),
            timer: 0,
            observer: null,
            mode: 'grid',
            upcoming: {
                n: Math.max(0, Math.min(50, Number.parseInt(el.dataset.kpWeekUpcoming ?? '', 10) || 0)),
                on: false,
                list: null,
                rows: new Map(),
                items: [],
            },
        };
        weeks.set(el, c);
        build(c);
        buildDays(c);
        paint(c);
        // The one hover card of the page carries each item's detail.
        void import('./hovercard.js').then((m) => m.attachHoverCards(el.ownerDocument));
        if (c.title) watchArrivals(c);

        /** @param {Event} event */
        const pillOf = (event) =>
            event.target instanceof Element ? /** @type {HTMLElement | null} */ (event.target.closest('.kp-week__pill')) : null;
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const pill = pillOf(event);
            if (!pill || pill.classList.contains('kp-week__pill--more') || pill.tagName !== 'BUTTON') return;
            const item = c.cols.flatMap((col) => col.items).find((i) => i.button === pill);
            if (!item) return;
            c.active = item.event.id;
            syncTabStops(c);
            open(c, item, event.detail === 0 ? 'keyboard' : 'pointer');
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const pill = pillOf(event);
            if (!pill || event.altKey || event.ctrlKey || event.metaKey) return;
            if (c.upcoming.on && c.upcoming.list?.contains(pill)) {
                const listed = c.upcoming.items.map((i) => i.button).filter((b) => b.tagName === 'BUTTON');
                const at = listed.indexOf(/** @type {HTMLButtonElement} */ (pill));
                const to =
                    event.key === 'ArrowDown'
                        ? listed[Math.min(listed.length - 1, at + 1)]
                        : event.key === 'ArrowUp'
                          ? listed[Math.max(0, at - 1)]
                          : event.key === 'Home'
                            ? listed[0]
                            : event.key === 'End'
                              ? listed[listed.length - 1]
                              : undefined;
                if (!to) return;
                event.preventDefault();
                focusPill(c, to);
                return;
            }
            const colIndex = c.cols.findIndex((col) => col.track.contains(pill));
            const col = c.cols[colIndex];
            if (!col) return;
            const own = reachable(c, col);
            const at = own.indexOf(pill);
            /** @type {HTMLElement | undefined} */
            let to;
            if (event.key === 'ArrowDown') to = own[Math.min(own.length - 1, at + 1)];
            else if (event.key === 'ArrowUp') to = own[Math.max(0, at - 1)];
            else if (event.key === 'Home') to = own[0];
            else if (event.key === 'End') to = own[own.length - 1];
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                const rtl = getComputedStyle(c.grid).direction === 'rtl';
                const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
                const mine = c.cols.flatMap((x) => x.items).find((i) => i.button === pill)?.at ?? 0.5;
                for (let k = colIndex + step; k >= 0 && k < c.cols.length && !to; k += step) {
                    const there = c.cols[k];
                    if (!there) break;
                    const list = reachable(c, there);
                    if (!list.length) continue;
                    const stamp = (/** @type {HTMLElement} */ el) => c.cols.flatMap((x) => x.items).find((i) => i.button === el)?.at ?? 1;
                    to = list.reduce(
                        (best, el) => (Math.abs(stamp(el) - mine) < Math.abs(stamp(best) - mine) ? el : best),
                        /** @type {HTMLElement} */ (list[0]),
                    );
                }
            }
            if (!to) return;
            event.preventDefault();
            focusPill(c, to);
        };
        /** @param {Event} event */
        const onNav = (event) => {
            const target = event.target instanceof Element ? event.target.closest('button') : null;
            if (!target || target.getAttribute('aria-disabled') === 'true') return;
            let next = c.start;
            if (target.hasAttribute('data-kp-week-prev')) next = shiftDay(c.start, -c.days);
            else if (target.hasAttribute('data-kp-week-next')) next = shiftDay(c.start, c.days);
            else if (target.hasAttribute('data-kp-week-today')) next = dayKey(c.now(), c.zone);
            else return;
            if (next === c.start) return;
            setWeekStart(el, next);
            el.dispatchEvent(new CustomEvent(WEEK_RANGE_EVENT, { bubbles: true, detail: { start: next, source: 'nav' } }));
        };
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKey);
        el.addEventListener('click', onNav);
        c.timer = window.setInterval(() => tick(c), WEEK_TICK_MS);
        // The pill's height is the CSS's; a change of width can flip grid and list, a font arriving changes the pill.
        if (typeof ResizeObserver !== 'undefined') {
            let last = '';
            c.observer = new ResizeObserver(() => {
                placeBusy(c);
                const key = `${c.grid.clientWidth}x${c.cols[0]?.track.clientHeight ?? 0}`;
                if (key === last) return;
                last = key;
                // Crossing 40rem with an upcoming list moves the pills between the list and the days: a paint, not a layout.
                if (c.upcoming.n > 0 && upcomingOn(c) !== c.upcoming.on) {
                    paint(c);
                    return;
                }
                layout(c);
                syncTabStops(c);
            });
            c.observer.observe(c.grid);
            if (c.upcoming.list) c.observer.observe(c.upcoming.list);
        }
        undo.push(() => {
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onKey);
            el.removeEventListener('click', onNav);
            window.clearInterval(c.timer);
            c.observer?.disconnect();
            c.motion.gone = true;
            c.motion.stop?.();
            weeks.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * The items of the range. Repaints in place, by id: a pill that is still there
 * keeps its node, its focus and its place in the tab order, so a live update
 * never moves a reader. A week that was loading is ready from here on.
 * @param {Element} el
 * @param {WeekEvent[]} events
 */
export function setWeekEvents(el, events) {
    const c = weeks.get(el);
    if (!c) return;
    c.events = events;
    if (c.state === 'loading' || (c.state === 'empty' && events.length)) c.state = 'ready';
    else if (c.state === 'ready' && !events.length) c.state = 'empty';
    paint(c);
}

/**
 * The agenda as a whole: `loading` (the data table's busy panel over the empty days), `ready`,
 * `empty` or `error`: the package's state plate over the whole agenda (`words` its heading, in the page's words; `text` its
 * sentence; `art` a picture over the heading), an error with a Retry that fires `kp-week-retry` [state-plates-1019].
 * @param {Element} el
 * @param {WeekState} state
 * @param {string} [words]
 * @param {{ text?: string, art?: Node | string | null }} [plate]
 */
export function setWeekState(el, state, words = '', { text = '', art = null } = {}) {
    const c = weeks.get(el);
    if (!c) return;
    if (state === 'loading') watchArrivals(c);
    c.state = state;
    c.stateLine.dataset.kpWords = words;
    c.plateText = text;
    c.plateArt = art;
    paint(c);
}

/**
 * Move the range to start on `iso` (`YYYY-MM-DD`); no event, the page asked.
 * The items stay until the page gives the new ones.
 * @param {Element} el
 * @param {string} iso
 */
export function setWeekStart(el, iso) {
    const c = weeks.get(el);
    if (!c) return;
    c.start = iso;
    buildDays(c);
    paint(c);
}

/**
 * The legend under the agenda: a swatch and its words per series, in the
 * order given; none hides it.
 * @param {Element} el
 * @param {{ series: 1 | 2 | 3 | 4 | 5, label: string }[]} entries
 */
export function setWeekLegend(el, entries) {
    const c = weeks.get(el);
    if (!c) return;
    const doc = c.el.ownerDocument;
    c.legend.replaceChildren(
        ...entries.map(({ series, label }) => {
            const li = make(doc, 'li');
            const swatch = make(doc, 'span', 'kp-week__swatch');
            swatch.dataset.kpSeries = String(series);
            swatch.setAttribute('aria-hidden', 'true');
            li.append(swatch, make(doc, 'span', '', label));
            return li;
        }),
    );
    c.legend.hidden = entries.length === 0;
}
