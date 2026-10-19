// The next times: what a repetition really does [kpadopt5-time; homelab's `.sch-preview`].
//
// Under a schedule's settings a short list says when it will run next, so the person sees what the setting means
// ("Mon 20/10/2026 03:00 · in 2 days"). The app owns the rule and computes the times; the package draws them:
//
//   <div class="kp-runs" data-kp-runs data-kp-runs-count="3"></div>
//   setRuns(el, [Date.parse('2026-10-20T03:00:00+02:00'), …]);
//
// A time is a number (ms), an ISO string or a Date, or `{ at, conflict }` where `conflict` is a sentence the app words
// ("Overlaps the backup of vault"); the row then carries it as a warning mark. Times are written as rule 52 does,
// with the weekday, in Europe/Brussels unless `data-kp-time-zone` names another zone; beside each stands how far away it
// is ("in 2 days"). A run that comes after the clock was turned (summer or winter time) carries the mark "Clock goes
// back 1 h": the wall time is the schedule's, the moment is not the same distance from the run before.
//
// Options (markup, then the option of attachRuns()), each with a default [KT6]:
//   data-kp-runs-count     how many rows                         3
//   data-kp-runs-relative  "false" leaves the "in 2 days" out    shown
//   data-kp-runs-warn      "false" leaves the marks out          shown
//   data-kp-runs-more      N: a "Show N more" for times past the count   off
//   data-kp-runs-title     the heading over the list             "Next times"
//   data-kp-time-zone      an IANA zone                          Europe/Brussels
//   data-kp-now            an ISO moment: a fixed clock for a demo or a test   the real clock
//
// States, all in the same footprint (the height of `count` rows, so nothing under it moves):
//   ready    the rows;
//   empty    the app's reason, centred at heading size in the package's empty plate: `setRuns(el, [], { reason })`;
//   loading  the theme's busy card over placeholder rows (setRunsState(el, 'loading'));
//   error    "Could not work out the next times" with a Try again, which fires `kp-runs-retry`.
//
// A status region says the first run only when it changes. The relative words are refreshed every minute unless the
// clock is fixed. Nothing runs on import; attachRuns(root) returns a detach.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { statePlate } from './state-plate.js';
import { dayNames } from './weekdays.js';
import { humanDuration } from './freshness.js';
import { CHART_TIME_ZONE, wallTime } from './chart.js';

/** A next-times list. */
export const RUNS = '[data-kp-runs]';
/** Fired on the list, bubbling, when Try again is pressed: `{ element }`. */
export const RUNS_RETRY_EVENT = 'kp-runs-retry';
/** The states a list can be in. */
export const RUNS_STATES = /** @type {const} */ (['ready', 'empty', 'loading', 'error']);

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/**
 * @typedef {number | string | Date | { at: number | string | Date, conflict?: string }} RunInput
 * @typedef {object} Run
 * @property {number} at ms
 * @property {string} [conflict]
 * @typedef {'ready' | 'empty' | 'loading' | 'error'} RunsState
 * @typedef {object} RunsOptions
 * @property {string} [reason] the sentence an empty list shows ("Pick a time")
 * @property {string} [title] an error's first line
 * @property {string} [text] an error's sentence
 */

/**
 * A moment's distance from now in the coarsest honest words: "in 35 min", "in 3 h 20 min", "in 2 days". Pure.
 * @param {number} ms the moment
 * @param {number} now
 * @param {import('./strings.js').Strings} [strings]
 */
export function runsRelative(ms, now, strings = getStrings()) {
    const seconds = Math.round((ms - now) / 1000);
    if (seconds < 30) return strings.runsNow;
    if (seconds < 60) return strings.runsIn(strings.agoSeconds(seconds));
    if (seconds >= 86400) return strings.runsIn(strings.agoDays(Math.floor(seconds / 86400)));
    return strings.runsIn(humanDuration(seconds, strings));
}

/**
 * How far a zone's wall clock runs ahead of UTC at a moment, in minutes. Pure.
 * @param {number} ms @param {string} zone
 */
export function zoneOffset(ms, zone = CHART_TIME_ZONE) {
    const w = wallTime(ms, zone);
    return (Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(ms / 60000) * 60000) / 60000;
}

/**
 * A run as rule 52 writes it with its weekday: "Mon 20/10/2026 03:00". Pure.
 * @param {number} ms @param {string} [zone] @param {string} [locale]
 */
