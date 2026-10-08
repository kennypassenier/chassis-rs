// A freshness line that ticks: "updated 12 s ago" [scope-143].
//
// Live data says how old it is, and the words keep up by themselves. Mark
// the element with `data-kp-ago` and give it its moment as a machine reads
// it, in `datetime` (a `<time>`'s ISO moment) or in `data-kp-ago` itself
// (ISO or milliseconds since the epoch):
//
//   <time class="kp-ago" data-kp-ago data-kp-ago-verb="updated"
//         data-kp-stale-after="180" datetime="2026-10-04T12:00:05Z">updated 12 s ago</time>
//
// attachAgo(root) rewrites every such element under `root` once a second,
// with ONE timer for the whole page however many lines it carries, and finds
// lines added later by watching the page rather than querying it every
// second. The words come from the dictionary (js/strings.js: `agoText`,
// `agoNever` and the four unit words), with exact numbers and the two
// largest units, a zero part left out: `12 s`, `2 min`, `2 min 5 s`, `3 h`,
// `3 h 12 min`, `1 day`, `2 days 4 h`. A moment in the future (another
// clock running ahead) reads `0 s`; no moment reads `not updated yet`.
//
// What else it keeps:
//   - The absolute moment in the title and `aria-description`, as rule 52
//     writes a moment a person reads: dd/mm/yyyy HH:mm, 24-hour, in
//     Europe/Brussels whatever the reader's zone (`timeZone` to change it).
//   - `data-kp-stale-after="<seconds>"`: older than that, the element gets
//     `data-kp-stale`, which the stylesheet draws as a warning plate with a
//     shadow, so turning stale moves nothing.
//   - Its width: the line reserves (`min-inline-size`) the widest text its
//     current unit can reach ("updated 59 min 59 s ago" under an hour), so
//     a unit change does not push its neighbours; `data-kp-ago-width="14ch"`
//     sets the width itself. That is the only layout read, once per unit.
//   - No chatter: the line is `aria-live="off"`, so a screen reader is not
//     told the time every second, and a line found inside a live region
//     warns once in the console. `data-kp-ago-announce="state"` adds a
//     hidden status beside it that speaks only when the line turns stale or
//     fresh again.
//   - The timer stops while the tab is hidden and repaints every line the
//     moment it is shown again.
//
// Nothing runs on import; attachAgo(root) returns a detach. `now` can be
// given, so a test never reads the real clock.

import { getStrings, resolveStrings } from './strings.js';

/** A ticking line. */
export const AGO = '[data-kp-ago]';

/** The zone a moment is written in, whatever the reader's (rule 52). */
export const FRESHNESS_TIME_ZONE = 'Europe/Brussels';

/** @typedef {import('./strings.js').Strings} Strings */

/**
 * A span of seconds in the units a person reads best: seconds under a
 * minute, minutes and seconds under an hour, hours and minutes under a day,
 * days and hours beyond; a zero second part is left out ("2 min").
 * @param {number} seconds
 * @param {Strings} [strings]
 * @returns {string}
 */
export function humanDuration(seconds, strings = getStrings()) {
    const d = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
    /** @param {string} big @param {number} small @param {(n: number) => string} unit */
    const pair = (big, small, unit) => (small === 0 ? big : `${big} ${unit(small)}`);
    if (d < 60) return strings.agoSeconds(d);
    if (d < 3600) return pair(strings.agoMinutes(Math.floor(d / 60)), d % 60, strings.agoSeconds);
    if (d < 86400) return pair(strings.agoHours(Math.floor(d / 3600)), Math.floor((d % 3600) / 60), strings.agoMinutes);
    return pair(strings.agoDays(Math.floor(d / 86400)), Math.floor((d % 86400) / 3600), strings.agoHours);
}

/**
 * The line's words: "updated 12 s ago", or "not updated yet" with no moment.
 * A moment after `nowMs` reads 0 s.
 * @param {string} verb
 * @param {number | null | undefined} atMs
 * @param {number} nowMs
 * @param {Strings} [strings]
 * @returns {string}
 */
export function agoText(verb, atMs, nowMs, strings = getStrings()) {
    if (atMs == null || !Number.isFinite(atMs)) return strings.agoNever(verb);
    return strings.agoText(verb, humanDuration(Math.max(0, Math.floor((nowMs - atMs) / 1000)), strings));
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const FORMATS = new Map();

/**
 * A moment as a person reads it (rule 52): `dd/mm/yyyy HH:mm`, 24-hour, in
 * `timeZone`. The parts are read one by one, so no locale reorders or names
 * them.
 * @param {number} ms
 * @param {string} [timeZone]
 * @returns {string}
 */
export function agoMoment(ms, timeZone = FRESHNESS_TIME_ZONE) {
    let format = FORMATS.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        FORMATS.set(timeZone, format);
    }
    /** @type {Record<string, string>} */
    const p = {};
    for (const part of format.formatToParts(ms)) p[part.type] = part.value;
    const hour = String(Number(p.hour) % 24).padStart(2, '0');
    return `${p.day}/${p.month}/${p.year} ${hour}:${p.minute}`;
}

