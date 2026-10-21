// A live log viewer: the log's lines kept in a ring buffer, found, wrapped, timed and copied [gap-log-viewer; homelab's host log
// explorer `mountHostLog` and the Stack logs tab].
//
//   <div class="kp-logviewer" data-kp-logviewer data-kp-log-max="2000" aria-label="Host log"></div>
//
//   appendLogLines(viewer, [{ id: 'a1', ts: Date.now(), source: 'traefik', level: 'warn', message: 'certificate renews in 6 days' }]);
//
// The split with the app: this part owns the buffer and everything done to it on screen (the cap, the find, the wrap, the time
// column, the level colour and filter, copy and download, the three states). The app owns where the lines come from: it calls
// `appendLogLines` with what arrived (a poll that returns overlapping windows is fine, a line is kept once per `id`) and says
// `setLogViewer(el, { state: 'loading' | 'error' })` while it waits or when the source failed. It builds on what the package
// already had: the rows are `.kp-log` lines (the four-column grid, the severity word and plate, the source's own hue from
// js/log.js) and following the tail, the pause and resume button and the exact "N new lines" pill are js/newpill.js, not
// written again here.
//
// No virtual windowing (docs/FEATURES.md TH42, "Don't do"): every kept line is a real row, so find-in-page, selection and
// screen readers see what is there, and the ring buffer keeps the DOM small. The cap is the option below.
//
// A line is `{ id?, ts, source?, level, message }`; `ts` is a number of milliseconds, a Date or a date string, `level` is
// debug, info, notice, warning, error or critical (trace, warn, err, crit, fatal, alert and emerg are taken for the nearest).
//
// Options (attributes on the root, each also a key of `attachLogViewers` / `setLogViewer`; every one is live: change the
// attribute and the viewer is drawn again):
//   data-kp-log-max          lines kept (2000); the oldest are dropped first and counted, "412 earlier lines dropped"
//   data-kp-log-wrap         `on` (default) wraps a long line; `off` keeps it on one line and scrolls sideways under a time
//                            column that stays put
//   data-kp-log-time         `time` (default, 14:32:07), `datetime` (19/10/2026 14:32:07) or `off`
//   data-kp-log-level        the lowest level shown: `debug` (default, all), `info`, `warning` or `error`
//   data-kp-log-search       the text to find (case ignored); matches are marked, counted, and walked with Enter and Shift+Enter
//   data-kp-log-search-only  `on` hides the lines without a match; default `off`
//   data-kp-log-follow       `live` (default) follows the newest line; `paused` starts held (js/newpill.js does the rest)
//   data-kp-log-tools        the tools shown, comma separated: search, follow, wrap, time, level, copy, download (default all)
//   data-kp-log-filename     the name a download gets, without `.txt` (`log`)
//   data-kp-log-hint         the empty plate's sentence
//   data-kp-log-focus-key    the key that jumps to the search from anywhere (`/`; `false` for none)
//   data-kp-log-error        the failed plate's sentence, the host's own reason (`setLogViewer(el, { state: 'error', message })`); `-error-title` its heading [wish-1120]
//   data-kp-state            `ready` (default), `loading` (the busy card over the viewer) or `error` (the failed plate with Retry);
//                            the lines already kept stay in the buffer and return with `ready`
//
// Events (bubbling, on the root): `kp-logviewer-change` `{ total, shown, dropped, matches, current }` and `kp-logviewer-retry`.
// Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';
import { FOLLOW_EVENT, attachNewPills, newPill } from './newpill.js';
import { attachSegmented } from './segmented.js';
import { attachDisabledReasons } from './reason.js';
import { registerShortcuts } from './shortcuts.js';
import { runFlashButton } from './flash.js';
import { SOURCE_PROPERTY, sourceColour } from './log.js';

/** The viewers this module looks after. */
export const LOGVIEWER = '[data-kp-logviewer]';
/** Fired when the buffer, the filter or the find changes: `{ total, shown, dropped, matches, current }`. */
export const LOGVIEWER_EVENT = 'kp-logviewer-change';
/** Fired by the Retry of a viewer whose source failed. */
export const LOGVIEWER_RETRY_EVENT = 'kp-logviewer-retry';
/** The default cap of the ring buffer. */
export const LOGVIEWER_MAX = 2000;
/** The levels, lowest first. */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'notice', 'warning', 'error', 'critical']);

/**
 * @typedef {object} LogLine
 * @property {string | number} [id] what makes a line the same line when it arrives twice
 * @property {number | string | Date} ts when it was written
 * @property {string} [source] the stack or unit that wrote it
 * @property {string} level debug, info, notice, warning, error or critical (or a common alias)
 * @property {string} message the text
 */

