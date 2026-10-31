// The functions a page calls to set the events, state, start and legend of a week.
import { buildDays, watchArrivals } from './build.js';
import { make } from './helpers.js';
import { paint } from './paint.js';
import { weeks } from './state.js';
/** @typedef {import('./types.js').WeekEvent} WeekEvent */
/** @typedef {import('./types.js').WeekState} WeekState */

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