/**
 * The moment an element carries, in ms, or null: its `datetime`, else the
 * value of `data-kp-ago` (ISO or milliseconds).
 * @param {Element} el
 * @returns {number | null}
 */
export function momentOf(el) {
    const raw = (el.getAttribute('datetime') ?? el.getAttribute('data-kp-ago') ?? '').trim();
    if (raw === '') return null;
    const ms = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * @typedef {object} AgoContext
 * @property {string} timeZone
 * @property {() => number} now
 * @property {Partial<Strings> | undefined} overrides the attach's own words, over the dictionary's as they stand
 * @property {object} owner the attach that found the line
 */

/**
 * @typedef {object} AgoState
 * @property {number | null | undefined} at the moment last painted
 * @property {string} sample the text the reserved width was measured from
 * @property {boolean | null} stale the stale state last painted (null before the first)
 */

/** Every ticking line on the page, with the context it ticks in. */
/** @type {Map<HTMLElement, AgoContext>} */
const live = new Map();
/** @type {WeakMap<HTMLElement, AgoState>} */
const states = new WeakMap();
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
let warned = false;
/** How many attaches listen for the tab being hidden and shown. */
let listening = 0;
/** Reserved widths already measured, by text and face: one read serves every line that shares them. */
/** @type {Map<string, number>} */
const widths = new Map();

/** @returns {AgoContext} */
const defaultContext = () => ({ timeZone: FRESHNESS_TIME_ZONE, now: () => Date.now(), overrides: undefined, owner: {} });

/**
 * The widest text the line's current unit can reach: under an hour
 * "59 min 59 s", under a day "23 h 59 min", beyond that "99 days 23 h".
 * @param {string} verb @param {number | null} at @param {number} now @param {Strings} strings
 */
function widest(verb, at, now, strings) {
    if (at == null) return strings.agoNever(verb);
    const age = Math.max(0, (now - at) / 1000);
    const top = age < 3600 ? 3599 : age < 86400 ? 86399 : 99 * 86400 + 23 * 3600;
    return strings.agoText(verb, humanDuration(top, strings));
}

/**
 * Reserve the line's width for the widest text of its unit: measured once
 * per unit (the only layout read), by writing that text into the line for
 * the length of one synchronous step.
 * @param {HTMLElement} el @param {string} sample
 */
function reserve(el, sample) {
    const own = el.getAttribute('data-kp-ago-width');
    if (own) {
        el.style.setProperty('min-inline-size', own);
        return;
    }
    const style = getComputedStyle(el);
    const key = [
        sample,
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.fontStyle,
        style.fontStretch,
        style.fontVariantNumeric,
        style.letterSpacing,
        style.textTransform,
    ].join('|');
    let width = widths.get(key);
    if (width === undefined) {
        const kept = [...el.childNodes];
        const probe = el.ownerDocument.createElement('span');
        probe.textContent = sample;
        el.replaceChildren(probe);
        width = probe.getBoundingClientRect().width;
        el.replaceChildren(...kept);
        if (width > 0) widths.set(key, width);
    }
    if (width > 0) el.style.setProperty('min-inline-size', `${Math.ceil(width)}px`);
}

/**
 * Write one line as it stands at `now`.
 * @param {HTMLElement} el @param {AgoContext} ctx
 */
function paint(el, ctx) {
    const strings = resolveStrings(ctx.overrides);
    const now = ctx.now();
    const at = momentOf(el);
    const verb = el.getAttribute('data-kp-ago-verb') || strings.agoVerb;
    const text = agoText(verb, at, now, strings);
    let state = states.get(el);
    if (!state) {
        state = { at: undefined, sample: '', stale: null };
        states.set(el, state);
    }
    // Width first, while the old text is still there: only when the unit changed.
    const sample = widest(verb, at, now, strings);
    if (sample !== state.sample) {
        state.sample = sample;
        reserve(el, sample);
    }
    if (el.textContent !== text) el.textContent = text;
    // The absolute moment, rewritten only when the moment changes.
    if (at !== state.at) {
        state.at = at;
        if (at == null) {
            el.removeAttribute('title');
            el.removeAttribute('aria-description');
        } else {
            const moment = agoMoment(at, ctx.timeZone);
            el.setAttribute('title', moment);
            el.setAttribute('aria-description', moment);
        }
    }
    const after = Number(el.getAttribute('data-kp-stale-after') ?? NaN);
    const stale = at != null && Number.isFinite(after) && (now - at) / 1000 > after;
    if (stale) {
        if (!el.hasAttribute('data-kp-stale')) el.setAttribute('data-kp-stale', '');
    } else el.removeAttribute('data-kp-stale');
    if (state.stale !== null && state.stale !== stale && el.getAttribute('data-kp-ago-announce') === 'state')
        announce(el, stale ? strings.agoStale(text) : strings.agoFresh(text));
    state.stale = stale;
}

/**
 * Speak a change of state through a hidden status beside the line.
 * @param {HTMLElement} el @param {string} words
 */
function announce(el, words) {
    let voice = el.nextElementSibling;
    if (!(voice instanceof HTMLElement) || !voice.hasAttribute('data-kp-ago-voice')) {
        voice = el.ownerDocument.createElement('span');
        voice.className = 'kp-sr-only';
        voice.setAttribute('role', 'status');
        voice.setAttribute('data-kp-ago-voice', '');
        el.after(voice);
    }
    voice.textContent = words;
}

/** One pass over every line: no layout reads unless a unit changed. */
function tick() {
    for (const [el, ctx] of live) if (el.isConnected) paint(el, ctx);
}

/** Start, keep or stop the one timer, as the page's lines and visibility ask. */
function steer() {
    const doc = typeof document === 'undefined' ? null : document;
    const want = live.size > 0 && doc?.visibilityState !== 'hidden';
    if (want && timer === null) timer = setInterval(tick, 1000);
    if (!want && timer !== null) {
        clearInterval(timer);
        timer = null;
    }
}

const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') tick();
    steer();
};