/**
 * @typedef {object} LogViewerSpec
 * @property {LogLine[]} [lines] replaces the buffer
 * @property {'ready' | 'loading' | 'error'} [state]
 * @property {string} [message] the failed plate's sentence: the host's own reason ("Loki did not answer: connection refused"), in place of the package's;
 *   an empty string takes it back (`data-kp-log-error`) [wish-1120, homelab 115]
 * @property {string} [errorTitle] the failed plate's heading, in place of "Could not read the log" (`data-kp-log-error-title`)
 * @property {number} [max]
 * @property {boolean} [wrap]
 * @property {'time' | 'datetime' | 'off'} [time]
 * @property {'debug' | 'info' | 'warning' | 'error'} [level]
 * @property {string} [search]
 * @property {boolean} [searchOnly]
 */

/** @typedef {{ id: string, ts: number, source: string, level: string, message: string }} Kept */
/** @typedef {{ lines: Kept[], nodes: Map<string, HTMLElement>, dropped: number, serial: number, sig: string, matches: HTMLElement[], at: number, card: import('./busy-card.js').BusyCard | null, off: (() => void)[], said: string, tools: string, highlighted: string }} ViewerState */
/** @type {WeakMap<Element, ViewerState>} */
const STATE = new WeakMap();
/** The text a message's marks were built for. @type {WeakMap<Element, string>} */
const BUILT = new WeakMap();
let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-log-${name}`) ?? fallback;

/** @param {HTMLElement} root @returns {ViewerState} */
function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        st = {
            lines: [],
            nodes: new Map(),
            dropped: 0,
            serial: 0,
            sig: '',
            matches: [],
            at: -1,
            card: null,
            off: [],
            said: '',
            tools: '',
            highlighted: '',
        };
        STATE.set(root, st);
    }
    return st;
}

const ALIASES = /** @type {Record<string, string>} */ ({
    trace: 'debug',
    debug: 'debug',
    info: 'info',
    information: 'info',
    notice: 'notice',
    warn: 'warning',
    warning: 'warning',
    err: 'error',
    error: 'error',
    crit: 'critical',
    critical: 'critical',
    fatal: 'critical',
    alert: 'critical',
    emerg: 'critical',
    emergency: 'critical',
});

/** The canonical level of a word. @param {string} word */
export const logLevel = (word) => ALIASES[String(word).trim().toLowerCase()] ?? 'info';

/** @param {number} n */
const two = (n) => String(n).padStart(2, '0');

/** @param {number} ts @param {boolean} date */
function clock(ts, date) {
    const d = new Date(ts);
    const time = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    return date ? `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${time}` : time;
}

/** @param {unknown} value @returns {number} */
function stamp(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
}

/** @param {HTMLElement} root @returns {string[]} */
function toolsOf(root) {
    return attr(root, 'tools', 'search,follow,wrap,time,level,copy,download')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

/** The options as one string, to know whether the rows must be drawn again. @param {HTMLElement} root */
const signature = (root) =>
    ['max', 'wrap', 'time', 'level', 'search', 'search-only', 'tools', 'error', 'error-title'].map((n) => attr(root, n, '')).join('\u0001') +
    `\u0001${root.getAttribute('data-kp-state') ?? ''}`;

/** @param {HTMLElement} root @returns {HTMLElement} */
const logOf = (root) => /** @type {HTMLElement} */ (root.querySelector('.kp-logviewer__log'));

/** @param {HTMLElement} root @returns {number} */
const maxOf = (root) => Math.max(1, Math.floor(Number(attr(root, 'max', String(LOGVIEWER_MAX)))) || LOGVIEWER_MAX);

/** Lowest level index shown. @param {HTMLElement} root */
const floorOf = (root) => Math.max(0, LOG_LEVELS.indexOf(logLevel(attr(root, 'level', 'debug'))));

/** @param {HTMLElement} root */
const queryOf = (root) => attr(root, 'search', '').trim().toLowerCase();

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    const st = stateOf(root);
    if (st.said === message) return;
    st.said = message;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-logviewer__live'));
    if (!region) {
        region = el('kp-sr-only kp-logviewer__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** The text of one line as copied and downloaded. @param {Kept} line */
const textOf = (line) => [clock(line.ts, true), line.source, line.level.toUpperCase(), line.message].filter(Boolean).join(' ');

/** Build one row. @param {Kept} line @returns {HTMLElement} */
function rowFor(line) {
    const row = el('kp-log__line');
    row.setAttribute('data-id', line.id);
    row.setAttribute('data-kp-severity', line.level);
    const time = el('kp-log__time', 'span');
    time.setAttribute('title', `${clock(line.ts, true)}.${String(new Date(line.ts).getMilliseconds()).padStart(3, '0')}`);
    const source = el('kp-log__source', 'span');
    if (line.source) {
        source.setAttribute('data-kp-source', line.source);
        source.style.setProperty(SOURCE_PROPERTY, sourceColour(line.source));
        source.textContent = line.source;
    }
    const level = el('kp-log__level', 'span');
    const word = el('kp-log__word', 'span');
    word.textContent = line.level;
    level.append(word);
    const message = el('kp-log__message', 'span');
    row.append(time, source, level, message);
    return row;
}

/**
 * Put the options on a row: the time, the filter, the marks.
 * @param {HTMLElement} root
 * @param {HTMLElement} row
 * @param {Kept} line
 */
function dress(root, row, line) {
    const mode = attr(root, 'time', 'time');
    const timeCell = /** @type {HTMLElement} */ (row.children[0]);
    if (mode !== 'off') {
        const text = clock(line.ts, mode === 'datetime');
        if (timeCell.textContent !== text) timeCell.textContent = text;
    } else timeCell.textContent = '';
    const query = queryOf(root);
    const message = /** @type {HTMLElement} */ (row.children[3]);
    const hit = query !== '' && line.message.toLowerCase().includes(query);
    // Marks: the message is built again only when the text to find changed or the row has no message yet.
    if (BUILT.get(message) !== query || message.firstChild === null) {
        message.replaceChildren();
        if (!hit) message.textContent = line.message;
        else {
            const lower = line.message.toLowerCase();
            let from = 0;
            for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
                if (at > from) message.append(line.message.slice(from, at));
                const mark = el('kp-log__match', 'mark');
                mark.textContent = line.message.slice(at, at + query.length);
                message.append(mark);
                from = at + query.length;
            }
            if (from < line.message.length) message.append(line.message.slice(from));
        }
        BUILT.set(message, query);
    }
    const lowEnough = LOG_LEVELS.indexOf(line.level) >= floorOf(root);
    const wanted = attr(root, 'search-only', 'off') === 'on' && query !== '' ? hit : true;
    row.hidden = !(lowEnough && wanted);
}

/** The count text beside the search box. @param {HTMLElement} root */
function matchWords(root) {
    const s = getStrings();
    const st = stateOf(root);
    if (queryOf(root) === '') return s.logviewerSearchIdle;
    if (st.matches.length === 0) return s.logviewerSearchNone;
    return st.at >= 0 ? s.logviewerMatchAt(st.at + 1, st.matches.length) : s.logviewerMatches(st.matches.length);
}

/** Collect the marks again and keep the current one where it was. @param {HTMLElement} root @param {boolean} [reset] */
function collect(root, reset = false) {
    const st = stateOf(root);
    const log = logOf(root);
    const before = reset ? null : (st.matches[st.at] ?? null);
    st.matches =
        queryOf(root) === '' ? [] : /** @type {HTMLElement[]} */ ([...log.querySelectorAll('.kp-log__line:not([hidden]) mark.kp-log__match')]);
    st.at = before ? st.matches.indexOf(before) : -1;
    for (const mark of log.querySelectorAll('mark[data-kp-current]')) mark.removeAttribute('data-kp-current');
    if (st.at >= 0) st.matches[st.at].setAttribute('data-kp-current', '');
}

/** Everything that depends on the buffer or the options: the bar, the foot, the plates, the event. @param {HTMLElement} root */
function refresh(root) {
    const st = stateOf(root);
    const s = getStrings();
    const log = logOf(root);
    const stage = /** @type {HTMLElement} */ (root.querySelector('.kp-logviewer__stage'));
    const state = root.getAttribute('data-kp-state') ?? 'ready';
    root.toggleAttribute('aria-busy', state === 'loading');
    const shown = st.lines.filter((line) => st.nodes.get(line.id)?.hidden === false).length;
    const total = st.lines.length;

    // The columns: the time column and the source column leave the grid when they hold nothing, so the others do not shift.
    root.toggleAttribute('data-kp-log-nosource', !st.lines.some((line) => line.source !== ''));

    // The plates and the busy card, over the whole stage so the footprint never changes.
    for (const old of stage.querySelectorAll(':scope > .kp-logviewer__plate')) old.remove();
    if (st.card && state !== 'loading') {
        st.card.remove();
        st.card = null;
    }
    let plate = '';
    if (state === 'error') {
        plate = 'error';
        const p = statePlate(document, {
            kind: 'error',
            title: attr(root, 'error-title', '') || s.logviewerFailed,
            text: attr(root, 'error', '') || s.logviewerFailedText,
            actionLabel: s.logviewerRetry,
            actionAttribute: 'data-kp-logviewer-retry',
        });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    } else if (state === 'loading') {
        plate = 'loading';
        if (!st.card) {
            st.card = openBusyCard(stage, { words: s.logviewerLoading, area: () => [stage], className: 'kp-logviewer__busy', arrive: false });
            st.card.layer.setAttribute('data-kp-newpill-skip', '');
        }
    } else if (total === 0) {
        plate = 'empty';
        const p = statePlate(document, { kind: 'empty', title: s.logviewerEmptyTitle, text: attr(root, 'hint', '') || s.logviewerEmptyText });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    } else if (shown === 0) {
        plate = 'nomatch';
        const p = statePlate(document, {
            kind: 'empty',
            title: s.logviewerNoMatchTitle,
            text: s.logviewerNoMatchText,
            actionLabel: s.logviewerClear,
            actionAttribute: 'data-kp-logviewer-clear',
        });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    }
    root.setAttribute('data-kp-log-plate', plate);

    // The bar.
    const bar = root.querySelector('.kp-logviewer__bar');
    const find = /** @type {HTMLInputElement | null} */ (bar?.querySelector('.kp-logviewer__find'));
    if (find && find.value !== attr(root, 'search', '') && document.activeElement !== find) find.value = attr(root, 'search', '');
    const count = bar?.querySelector('.kp-logviewer__matches');
    if (count) count.textContent = matchWords(root);
    const hasQuery = queryOf(root) !== '';
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (bar?.querySelectorAll('[data-kp-logviewer-step]') ?? []))
        b.disabled = st.matches.length === 0;
    const only = /** @type {HTMLButtonElement | null} */ (bar?.querySelector('[data-kp-logviewer-only]'));
    if (only) {
        only.setAttribute('aria-pressed', String(attr(root, 'search-only', 'off') === 'on'));
        only.disabled = !hasQuery;
    }
    const wrap = bar?.querySelector('[data-kp-logviewer-wrap]');
    wrap?.setAttribute('aria-pressed', String(attr(root, 'wrap', 'on') !== 'off'));
    for (const item of bar?.querySelectorAll('[data-kp-logviewer-time] .kp-segmented__item') ?? []) {
        item.setAttribute('aria-checked', String(item.getAttribute('data-value') === attr(root, 'time', 'time')));
    }
    const level = /** @type {HTMLSelectElement | null} */ (bar?.querySelector('.kp-logviewer__level'));
    if (level) level.value = ['info', 'warning', 'error'].includes(attr(root, 'level', 'debug')) ? attr(root, 'level', 'debug') : 'debug';
    const nothing = shown === 0 || state !== 'ready';
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
        bar?.querySelectorAll('[data-kp-logviewer-copy], [data-kp-logviewer-download]') ?? []
    ))
        b.disabled = nothing;
    if (find) find.disabled = total === 0 || state !== 'ready';

    // The foot.
    const foot = root.querySelector('.kp-logviewer__foot');
    const countLine = foot?.querySelector('.kp-logviewer__count');
    if (countLine) countLine.textContent = s.logviewerCount(shown, total);
    const dropped = foot?.querySelector('.kp-logviewer__dropped');
    if (dropped) {
        dropped.textContent = st.dropped > 0 ? s.logviewerDropped(st.dropped, maxOf(root)) : '';
        /** @type {HTMLElement} */ (dropped).hidden = st.dropped === 0;
    }
    log.setAttribute('aria-label', s.logviewerLogLabel);
    root.dispatchEvent(
        new CustomEvent(LOGVIEWER_EVENT, {
            bubbles: true,
            detail: { total, shown, dropped: st.dropped, matches: st.matches.length, current: st.at >= 0 ? st.at + 1 : 0 },
        }),
    );
}

/** Draw every row again, for a changed option. @param {HTMLElement} root */
function redraw(root) {
    const st = stateOf(root);
    trim(root);
    for (const line of st.lines) {
        const row = st.nodes.get(line.id);
        if (row) dress(root, row, line);
    }
    collect(root, true);
    refresh(root);
}

/** Drop the oldest lines past the cap. @param {HTMLElement} root */
function trim(root) {
    const st = stateOf(root);
    const max = maxOf(root);
    while (st.lines.length > max) {
        const gone = /** @type {Kept} */ (st.lines.shift());
        st.nodes.get(gone.id)?.remove();
        st.nodes.delete(gone.id);
        st.dropped += 1;
    }
}

/** Build the bar, the stage and the foot once. @param {HTMLElement} root */
function ensureParts(root) {
    if (root.querySelector(':scope > .kp-logviewer__stage')) return;
    root.classList.add('kp-logviewer');
    serial += 1;
    const s = getStrings();
    if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', s.logviewerLabel);
    root.setAttribute('role', 'group');
    const id = `kp-logviewer-${serial}`;

    const bar = el('kp-logviewer__bar');
    const search = el('kp-logviewer__search');
    const field = /** @type {HTMLInputElement} */ (el('kp-field__input kp-logviewer__find', 'input'));
    field.type = 'search';
    field.id = `${id}-find`;
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('aria-label', s.logviewerSearch);
    field.placeholder = s.logviewerSearchHint;
    const matches = el('kp-logviewer__matches', 'span');
    /** @param {string} step @param {string} glyph @param {string} words */
    const stepper = (step, glyph, words) => {
        const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-logviewer__step', 'button'));
        button.type = 'button';
        button.setAttribute('data-kp-logviewer-step', step);
        button.setAttribute('aria-label', words);
        button.title = words;
        const mark = el('kp-logviewer__glyph', 'span');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = glyph;
        button.append(mark);
        return button;
    };
    const previous = stepper('-1', '\u2191', s.logviewerPrevious);
    const next = stepper('1', '\u2193', s.logviewerNext);
    const only = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    only.type = 'button';
    only.setAttribute('data-kp-logviewer-only', '');
    only.textContent = s.logviewerOnly;
    search.append(field, matches, previous, next, only);

    const tools = el('kp-logviewer__tools');
    const follow = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-logviewer__follow', 'button'));
    follow.type = 'button';
    follow.setAttribute('data-kp-follow-toggle', id);
    // The pill's draw() sets this too, but a draw inside a lazy attach cannot see a button that attach
    // has just built (js/as-of.js), so it starts here, pressed only while the log is held.
    follow.setAttribute('aria-pressed', 'false');
    follow.textContent = s.newpillPause;
    const wrap = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    wrap.type = 'button';
    wrap.setAttribute('data-kp-logviewer-wrap', '');
    wrap.textContent = s.logviewerWrap;
    const time = el('kp-segmented kp-logviewer__time', 'div');
    time.setAttribute('data-kp-segmented', 'single');
    time.setAttribute('data-kp-logviewer-time', '');
    time.setAttribute('role', 'radiogroup');
    time.setAttribute('aria-label', s.logviewerTimeLabel);
    for (const [value, words] of /** @type {const} */ ([
        ['time', s.logviewerTimeShort],
        ['datetime', s.logviewerTimeFull],
        ['off', s.logviewerTimeOff],
    ])) {
        const item = /** @type {HTMLButtonElement} */ (el('kp-segmented__item', 'button'));
        item.type = 'button';
        item.setAttribute('role', 'radio');
        item.setAttribute('data-value', value);
        const label = el('kp-segmented__label', 'span');
        label.textContent = words;
        item.append(label);
        time.append(item);
    }
    const levelWrap = el('kp-logviewer__level-wrap');
    const levelLabel = el('kp-logviewer__level-label', 'label');
    levelLabel.setAttribute('for', `${id}-level`);
    levelLabel.textContent = s.logviewerLevel;
    const level = /** @type {HTMLSelectElement} */ (el('kp-field__input kp-logviewer__level', 'select'));
    level.id = `${id}-level`;
    for (const [value, words] of [
        ['debug', s.logviewerLevelAll],
        ['info', s.logviewerLevelFrom('info')],
        ['warning', s.logviewerLevelFrom('warning')],
        ['error', s.logviewerLevelFrom('error')],
    ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = words;
        level.append(option);
    }
    levelWrap.append(levelLabel, level);
    const copy = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    copy.type = 'button';
    copy.setAttribute('data-kp-logviewer-copy', '');
    copy.setAttribute('data-kp-flash-words', `${s.logviewerCopied},${s.logviewerNotCopied}`);
    copy.setAttribute('data-kp-refusal', 'toast');
    copy.setAttribute('data-kp-disabled-reason', s.logviewerNothing);
    copy.textContent = s.logviewerCopy;
    const download = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
    download.type = 'button';
    download.setAttribute('data-kp-logviewer-download', '');
    download.setAttribute('data-kp-disabled-reason', s.logviewerNothing);
    download.textContent = s.logviewerDownload;
    tools.append(follow, wrap, time, levelWrap, copy, download);
    bar.append(search, tools);

    const stage = el('kp-logviewer__stage');
    const log = el('kp-log kp-logviewer__log');
    log.id = id;
    log.setAttribute('data-kp-follow', 'tail');
    log.setAttribute('data-kp-pill-unit', s.logviewerUnit);
    log.setAttribute('data-kp-follow-space', '');
    log.setAttribute('tabindex', '0');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'off');
    stage.append(log);

    const foot = el('kp-logviewer__foot');
    const count = el('kp-logviewer__count', 'span');
    const dropped = el('kp-logviewer__dropped', 'span');
    dropped.hidden = true;
    foot.append(count, dropped);
    root.append(bar, stage, foot);
}

/** Hide the tools the page did not ask for. @param {HTMLElement} root */
function applyTools(root) {
    const wanted = toolsOf(root);
    const bar = root.querySelector('.kp-logviewer__bar');
    if (!bar) return;
    const map = /** @type {[string, string][]} */ ([
        ['search', '.kp-logviewer__search'],
        ['follow', '.kp-logviewer__follow'],
        ['wrap', '[data-kp-logviewer-wrap]'],
        ['time', '.kp-logviewer__time'],
        ['level', '.kp-logviewer__level-wrap'],
        ['copy', '[data-kp-logviewer-copy]'],
        ['download', '[data-kp-logviewer-download]'],
    ]);
    for (const [name, selector] of map) {
        for (const node of /** @type {NodeListOf<HTMLElement>} */ (bar.querySelectorAll(selector))) {
            const anchor = node.closest('.kp-tooltip-anchor') ?? node;
            /** @type {HTMLElement} */ (anchor).hidden = !wanted.includes(name);
        }
    }
    const tools = /** @type {HTMLElement} */ (bar.querySelector('.kp-logviewer__tools'));
    const search = /** @type {HTMLElement} */ (bar.querySelector('.kp-logviewer__search'));
    tools.hidden = ![...tools.children].some((c) => !(/** @type {HTMLElement} */ (c).hidden));
    search.hidden = !wanted.includes('search');
    /** @type {HTMLElement} */ (bar).hidden = tools.hidden && search.hidden;
}

/**
 * Add lines to the buffer. A line whose `id` is already kept is skipped, so a poll that returns overlapping windows can be
 * handed over whole. The oldest lines past the cap are dropped and counted.
 *
 * @param {Element} el
 * @param {LogLine[]} lines
 * @returns {number} how many lines were new
 */
export function appendLogLines(el, lines) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    const st = stateOf(root);
    const log = logOf(root);
    const fragment = document.createDocumentFragment();
    let added = 0;
    for (const raw of lines) {
        st.serial += 1;
        const id = raw.id === undefined ? `auto-${st.serial}` : String(raw.id);
        if (st.nodes.has(id)) continue;
        const line = { id, ts: stamp(raw.ts), source: raw.source ?? '', level: logLevel(raw.level), message: String(raw.message ?? '') };
        const row = rowFor(line);
        dress(root, row, line);
        st.lines.push(line);
        st.nodes.set(id, row);
        fragment.append(row);
        added += 1;
    }
    if (added === 0) return 0;
    // The rows go in with one insertion, so the follower sees one change and scrolls once.
    log.append(fragment);
    trim(root);
    collect(root);
    refresh(root);
    return added;
}

/**
 * The lines the buffer holds now, oldest first.
 * @param {Element} el
 * @returns {LogLine[]}
 */
export function logViewerLines(el) {
    return stateOf(/** @type {HTMLElement} */ (el)).lines.map((line) => ({ ...line }));
}

/**
 * The text of the lines shown (or of every kept line), one per row, as Copy and Download hand it over.
 * @param {Element} el
 * @param {{ all?: boolean }} [options]
 */
export function logViewerText(el, options = {}) {
    const root = /** @type {HTMLElement} */ (el);
    const st = stateOf(root);
    return st.lines
        .filter((line) => options.all || st.nodes.get(line.id)?.hidden === false)
        .map(textOf)
        .join('\n');
}

/**
 * Empty the buffer. The dropped count starts again from zero.
 * @param {Element} el
 */
export function clearLogViewer(el) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    const st = stateOf(root);
    logOf(root).replaceChildren();
    st.lines = [];
    st.nodes.clear();
    st.dropped = 0;
    collect(root, true);
    refresh(root);
}

/**
 * Find a text in the log, as the search box does.
 * @param {Element} el
 * @param {string} text  empty clears the find
 * @returns {number} how many matches
 */
export function searchLogViewer(el, text) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    if (text) root.setAttribute('data-kp-log-search', text);
    else root.removeAttribute('data-kp-log-search');
    syncOptions(root);
    return stateOf(root).matches.length;
}

/**
 * Go to the next or the previous match; the log scrolls to it (and stops following the tail).
 * @param {Element} el
 * @param {1 | -1} [delta]
 * @returns {number} the match now current, counted from 1, or 0 when there is none
 */
export function stepLogMatch(el, delta = 1) {
    const root = /** @type {HTMLElement} */ (el);
    const st = stateOf(root);
    collect(root);
    if (st.matches.length === 0) {
        refresh(root);
        return 0;
    }
    st.at = st.at < 0 ? (delta > 0 ? 0 : st.matches.length - 1) : (st.at + delta + st.matches.length) % st.matches.length;
    const mark = st.matches[st.at];
    for (const old of logOf(root).querySelectorAll('mark[data-kp-current]')) old.removeAttribute('data-kp-current');
    mark.setAttribute('data-kp-current', '');
    // The log scrolls to the match and nothing else does (scrollIntoView would move the page and every frame round it too).
    const log = logOf(root);
    const box = log.getBoundingClientRect();
    const at = mark.getBoundingClientRect();
    log.scrollTop += at.top - box.top - (box.height - at.height) / 2;
    if (at.left < box.left + 120) log.scrollLeft -= box.left + 120 - at.left;
    else if (at.right > box.right - 16) log.scrollLeft += at.right - (box.right - 16);
    refresh(root);
    say(root, matchWords(root));
    return st.at + 1;
}

/**
 * Set the viewer's options and state, or replace its lines.
 * @param {Element} el
 * @param {LogViewerSpec} spec
 */
export function setLogViewer(el, spec) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    if (spec.max !== undefined) root.setAttribute('data-kp-log-max', String(spec.max));
    if (spec.wrap !== undefined) root.setAttribute('data-kp-log-wrap', spec.wrap ? 'on' : 'off');
    if (spec.time !== undefined) root.setAttribute('data-kp-log-time', spec.time);
    if (spec.level !== undefined) root.setAttribute('data-kp-log-level', spec.level);
    if (spec.search !== undefined) {
        if (spec.search) root.setAttribute('data-kp-log-search', spec.search);
        else root.removeAttribute('data-kp-log-search');
    }
    if (spec.searchOnly !== undefined) root.setAttribute('data-kp-log-search-only', spec.searchOnly ? 'on' : 'off');
    if (spec.state !== undefined) root.setAttribute('data-kp-state', spec.state);
    if (spec.message !== undefined) {
        if (spec.message) root.setAttribute('data-kp-log-error', spec.message);
        else root.removeAttribute('data-kp-log-error');
    }
    if (spec.errorTitle !== undefined) {
        if (spec.errorTitle) root.setAttribute('data-kp-log-error-title', spec.errorTitle);
        else root.removeAttribute('data-kp-log-error-title');
    }
    if (spec.lines) {
        clearLogViewer(root);
        appendLogLines(root, spec.lines);
    }
    syncOptions(root);
}

/** Draw again when an option moved. @param {HTMLElement} root */
function syncOptions(root) {
    const st = stateOf(root);
    const now = signature(root);
    if (now === st.sig) return;
    st.sig = now;
    applyTools(root);
    redraw(root);
    const log = logOf(root);
    if (newPill(log)?.following()) log.scrollTop = log.scrollHeight;
}

/**
 * Give every `[data-kp-logviewer]` under `root` its bar, its buffer and its states.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachLogViewers(root = document) {
    /** @type {(() => void)[]} */
    const undo = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof HTMLElement && root.matches(LOGVIEWER) ? [root] : []),
        ...root.querySelectorAll(LOGVIEWER),
    ]);
    for (const viewer of found) {
        if (stateOf(viewer).off.length) continue;
        const st = stateOf(viewer);
        ensureParts(viewer);
        const log = logOf(viewer);
        const stage = /** @type {HTMLElement} */ (viewer.querySelector('.kp-logviewer__stage'));
        const bar = /** @type {HTMLElement} */ (viewer.querySelector('.kp-logviewer__bar'));
        const stopPills = attachNewPills(stage);
        const stopSegmented = attachSegmented(viewer);
        const stopReasons = attachDisabledReasons(bar);
        if (attr(viewer, 'follow', 'live') === 'paused') newPill(log)?.pause();
        st.sig = '';
        syncOptions(viewer);

        const find = /** @type {HTMLInputElement} */ (bar.querySelector('.kp-logviewer__find'));
        const onInput = () => {
            if (find.value.trim() === '') viewer.removeAttribute('data-kp-log-search');
            else viewer.setAttribute('data-kp-log-search', find.value);
            syncOptions(viewer);
            if (stateOf(viewer).matches.length > 0) say(viewer, matchWords(viewer));
            else if (queryOf(viewer) !== '') say(viewer, getStrings().logviewerSearchNone);
        };
        /** @param {KeyboardEvent} event */
        const onFindKey = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                stepLogMatch(viewer, event.shiftKey ? -1 : 1);
            } else if (event.key === 'Escape' && find.value !== '') {
                event.preventDefault();
                find.value = '';
                onInput();
            }
        };
        /** @param {Event} event */
        const onChange = (event) => {
            const target = /** @type {Element} */ (event.target);
            if (target.closest('.kp-logviewer__level')) {
                const value = /** @type {HTMLSelectElement} */ (target).value;
                if (value === 'debug') viewer.removeAttribute('data-kp-log-level');
                else viewer.setAttribute('data-kp-log-level', value);
                syncOptions(viewer);
            }
        };
        /** @param {Event} event */
        const onSegment = (event) => {
            const detail = /** @type {CustomEvent} */ (event).detail;
            const group = /** @type {Element} */ (event.target).closest('[data-kp-logviewer-time]');
            const value = detail?.value ?? detail?.item?.getAttribute('data-value');
            if (group && value) {
                viewer.setAttribute('data-kp-log-time', value);
                syncOptions(viewer);
            }
        };
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            if (!t) return;
            const step = t.closest('[data-kp-logviewer-step]');
            if (step) return void stepLogMatch(viewer, Number(step.getAttribute('data-kp-logviewer-step')) < 0 ? -1 : 1);
            if (t.closest('[data-kp-logviewer-only]')) {
                viewer.setAttribute('data-kp-log-search-only', attr(viewer, 'search-only', 'off') === 'on' ? 'off' : 'on');
                return void syncOptions(viewer);
            }
            if (t.closest('[data-kp-logviewer-wrap]')) {
                viewer.setAttribute('data-kp-log-wrap', attr(viewer, 'wrap', 'on') === 'off' ? 'on' : 'off');
                return void syncOptions(viewer);
            }
            if (t.closest('[data-kp-logviewer-clear]')) {
                viewer.removeAttribute('data-kp-log-search');
                viewer.removeAttribute('data-kp-log-level');
                find.value = '';
                return void syncOptions(viewer);
            }
            if (t.closest('[data-kp-logviewer-retry]')) return void viewer.dispatchEvent(new CustomEvent(LOGVIEWER_RETRY_EVENT, { bubbles: true }));
            const copy = /** @type {HTMLButtonElement | null} */ (t.closest('[data-kp-logviewer-copy]'));
            if (copy) {
                const s = getStrings();
                void runFlashButton(copy, async () => {
                    const text = logViewerText(viewer);
                    try {
                        await navigator.clipboard.writeText(text);
                        return s.logviewerCopied;
                    } catch {
                        return { error: s.logviewerNotCopied, word: s.logviewerNotCopied };
                    }
                });
                return;
            }
            if (t.closest('[data-kp-logviewer-download]')) {
                const blob = new Blob([`${logViewerText(viewer)}\n`], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${attr(viewer, 'filename', 'log')}.txt`;
                document.body.append(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        };
        find.addEventListener('input', onInput);
        find.addEventListener('keydown', onFindKey);
        viewer.addEventListener('change', onChange);
        viewer.addEventListener('kp-segmented-change', onSegment);
        viewer.addEventListener('click', onClick);

        // Every option is live: change the attribute and the viewer is drawn again.
        const observer = new MutationObserver(() => syncOptions(viewer));
        observer.observe(viewer, {
            attributes: true,
            attributeFilter: [
                'data-kp-state',
                'data-kp-log-hint',
                ...['max', 'wrap', 'time', 'level', 'search', 'search-only', 'tools'].map((n) => `data-kp-log-${n}`),
            ],
        });
        // The follow state on the root, for the page and for the stylesheet.
        const onFollow = () => viewer.setAttribute('data-kp-log-following', String(newPill(log)?.following() ?? true));
        // Rows change height after they are drawn (a font that arrives late, the width of the window): a reader at the newest line
        // stays at it.
        const stick = () => {
            if (newPill(log)?.following()) log.scrollTop = log.scrollHeight;
        };
        const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(stick) : null;
        watcher?.observe(log);
        void document.fonts?.ready.then(stick);

        log.addEventListener(FOLLOW_EVENT, onFollow);
        onFollow();

        const s = getStrings();
        const focusKey = attr(viewer, 'focus-key', '/');
        const stopKeys =
            focusKey !== 'false' && focusKey !== ''
                ? registerShortcuts(
                      viewer,
                      [
                          {
                              keys: focusKey,
                              what: s.logviewerKeySearch,
                              group: s.logviewerKeyGroup,
                              when: () => !find.disabled && !find.hidden && !bar.hidden,
                              reason: s.logviewerNothing,
                              run: () => find.focus(),
                          },
                      ],
                      { layoutGuard: 'off' },
                  )
                : () => undefined;

        st.off = [
            () => find.removeEventListener('input', onInput),
            () => find.removeEventListener('keydown', onFindKey),
            () => viewer.removeEventListener('change', onChange),
            () => viewer.removeEventListener('kp-segmented-change', onSegment),
            () => viewer.removeEventListener('click', onClick),
            () => log.removeEventListener(FOLLOW_EVENT, onFollow),
            () => observer.disconnect(),
            () => watcher?.disconnect(),
            stopKeys,
            stopPills,
            stopSegmented,
            stopReasons,
        ];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
    }
    return () => undo.forEach((u) => u());
}
