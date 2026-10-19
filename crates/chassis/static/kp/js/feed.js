// The activity feed: who did what, and when, day by day [gap-activity-feed-1019; the admin dashboard's `feedRow` and `ac-dayhead`].
//
// The homelab dashboard drew this twice (a stack's History tab and the Activity page): a coloured outcome dot, a bold "what", a chip
// naming who started it, a muted detail line, the time on the right, and a heading per day ("Today · Sat 3 Oct", "12 operations ·
// 2 failed"). The package had every part and no row that joins them, so the row is made here from the parts: the status mark's shapes
// (js/statusrow.js), the identity chip (js/idmark.js), the ticking time (js/freshness.js, `kp-ago`), the timeline's rail
// (`kp-timeline`), the thread's day divider (js/thread.js) and the empty and failed plates (js/state-plate.js).
//
//   <div class="kp-feed" data-kp-feed data-kp-feed-unit="operation,operations" aria-label="Activity"></div>
//   setFeed(el, {
//       state: 'ready',
//       rows: [{ key: 'op-1042', state: 'failed', title: 'Update jellyfin', actor: { name: 'Claude', kind: 'agent' },
//                detail: 'Pull failed: registry timeout after 30 s', at: 1760875200000, more: ['$ docker compose pull', '…'] }],
//       total: 129, earlier: 'more', updatedAt: 1760875260000,
//   })
//
// A row is `{ key, title, at }` and, when it has them, a `state` (ok, failed, warn, running or info: a shape and a word as well as a
// colour, as a status row's), an `actor` (`{ name, kind }`: `person` and `agent` get a round chip, anything else a square one), a
// `detail` line, a `href` (the title becomes a link) and `more` (lines that open under the row; the title becomes the disclosure
// button, and a `href` then shows as "Open" inside it). Rows are sorted newest first; the key is the row's identity.
//
// Options, each an attribute (read at every render, so they switch at runtime) and an attribute of the host:
//
//   data-kp-feed-group     `day` (default): a heading per day, "Today", "Yesterday", then the weekday and date, with that day's count
//                          and "N failed" (or "all ok"); `none`: one list
//   data-kp-feed-summary   `on` (default) | `off`: the count on each day heading
//   data-kp-feed-unit      "operation,operations": the app's word for a row; default "event,events"
//   data-kp-feed-time      `auto` (default): "12 min ago" for the first 24 hours (a ticking `kp-ago`), then dd/mm/yyyy HH:mm;
//                          `relative` always the ago line; `clock` the ago line, then HH:mm under a day heading; `moment` always dd/mm/yyyy HH:mm
//   data-kp-feed-actor     `chip` (default): mark and name; `mark`: the mark alone (the name is its title and its screen-reader text); `off`
//   data-kp-feed-expand    `many` (default): any number of rows open; `one`: opening a row closes the others; `off`: rows with `more` are not openable
//   data-kp-feed-rail      `on` (default): the timeline's rule joins the marks of one day; `off`
//   data-kp-feed-head      `on` (default): the count and the freshness line above the list; `off`
//   data-kp-feed-max       a CSS length: the list scrolls inside that height and the day headings stay at its top
//   data-kp-feed-level     the heading level of a day heading (default 3)
//
// States, as `model.state`: `ready`; `loading` (rows' skeleton under the theme's busy card, the loaded height held by js/footprint.js);
// `empty` (the empty plate, "Nothing happened yet", the reason in `emptyText`); `error` (the failed plate with Retry). A refresh that
// failed while the rows are still good is not an error: `model.stale = { reason, since }` keeps the rows and says, in the head line,
// "Not refreshed: …. Rows from 14:02." with a button that reads it again. "Load earlier" is `model.earlier`: `more` (a button),
// `loading` (the button at work), `error` (the sentence and Try again) or `end` (nothing earlier, said once); anything else leaves
// the foot empty. Its room is always reserved, so the rows do not move when it changes.
//
// Events (bubbling, on the host): `kp-feed-retry` {}, `kp-feed-earlier` {} and `kp-feed-open` { key, open }. The page decides what a retry
// is and answers with setFeed(). A re-render keeps the focus on the row it was on, by key, and the rows that were open stay open.
// Every word is in js/strings.js. Nothing runs on import; attachFeeds(root) returns a detach.