/**
 * Take a line into the ticking set and paint it at once.
 * @param {HTMLElement} el @param {AgoContext} ctx
 */
function adopt(el, ctx) {
    if (!live.has(el)) {
        live.set(el, ctx);
        // Silenced for screen readers: the time changes every second.
        el.setAttribute('aria-live', 'off');
        const region = el.parentElement?.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"]');
        if (region && !region.hasAttribute('data-kp-ago-voice') && !warned) {
            warned = true;
            console.warn(resolveStrings(ctx.overrides).agoInLiveRegion);
        }
    }
    paint(el, live.get(el) ?? ctx);
}

/**
 * Set a line's moment (ms since the epoch, or null for none) and repaint it
 * at once. The moment is written to `datetime` as ISO, for machines.
 * @param {HTMLElement} el
 * @param {number | null | undefined} ms
 */
export function setAgo(el, ms) {
    if (!el.hasAttribute('data-kp-ago')) el.setAttribute('data-kp-ago', '');
    else if (el.getAttribute('data-kp-ago') !== '') el.setAttribute('data-kp-ago', '');
    if (ms == null || !Number.isFinite(ms)) el.removeAttribute('datetime');
    else el.setAttribute('datetime', new Date(ms).toISOString());
    paint(el, live.get(el) ?? defaultContext());
}

/**
 * Keep every freshness line under `root` ticking, now and as lines arrive,
 * change or leave. One timer serves the whole page.
 *
 * @param {ParentNode} [root]
 * @param {{ timeZone?: string, now?: () => number, strings?: Partial<Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachAgo(root = document, { timeZone = FRESHNESS_TIME_ZONE, now = () => Date.now(), strings } = {}) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    const owner = {};
    /** @type {AgoContext} */
    const ctx = { timeZone, now, overrides: strings, owner };
    /** @param {ParentNode} scope */
    const linesIn = (scope) =>
        /** @type {HTMLElement[]} */ ([...(scope instanceof Element && scope.matches(AGO) ? [scope] : []), ...scope.querySelectorAll(AGO)]);
    for (const el of linesIn(root)) adopt(el, ctx);
    if (!view) return () => {};
    const watcher = new view.MutationObserver((records) => {
        let removed = false;
        for (const record of records) {
            if (record.type === 'attributes') {
                const el = /** @type {HTMLElement} */ (record.target);
                if (el.matches(AGO)) adopt(el, ctx);
                continue;
            }
            for (const node of record.addedNodes) if (node instanceof view.Element) for (const el of linesIn(node)) adopt(el, ctx);
            if (record.removedNodes.length) removed = true;
        }
        if (removed)
            queueMicrotask(() => {
                for (const el of live.keys()) if (!el.isConnected) live.delete(el);
                steer();
            });
        steer();
    });
    watcher.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['datetime', 'data-kp-ago', 'data-kp-ago-verb', 'data-kp-stale-after', 'data-kp-ago-width'],
    });
    // A theme's face changes the widths: measure again.
    // A theme's face, or a face that arrives late, changes the widths:
    // measure again.
    const remeasure = () => {
        widths.clear();
        for (const [el, own] of live) {
            const state = states.get(el);
            if (state) state.sample = '';
            if (own.owner === owner && el.isConnected) paint(el, own);
        }
    };
    const theme = new view.MutationObserver(remeasure);
    theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    doc.fonts?.addEventListener?.('loadingdone', remeasure);
    if (listening++ === 0) doc.addEventListener('visibilitychange', onVisibility);
    steer();
    return () => {
        watcher.disconnect();
        theme.disconnect();
        doc.fonts?.removeEventListener?.('loadingdone', remeasure);
        if (--listening === 0) doc.removeEventListener('visibilitychange', onVisibility);
        for (const [el, own] of live) if (own.owner === owner) live.delete(el);
        steer();
    };
}