export function runMoment(ms, zone = CHART_TIME_ZONE, locale) {
    const w = wallTime(ms, zone);
    const day = dayNames('short', locale)[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? '';
    return `${day} ${two(w.day)}/${two(w.month)}/${w.year} ${two(w.hour)}:${two(w.minute)}`;
}

/**
 * The hours the clock was turned between two runs: positive when it went forward. 0 when it was not. Pure.
 * @param {number} before @param {number} after @param {string} [zone]
 */
export function clockShift(before, after, zone = CHART_TIME_ZONE) {
    return (zoneOffset(after, zone) - zoneOffset(before, zone)) / 60;
}

/** @param {RunInput} input @returns {Run | null} */
function toRun(input) {
    const raw = typeof input === 'object' && input !== null && !(input instanceof Date) ? input : { at: input };
    const at = raw.at instanceof Date ? raw.at.getTime() : typeof raw.at === 'number' ? raw.at : Date.parse(String(raw.at));
    if (!Number.isFinite(at)) return null;
    return 'conflict' in raw && raw.conflict ? { at, conflict: raw.conflict } : { at };
}

/**
 * @typedef {object} RunsHandle
 * @property {HTMLElement} element
 * @property {(times: readonly RunInput[], options?: RunsOptions) => void} set the times; none is the empty state
 * @property {(state: RunsState, options?: RunsOptions) => void} setState
 * @property {() => Run[]} runs
 * @property {() => RunsState} state
 */

/** @type {WeakMap<Element, RunsHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached list. @param {Element} element */
export function runs(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * Give a list its times (none: the empty state, with `reason`).
 * @param {Element} element @param {readonly RunInput[]} times @param {RunsOptions} [options]
 */
export function setRuns(element, times, options) {
    HANDLES.get(element)?.set(times, options);
}

/**
 * Put a list in a state: ready, empty, loading or error.
 * @param {Element} element @param {RunsState} state @param {RunsOptions} [options]
 */
export function setRunsState(element, state, options) {
    HANDLES.get(element)?.setState(state, options);
}

let seq = 0;

/**
 * Wire every next-times list under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRuns(root = document, { now: nowOption } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(RUNS) ? [root] : []), ...root.querySelectorAll(RUNS)]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = `kp-runs-${++seq}`;
        const zone = el.dataset.kpTimeZone || CHART_TIME_ZONE;
        const count = Math.max(1, Number(el.dataset.kpRunsCount) || 3);
        const more = Math.max(0, Number(el.dataset.kpRunsMore) || 0);
        const relative = el.dataset.kpRunsRelative !== 'false';
        const warn = el.dataset.kpRunsWarn !== 'false';
        const fixed = Date.parse(el.dataset.kpNow ?? '');
        const now = nowOption ?? (Number.isFinite(fixed) ? () => fixed : () => Date.now());
        el.classList.add('kp-runs');
        el.style.setProperty('--kp-runs-count', String(count));
        el.dataset.kpRunsAttached = '';

        const title = doc.createElement('p');
        title.className = 'kp-runs__title';
        title.id = `${id}-title`;
        title.textContent = el.dataset.kpRunsTitle ?? s.runsTitle;
        const stage = doc.createElement('div');
        stage.className = 'kp-runs__stage';
        const list = doc.createElement('ol');
        list.className = 'kp-runs__list';
        list.setAttribute('aria-labelledby', title.id);
        const note = doc.createElement('div');
        note.className = 'kp-runs__state';
        note.hidden = true;
        stage.append(list, note);
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost kp-button--sm kp-runs__more';
        button.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        const live = doc.createElement('p');
        live.className = 'kp-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        el.replaceChildren(title, stage, button, live);

        /** @type {Run[]} */
        let all = [];
        /** @type {RunsState} */
        let state = 'ready';
        /** @type {RunsOptions} */
        let given = {};
        let expanded = false;
        /** @type {import('./busy-card.js').BusyCard | null} */
        let busy = null;
        let lastFirst = NaN;
        let drawn = false;

        /** One row. @param {Run} run @param {number} index @param {number | undefined} before */
        const row = (run, index, before) => {
            const li = doc.createElement('li');
            li.className = 'kp-runs__row';
            const time = doc.createElement('time');
            time.className = 'kp-runs__when';
            time.dateTime = new Date(run.at).toISOString();
            time.textContent = runMoment(run.at, zone, el.lang || undefined);
            li.append(time);
            if (relative) {
                const rel = doc.createElement('span');
                rel.className = 'kp-runs__rel';
                rel.textContent = runsRelative(run.at, now(), s);
                li.append(rel);
            }
            if (warn) {
                const shift = clockShift(before ?? now(), run.at, zone);
                /** @type {string[]} */
                const marks = [];
                if (shift !== 0) marks.push(s.runsClockChange(shift));
                if (run.conflict) marks.push(run.conflict);
                if (marks.length) {
                    const flag = doc.createElement('span');
                    flag.className = 'kp-badge kp-badge--warning kp-runs__flag';
                    flag.textContent = marks.join(' · ');
                    li.append(flag);
                }
            }
            if (index === 0) li.dataset.kpRunsNext = '';
            return li;
        };

        const draw = () => {
            const shown = expanded ? all : all.slice(0, count);
            /** @type {HTMLElement[]} */
            let rows;
            if (state === 'loading' && shown.length === 0) {
                rows = Array.from({ length: count }, () => {
                    const li = doc.createElement('li');
                    li.className = 'kp-runs__row kp-runs__row--wait';
                    li.setAttribute('aria-hidden', 'true');
                    const bar = doc.createElement('span');
                    bar.className = 'kp-skeleton kp-runs__bar';
                    li.append(bar);
                    return li;
                });
            } else rows = shown.map((run, i) => row(run, i, i === 0 ? undefined : shown[i - 1]?.at));
            list.replaceChildren(...rows);
            list.toggleAttribute('inert', state !== 'ready');
            if (state === 'loading') list.setAttribute('aria-busy', 'true');
            else list.removeAttribute('aria-busy');
            button.hidden = !(more > 0 && state === 'ready' && all.length > count);
            button.textContent = expanded ? s.runsFewer : s.runsMore(Math.min(more, all.length - count));
            button.setAttribute('aria-expanded', String(expanded));
        };

        const paintNote = () => {
            note.replaceChildren();
            note.hidden = state !== 'empty' && state !== 'error';
            note.removeAttribute('role');
            if (state === 'empty' || state === 'error') {
                // The package plate (js/state-plate.js), dressed by the part's own class so a theme's runs look stays; the Retry is
                // the delegated `[data-kp-runs-retry]` (it carries `detail.element`) [states-check-1019].
                const failed = state === 'error';
                const plate = statePlate(doc, {
                    kind: failed ? 'error' : 'empty',
                    title: failed ? (given.title ?? s.runsFailed) : (given.reason ?? s.runsEmpty),
                    ...(failed ? { text: given.text ?? s.stateFailedText, actionLabel: s.runsRetry, actionAttribute: 'data-kp-runs-retry' } : {}),
                });
                plate.classList.add(failed ? 'kp-runs__failure' : 'kp-runs__empty');
                plate.querySelector('.kp-stateplate__title')?.classList.add(failed ? 'kp-runs__failure-title' : 'kp-runs__empty-title');
                plate.querySelector('.kp-stateplate__text')?.classList.add('kp-runs__failure-text');
                plate.querySelector('.kp-stateplate__action')?.classList.add('kp-runs__retry');
                note.append(plate);
                note.setAttribute('role', failed ? 'alert' : 'status');
            }
        };

        const sync = () => {
            draw();
            paintNote();
            el.dataset.kpState = state;
            if (state === 'loading' && !busy) {
                busy = openBusyCard(stage, { words: s.runsLoading, area: () => [stage], className: 'kp-runs__busy', arrive: drawn });
            } else if (state !== 'loading' && busy) {
                const b = busy;
                busy = null;
                void b.close();
            }
            drawn = true;
            const first = state === 'ready' ? all[0]?.at : undefined;
            if (first !== undefined && first !== lastFirst) {
                if (Number.isFinite(lastFirst)) live.textContent = s.runsNext(runMoment(first, zone, el.lang || undefined));
                lastFirst = first;
            } else if (first === undefined) lastFirst = NaN;
        };

        /** @type {RunsHandle} */
        const handle = {
            element: el,
            set(times, options = {}) {
                given = options;
                all = times.map(toRun).filter((r) => r !== null);
                expanded = expanded && all.length > count;
                state = all.length === 0 ? 'empty' : 'ready';
                sync();
            },
            setState(next, options = {}) {
                given = { ...given, ...options };
                state = next === 'ready' && all.length === 0 ? 'empty' : next;
                sync();
            },
            runs: () => all.slice(),
            state: () => state,
        };
        HANDLES.set(el, handle);

        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('[data-kp-runs-retry]'))
                el.dispatchEvent(new CustomEvent(RUNS_RETRY_EVENT, { bubbles: true, detail: { element: el } }));
        };
        const onMore = () => {
            expanded = !expanded;
            draw();
        };
        el.addEventListener('click', onClick);
        button.addEventListener('click', onMore);
        const tick = Number.isFinite(fixed) || nowOption ? 0 : window.setInterval(() => state === 'ready' && draw(), 60000);

        // The first state: a page that writes `data-kp-state` and `data-kp-runs-values` (ISO, comma separated) gets it at once.
        const initial = (el.dataset.kpRunsValues ?? '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
        if (el.dataset.kpState === 'loading') handle.setState('loading');
        else handle.set(initial);

        cleanups.push(() => {
            el.removeEventListener('click', onClick);
            button.removeEventListener('click', onMore);
            if (tick) clearInterval(tick);
            busy?.remove();
            HANDLES.delete(el);
            el.replaceChildren();
            el.style.removeProperty('--kp-runs-count');
            delete el.dataset.kpRunsAttached;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