import { openBusyCard } from './busy-card.js';
import { agoMoment, attachAgo, setAgo } from './freshness.js';
import { idmarkColours, setIdmark } from './idmark.js';
import { statePlate } from './state-plate.js';
import { getStrings } from './strings.js';

/** An activity feed. */
export const FEED = '[data-kp-feed]';
/** Fired on the host, bubbling, when Retry is pressed on the failed plate or "Read it again" on a stale feed. */
export const FEED_RETRY_EVENT = 'kp-feed-retry';
/** Fired on the host, bubbling, when "Load earlier" (or its Try again) is pressed. The page answers with `earlier: 'loading'` and then the rows. */
export const FEED_EARLIER_EVENT = 'kp-feed-earlier';
/** Fired on the host, bubbling, when a row opens or closes: `{ key, open }`. */
export const FEED_OPEN_EVENT = 'kp-feed-open';
/** The states a row can be in. */
export const FEED_ROW_STATES = /** @type {const} */ (['ok', 'failed', 'warn', 'running', 'info']);
/** The states the feed can be in. */
export const FEED_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** The states of the "Load earlier" foot. */
export const FEED_EARLIER = /** @type {const} */ (['more', 'loading', 'error', 'end']);
/** The zone a day is counted in, whatever the reader's (rule 52); the same as js/freshness.js. */
export const FEED_TIME_ZONE = 'Europe/Brussels';
/** Rows younger than this show the ago line (time `auto` and `clock`) [ms]. */
export const FEED_RELATIVE_MS = 24 * 60 * 60 * 1000;
/** How often the day headings and the ago-or-moment choice are looked at again [ms]. */
export const FEED_TICK_MS = 30000;

/**
 * @typedef {'ok' | 'failed' | 'warn' | 'running' | 'info'} FeedRowState
 * @typedef {object} FeedActor
 * @property {string} name who or what started it ("Claude", "Kenny", "nightly round")
 * @property {string} [kind] `person` and `agent` get a round chip; anything else (a schedule, the system) a square one
 * @typedef {object} FeedRow
 * @property {string} key stable id: the same key is the same row on every refresh
 * @property {string} title what happened, in one line
 * @property {number} at when, ms since the epoch
 * @property {FeedRowState} [state] its outcome; a row without one has an empty mark
 * @property {FeedActor} [actor]
 * @property {string} [detail] the muted line under the title
 * @property {string} [href] where the title goes
 * @property {string[]} [more] lines that open under the row (a log excerpt); the title becomes the disclosure button
 * @typedef {object} FeedStale
 * @property {string} reason why the refresh failed, in plain words
 * @property {number} [since] when the rows on screen were read
 * @typedef {object} FeedModel
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {FeedRow[]} [rows]
 * @property {number} [total] how many rows there are in all (exact); default the number given
 * @property {'more' | 'loading' | 'error' | 'end'} [earlier] the "Load earlier" foot
 * @property {number} [updatedAt] when the feed was read last, for the freshness line
 * @property {FeedStale | null} [stale]
 * @property {string} [error] why it could not be read (the failed plate's sentence)
 * @property {string} [emptyText] why there is nothing (the empty plate's sentence)
 * @typedef {object} FeedHandle
 * @property {HTMLElement} element
 * @property {(model: FeedModel) => void} set
 * @property {() => string[]} openKeys the keys of the rows that are open
 * @property {(keys: readonly string[] | 'all') => void} setOpen open exactly these rows (or every row that has lines), close the rest; fires no event
 * @property {() => void} render draw again, with the options as they stand now
 */

/** @type {WeakMap<Element, FeedHandle>} */
const handles = new WeakMap();

/** The handle of an attached feed. @param {Element} element */
export const feedOf = (element) => handles.get(element) ?? null;

/**
 * Give a feed its rows, or its state.
 * @param {Element} element @param {FeedModel} model
 */
export function setFeed(element, model) {
    handles.get(element)?.set(model);
}

/** The attributes that are options, by the short name the module reads them under; a change of one redraws the feed. */
const OPTION_ATTRIBUTES = /** @type {const} */ ({
    group: 'data-kp-feed-group',
    summary: 'data-kp-feed-summary',
    unit: 'data-kp-feed-unit',
    time: 'data-kp-feed-time',
    actor: 'data-kp-feed-actor',
    expand: 'data-kp-feed-expand',
    rail: 'data-kp-feed-rail',
    head: 'data-kp-feed-head',
    max: 'data-kp-feed-max',
    level: 'data-kp-feed-level',
});
const OPTIONS = Object.values(OPTION_ATTRIBUTES);

/**
 * Wire every feed under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number, timeZone?: string }} [options] `now` so a test never reads the real clock
 * @returns {() => void} detach
 */
export function attachFeeds(root = document, { now = () => Date.now(), timeZone = FEED_TIME_ZONE } = {}) {
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof Element && root.matches(FEED) ? [root] : []), ...root.querySelectorAll(FEED)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) if (!handles.has(el)) undo.push(wire(el, now, timeZone));
    undo.push(attachAgo(root, { now, timeZone }));
    return () => undo.forEach((u) => u());
}

let idSeq = 0;

/**
 * The Brussels calendar day of a moment as a sortable key, `2026-10-19`.
 * @param {number} ms @param {string} zone
 */
const dayKey = (ms, zone) => agoMoment(ms, zone).slice(0, 10).split('/').reverse().join('-');

/**
 * @param {HTMLElement} el
 * @param {() => number} now
 * @param {string} zone
 * @returns {() => void}
 */
function wire(el, now, zone) {
    const doc = el.ownerDocument;
    const s = () => getStrings();
    const make = (/** @type {string} */ tag, /** @type {string} */ className, /** @type {string} */ text = '') => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const id = `kp-feed-${(idSeq += 1)}`;
    el.classList.add('kp-feed');

    /** @type {FeedModel} */
    let model = { state: 'ready', rows: [] };
    /** The rows that are open, by key. @type {Set<string>} */
    const open = new Set();
    /** The keys the last render showed, for the announcement of new ones. @type {Set<string> | null} */
    let seen = null;
    /** @type {import('./busy-card.js').BusyCard | null} */
    let busy = null;
    let lastSaid = 0;
    /** The day the headings were last drawn for, and the moment the next row turns from an ago line into a moment. */
    let drawnDay = '';
    let nextFlip = Infinity;

    // --- The parts. ---
    const head = make('div', 'kp-feed__head');
    const count = make('span', 'kp-feed__count');
    const fresh = /** @type {HTMLElement} */ (make('time', 'kp-ago kp-feed__fresh'));
    fresh.setAttribute('data-kp-ago', '');
    const stale = make('div', 'kp-feed__stale');
    const staleText = make('span', 'kp-feed__stale-text');
    const staleAction = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-feed__stale-action'));
    staleAction.type = 'button';
    staleAction.setAttribute('data-kp-feed-retry', '');
    stale.append(staleText, staleAction);
    head.append(count, fresh, stale);
    const body = make('div', 'kp-feed__body');
    const skeleton = make('div', 'kp-feed__skeleton');
    skeleton.setAttribute('aria-hidden', 'true');
    const list = make('ol', 'kp-feed__list');
    const state = make('div', 'kp-feed__state');
    body.append(skeleton, list, state);
    const foot = make('div', 'kp-feed__foot');
    const voice = make('span', 'kp-sr-only');
    voice.setAttribute('role', 'status');
    voice.setAttribute('aria-live', 'polite');
    el.replaceChildren(head, body, foot, voice);

    // --- Options, read each time. ---
    const attr = (/** @type {keyof typeof OPTION_ATTRIBUTES} */ name) => el.getAttribute(OPTION_ATTRIBUTES[name]) ?? '';
    const group = () => (attr('group') === 'none' ? 'none' : 'day');
    const timeMode = () => (['relative', 'clock', 'moment'].includes(attr('time')) ? attr('time') : 'auto');
    const actorMode = () => (attr('actor') === 'mark' || attr('actor') === 'off' ? attr('actor') : 'chip');
    const expandMode = () => (attr('expand') === 'one' || attr('expand') === 'off' ? attr('expand') : 'many');
    const unit = () => {
        const [one, many] = attr('unit')
            .split(/[,/]/)
            .map((word) => word.trim());
        return { one: one || s().feedUnitOne, many: many || (one ? `${one}s` : s().feedUnitMany) };
    };
    const level = () => Math.min(6, Math.max(1, Number(attr('level')) || 3));

    // --- Words. ---
    /** @param {number} n */
    const counted = (n) => `${n} ${n === 1 ? unit().one : unit().many}`;
    /** @param {FeedRowState | undefined} st */
    const stateWord = (st) => {
        const t = s();
        return st === 'ok'
            ? t.statusOk
            : st === 'failed'
              ? t.statusFailed
              : st === 'warn'
                ? t.statusWarn
                : st === 'running'
                  ? t.feedStateRunning
                  : st === 'info'
                    ? t.feedStateInfo
                    : '';
    };
    /** The weekday of a moment, in the page's language. @param {number} ms */
    const weekdayOf = (ms) => {
        const locale = /** @type {HTMLElement | null} */ (el.closest('[lang]'))?.lang || 'en-GB';
        return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: zone }).format(ms);
    };
    /** The word for a day: Today, Yesterday, or its weekday. @param {number} ms @param {string} key */
    const dayWord = (ms, key) => {
        const t = now();
        const today = dayKey(t, zone);
        if (key === today) return s().feedToday;
        const yesterday = [20, 24, 28].map((h) => dayKey(t - h * 3600000, zone)).find((k) => k !== today);
        return key === yesterday ? s().feedYesterday : weekdayOf(ms);
    };

    // --- A row. ---
    /**
     * The time cell of a row: the ticking ago line for the first 24 hours, then the moment.
     * @param {FeedRow} row @param {boolean} grouped
     */
    function whenCell(row, grouped) {
        const mode = timeMode();
        const age = now() - row.at;
        const relative = mode === 'relative' || (mode !== 'moment' && age < FEED_RELATIVE_MS);
        const iso = new Date(row.at).toISOString();
        if (relative) {
            const when = /** @type {HTMLElement} */ (make('time', 'kp-ago kp-feed__when'));
            when.setAttribute('data-kp-ago-bare', '');
            setAgo(when, row.at);
            when.setAttribute('datetime', iso);
            if (mode !== 'relative') nextFlip = Math.min(nextFlip, row.at + FEED_RELATIVE_MS);
            return when;
        }
        const moment = agoMoment(row.at, zone);
        const when = make('time', 'kp-feed__when', mode === 'clock' && grouped ? moment.slice(11) : moment);
        when.setAttribute('datetime', iso);
        when.title = moment;
        return when;
    }
    /** @param {FeedRow} row @param {Map<string, number>} slots @param {boolean} grouped */
    function rowItem(row, slots, grouped) {
        const t = s();
        const li = make('li', 'kp-feed__row');
        li.setAttribute('data-kp-key', row.key);
        if (row.state) li.setAttribute('data-state', row.state);
        const mark = make('span', 'kp-feed__mark');
        mark.setAttribute('aria-hidden', 'true');
        if (row.state === 'running') mark.append(make('span', 'kp-spinner'));
        const cell = make('span', 'kp-feed__mark-cell');
        cell.append(mark);

        const text = make('div', 'kp-feed__text');
        const openable = expandMode() !== 'off' && !!row.more?.length;
        const regionId = `${id}-more-${(idSeq += 1)}`;
        /** @type {HTMLElement} */
        let title;
        if (openable) {
            const toggle = /** @type {HTMLButtonElement} */ (make('button', 'kp-feed__toggle'));
            toggle.type = 'button';
            toggle.setAttribute('aria-expanded', String(open.has(row.key)));
            toggle.setAttribute('aria-controls', regionId);
            toggle.append(make('span', 'kp-feed__title-text', row.title), make('span', 'kp-feed__chevron'));
            title = toggle;
        } else if (row.href) {
            const link = /** @type {HTMLAnchorElement} */ (make('a', 'kp-feed__link'));
            link.href = row.href;
            link.append(make('span', 'kp-feed__title-text', row.title));
            title = link;
        } else title = make('span', 'kp-feed__title-text', row.title);
        const head2 = make('div', 'kp-feed__title');
        head2.append(title);
        const word = stateWord(row.state);
        if (word) head2.append(make('span', 'kp-sr-only', `, ${word}`));
        text.append(head2);
        if (row.detail) text.append(make('div', 'kp-feed__detail', row.detail));
        if (openable) {
            const region = make('div', 'kp-feed__more');
            region.id = regionId;
            region.setAttribute('role', 'region');
            region.setAttribute('aria-label', t.feedMoreLabel(row.title));
            region.hidden = !open.has(row.key);
            for (const line of row.more ?? []) region.append(make('div', 'kp-feed__line', line));
            if (row.href) {
                const out = /** @type {HTMLAnchorElement} */ (make('a', 'kp-feed__open', t.feedOpen));
                out.href = row.href;
                region.append(out);
            }
            text.append(region);
            li.toggleAttribute('data-kp-open', open.has(row.key));
        }

        const meta = make('div', 'kp-feed__meta');
        if (row.actor && actorMode() !== 'off') {
            const actor = make('span', 'kp-feed__actor');
            const chip = make('span', 'kp-idmark-name kp-idmark-name--wrap');
            const mk = make('span', `kp-idmark kp-idmark--xs${['person', 'agent'].includes(row.actor.kind ?? '') ? ' kp-idmark--round' : ''}`);
            setIdmark(mk, row.actor.name, { slot: slots.get(row.actor.name), title: actorMode() === 'mark' });
            if (actorMode() === 'mark') {
                chip.append(mk, make('span', 'kp-sr-only', row.actor.name));
            } else chip.append(mk, make('span', 'kp-feed__actor-name', row.actor.name));
            actor.append(make('span', 'kp-sr-only', `${t.feedBy} `), chip);
            meta.append(actor);
        } else if (actorMode() !== 'off') meta.append(make('span', 'kp-feed__actor'));
        meta.append(whenCell(row, grouped));
        li.append(cell, text, meta);
        return li;
    }
    /** Skeleton rows with the final geometry: two days, the marks, two lines, a chip and a time each. */
    function skeletonRows() {
        const out = [];
        for (let day = 0; day < 2; day += 1) {
            const group2 = make('div', 'kp-feed__skel-group');
            group2.append(make('span', 'kp-feed__skel-day kp-skeleton'));
            for (let row = 0; row < 4; row += 1) {
                const line = make('div', 'kp-feed__skel-row');
                line.append(
                    make('span', 'kp-feed__skel-mark kp-skeleton kp-skeleton--circle'),
                    make('span', 'kp-feed__skel-text kp-skeleton'),
                    make('span', 'kp-feed__skel-chip kp-skeleton'),
                    make('span', 'kp-feed__skel-when kp-skeleton'),
                );
                group2.append(line);
            }
            out.push(group2);
        }
        return out;
    }

    // --- Rendering. ---
    function render() {
        // One row at a time: switching to it keeps the row opened last.
        if (expandMode() === 'one') for (const key of [...open].slice(0, -1)) open.delete(key);
        const t = s();
        const st = model.state ?? 'ready';
        const rows = [...(model.rows ?? [])].sort((a, b) => b.at - a.at);
        const grouped = group() === 'day';
        const total = model.total ?? rows.length;
        nextFlip = Infinity;
        drawnDay = dayKey(now(), zone);
        el.setAttribute('data-kp-state', st);
        const max = attr('max');
        if (max) el.style.setProperty('--kp-feed-max', max);
        else el.style.removeProperty('--kp-feed-max');
        el.toggleAttribute('data-kp-feed-scroll', !!max);
        el.toggleAttribute('data-kp-feed-no-rail', attr('rail') === 'off');
        el.setAttribute('data-kp-feed-actor-mode', actorMode());

        const active = doc.activeElement instanceof HTMLElement && el.contains(doc.activeElement) ? doc.activeElement : null;
        const focusKey = active?.closest('[data-kp-key]')?.getAttribute('data-kp-key') ?? null;
        const focusPart = active?.classList.contains('kp-feed__toggle')
            ? '.kp-feed__toggle'
            : active?.classList.contains('kp-feed__link')
              ? '.kp-feed__link'
              : '';
        const focusFoot = active && foot.contains(active) ? (active.closest('button') ? 'button' : '') : '';
        const focusStale = active === staleAction;

        // The head: the exact count and the one freshness line, or why the rows are old.
        head.hidden = attr('head') === 'off';
        const staleNow = st === 'ready' && model.stale ? model.stale : null;
        count.textContent =
            st === 'empty'
                ? counted(0)
                : st === 'ready'
                  ? rows.length < total
                      ? t.feedShown(rows.length, total, unit().many)
                      : counted(total)
                  : '\u00a0';
        const updated = model.updatedAt;
        fresh.hidden = !!staleNow || updated == null || st !== 'ready';
        if (updated != null) setAgo(fresh, updated);
        stale.hidden = !staleNow;
        if (staleNow) {
            const since = staleNow.since;
            const clock =
                since == null
                    ? ''
                    : agoMoment(since, zone).slice(0, 10) === agoMoment(now(), zone).slice(0, 10)
                      ? agoMoment(since, zone).slice(11)
                      : agoMoment(since, zone);
            staleText.textContent = t.feedStale(staleNow.reason, clock);
            staleAction.textContent = t.feedStaleAction;
        }

        // The rows, by day.
        /** @type {{ key: string, at: number, rows: FeedRow[] }[]} */
        const days = [];
        for (const row of rows) {
            const key = grouped ? dayKey(row.at, zone) : 'all';
            const last = days[days.length - 1];
            if (last && last.key === key) last.rows.push(row);
            else days.push({ key, at: row.at, rows: [row] });
        }
        const slots = idmarkColours(rows.flatMap((row) => (row.actor ? [row.actor.name] : [])));
        list.setAttribute('aria-label', el.getAttribute('aria-label') ?? t.feedLabel);
        list.replaceChildren(
            ...(st === 'ready'
                ? days.map((day) => {
                      const li = make('li', 'kp-feed__group');
                      if (grouped) {
                          const heading = make('div', 'kp-feed__day');
                          heading.setAttribute('role', 'heading');
                          heading.setAttribute('aria-level', String(level()));
                          const failed = day.rows.filter((row) => row.state === 'failed').length;
                          const iso = new Date(day.at).toISOString();
                          const word = make('span', 'kp-feed__day-word', dayWord(day.at, day.key));
                          const date = /** @type {HTMLElement} */ (make('time', 'kp-feed__day-date', agoMoment(day.at, zone).slice(0, 10)));
                          date.setAttribute('datetime', iso);
                          heading.append(word, date, make('span', 'kp-feed__day-rule'));
                          if (attr('summary') !== 'off')
                              heading.append(
                                  make(
                                      'span',
                                      'kp-feed__day-summary',
                                      `${counted(day.rows.length)} · ${failed ? t.feedFailed(failed) : t.feedAllOk}`,
                                  ),
                              );
                          li.append(heading);
                      }
                      const rowList = make('ol', 'kp-feed__rows');
                      for (const row of day.rows) rowList.append(rowItem(row, slots, grouped));
                      li.append(rowList);
                      return li;
                  })
                : []),
        );
        list.hidden = st !== 'ready';

        // The states.
        const showPlate = st === 'empty' || st === 'error';
        state.hidden = !showPlate;
        if (st === 'empty')
            state.replaceChildren(statePlate(doc, { kind: 'empty', title: t.feedEmptyTitle, text: model.emptyText ?? t.feedEmptyText }));
        else if (st === 'error')
            state.replaceChildren(
                statePlate(doc, {
                    kind: 'error',
                    title: t.feedErrorTitle,
                    text: model.error ?? t.feedErrorText,
                    actionLabel: t.feedRetry,
                    actionAttribute: 'data-kp-feed-retry',
                }),
            );
        else state.replaceChildren();
        skeleton.replaceChildren(...(st === 'loading' ? skeletonRows() : []));
        skeleton.hidden = st !== 'loading';
        body.setAttribute('aria-busy', String(st === 'loading'));
        if (st === 'loading' && !busy)
            busy = openBusyCard(body, { words: t.feedLoading, area: () => [body], className: 'kp-feed__busy', arrive: false });
        else if (st !== 'loading' && busy) {
            const b = busy;
            busy = null;
            void b.close();
        }

        // The foot: "Load earlier", always the same room.
        const earlier = st === 'ready' ? model.earlier : undefined;
        foot.setAttribute('data-kp-earlier', earlier ?? 'none');
        const oldest = rows[rows.length - 1];
        const back = oldest ? agoMoment(oldest.at, zone).slice(0, 10) : '';
        foot.replaceChildren(
            ...(earlier === 'more' || earlier === 'loading'
                ? [
                      (() => {
                          const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-feed__earlier'));
                          button.type = 'button';
                          button.setAttribute('data-kp-feed-earlier', '');
                          if (earlier === 'loading') {
                              button.setAttribute('aria-busy', 'true');
                              button.disabled = true;
                              button.append(make('span', 'kp-spinner'), make('span', 'kp-feed__earlier-label', t.feedEarlierLoading));
                          } else button.append(make('span', 'kp-feed__earlier-label', t.feedEarlier));
                          return button;
                      })(),
                      make('span', 'kp-feed__foot-note', t.feedBackTo(rows.length, total, back)),
                  ]
                : earlier === 'error'
                  ? [
                        make('span', 'kp-feed__foot-note kp-feed__foot-note--error', t.feedEarlierError),
                        (() => {
                            const button = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-feed__earlier', t.feedEarlierRetry));
                            button.type = 'button';
                            button.setAttribute('data-kp-feed-earlier', '');
                            return button;
                        })(),
                    ]
                  : earlier === 'end'
                    ? [make('span', 'kp-feed__foot-note', t.feedEnd(rows.length, back))]
                    : []),
        );

        // Put the focus back where it was, by key.
        if (focusKey && focusPart) {
            const again = list.querySelector(`[data-kp-key="${CSS.escape(focusKey)}"] ${focusPart}`);
            if (again instanceof HTMLElement) again.focus({ preventScroll: true });
        } else if (focusFoot) {
            const target = foot.querySelector('button:not(:disabled)');
            if (target instanceof HTMLElement) target.focus({ preventScroll: true });
        } else if (focusStale && !stale.hidden) staleAction.focus({ preventScroll: true });
    }

    /** New rows are said once, politely, at most every ten seconds. @param {FeedRow[]} fresh */
    function announce(fresh) {
        if (!fresh.length || now() - lastSaid < 10000) return;
        lastSaid = now();
        const newest = [...fresh].sort((a, b) => b.at - a.at)[0];
        if (newest) voice.textContent = fresh.length > 1 ? s().feedNewMany(fresh.length, newest.title) : s().feedNew(newest.title);
    }

    /** @param {FeedModel} next */
    const set = (next) => {
        model = { ...model, ...next };
        if (next.stale === undefined && next.rows !== undefined && next.state === undefined) model.stale = null;
        if (next.state === undefined && next.rows !== undefined) model.state = model.rows?.length ? 'ready' : 'empty';
        const keys = new Set((model.rows ?? []).map((row) => row.key));
        if (seen !== null && model.state === 'ready') announce((model.rows ?? []).filter((row) => !seen?.has(row.key)));
        seen = keys;
        for (const key of [...open]) if (!keys.has(key)) open.delete(key);
        render();
    };

    // --- Events. ---
    /** @param {Event} event */
    const onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const toggle = target.closest('.kp-feed__toggle');
        if (toggle && el.contains(toggle)) {
            const li = toggle.closest('[data-kp-key]');
            const key = li?.getAttribute('data-kp-key') ?? '';
            const now2 = !open.has(key);
            if (now2 && expandMode() === 'one')
                for (const other of [...open]) {
                    open.delete(other);
                    close(other);
                }
            if (now2) open.add(key);
            else open.delete(key);
            paintOpen(li, now2);
            el.dispatchEvent(new CustomEvent(FEED_OPEN_EVENT, { bubbles: true, detail: { key, open: now2 } }));
            return;
        }
        if (target.closest('[data-kp-feed-retry]')) el.dispatchEvent(new CustomEvent(FEED_RETRY_EVENT, { bubbles: true, detail: {} }));
        else if (target.closest('[data-kp-feed-earlier]')) el.dispatchEvent(new CustomEvent(FEED_EARLIER_EVENT, { bubbles: true, detail: {} }));
    };
    /** @param {Element | null} li @param {boolean} on */
    function paintOpen(li, on) {
        if (!li) return;
        li.toggleAttribute('data-kp-open', on);
        li.querySelector('.kp-feed__toggle')?.setAttribute('aria-expanded', String(on));
        const region = li.querySelector('.kp-feed__more');
        if (region instanceof HTMLElement) region.hidden = !on;
    }
    /** @param {string} key */
    const close = (key) => paintOpen(list.querySelector(`[data-kp-key="${CSS.escape(key)}"]`), false);
    /** The arrow keys move between the rows' controls. @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const from = event.target instanceof Element ? event.target.closest('.kp-feed__toggle, .kp-feed__link') : null;
        if (!from || !el.contains(from)) return;
        const all = [...list.querySelectorAll('.kp-feed__toggle, .kp-feed__link')];
        const next = all[all.indexOf(from) + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next instanceof HTMLElement) {
            event.preventDefault();
            next.focus();
        }
    };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);

    // An option changed: draw again with it. A tick: a row that turned a day old, or midnight, draws again.
    const watcher = new MutationObserver(() => render());
    watcher.observe(el, { attributes: true, attributeFilter: OPTIONS });
    const view = doc.defaultView;
    const tick = view?.setInterval(() => {
        if (model.state === 'ready' && (now() >= nextFlip || dayKey(now(), zone) !== drawnDay)) render();
    }, FEED_TICK_MS);

    /** @param {readonly string[] | 'all'} keys */
    const setOpen = (keys) => {
        open.clear();
        const wanted = keys === 'all' ? (model.rows ?? []).filter((row) => row.more?.length).map((row) => row.key) : keys;
        for (const key of wanted) open.add(key);
        render();
    };

    /** @type {FeedHandle} */
    const handle = { element: el, set, openKeys: () => [...open], setOpen, render };
    handles.set(el, handle);
    render();
    return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('keydown', onKey);
        watcher.disconnect();
        if (tick !== undefined) view?.clearInterval(tick);
        busy?.remove();
        handles.delete(el);
    };
}
