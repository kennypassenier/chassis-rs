// The automatic refresh chooser [kpadopt5-ops; spec item 8].
//
// A small control "Every 30 s / Paused" with "updated 12 s ago" beside it. The
// APP does the fetching: on each tick the control fires `kp-refresh`, the app
// reads its data and calls `detail.done(true | false)` (or refreshDone(el, ok)).
//
//   <div class="kp-refresh" data-kp-refresh="30" data-kp-remember="dashboard"></div>
//
// Options, each an attribute and a JS option of attachRefresh(root, options):
//
//   data-kp-refresh          seconds the page opens with; default 30 (Kenny, 2026-10-17: "default 30 seconden,
//                            maar moet aanpasbaar zijn"); 0 opens paused
//   data-kp-refresh-choices  the seconds offered, 0 = paused; default "0,15,30,60,300". The "Other…" entry takes ANY
//                            whole number of seconds, from the user and (setRefreshInterval) from the consumer
//   data-kp-refresh-mode     event (default: the app fetches) | page (reload the page) | region (fetch the same URL
//                            and swap only `data-kp-refresh-region`, keeping focus and scroll)
//   data-kp-refresh-region   selector of the element to swap in `region` mode
//   data-kp-look             segmented (default, Kenny 2026-10-17: "Segments") | menu
//   data-kp-remember         name: the choice per page per device (js/remember.js, component `refresh`)
//   data-kp-stale-after      seconds; the freshness line turns stale after it (default 3 x the interval)
//   data-kp-refresh-hover    "pause": no refresh while the pointer is over a `.kp-table-wrap` being read
//
// What it does for the person: the line says "updated N s ago" (js/freshness.js) and, while the app reads,
// "updating…" in the same width; a thin rule under the control runs down to the next refresh. A failed refresh
// keeps the data and says "Last refresh failed, retrying in 30 s" with Retry now; the retries back off (the
// interval, twice, four times, then that) and return to normal on success. It never eats typing: a refresh waits
// while a dialog is open or a form field has the focus, and while the tab is hidden; on return it refreshes once if
// one was due. The R key refreshes now (not inside a field).
//
// Events (bubbling, on the control):
//   kp-refresh           { reason: 'timer' | 'now' | 'retry' | 'return', interval, done(ok) }
//   kp-refresh-interval  { seconds, by: 'user' | 'script' }
//
// Every word is in js/strings.js. Nothing runs on import; attachRefresh(root) returns a detach.

import { attachMenuButtons, setMenu } from './menu-button.js';
import { attachSegmented, setSegmentedItems, setSegmentedValues } from './segmented.js';
import { humanDuration, setAgo } from './freshness.js';
import { memoryFor } from './remember.js';
import { getStrings } from './strings.js';

/** An automatic refresh control. */
export const REFRESH = '[data-kp-refresh]';
/** Fired on the control at each refresh the app should do. */
export const REFRESH_EVENT = 'kp-refresh';
/** Fired when the interval changed. */
export const REFRESH_INTERVAL_EVENT = 'kp-refresh-interval';
/** The interval a page opens with, in seconds, and the choices offered. */
export const REFRESH_DEFAULT = 30;
export const REFRESH_CHOICES = [0, 15, 30, 60, 300];

/**
 * @typedef {object} RefreshHandle
 * @property {HTMLElement} element
 * @property {() => number} interval seconds, 0 = paused
 * @property {(seconds: number, by?: 'user' | 'script') => void} setInterval any whole number of seconds
 * @property {(reason?: 'now' | 'retry') => void} now refresh at once
 * @property {(ok: boolean) => void} done the app's answer to the refresh in progress
 */

/** @type {WeakMap<Element, RefreshHandle>} */
const handles = new WeakMap();

/** The handle of an attached control. @param {Element} element */
export const refreshOf = (element) => handles.get(element) ?? null;

/**
 * Tell a control the app has finished the refresh it asked for.
 * @param {Element} element @param {boolean} ok
 */
export function refreshDone(element, ok) {
    handles.get(element)?.done(ok);
}

/**
 * Set the interval from the consumer (any whole number of seconds; 0 pauses).
 * @param {Element} element @param {number} seconds
 */
export function setRefreshInterval(element, seconds) {
    handles.get(element)?.setInterval(seconds, 'script');
}

/** @param {string | null} raw @param {number[]} fallback */
const numbers = (raw, fallback) => {
    if (raw === null) return fallback;
    const list = raw
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0 && Number.isInteger(n));
    return list.length ? list : fallback;
};

/** "Every 30 s", "Every 2 min", "Paused". @param {number} seconds */
const wordsFor = (seconds) => {
    const s = getStrings();
    return seconds === 0 ? s.refreshPaused : s.refreshEvery(humanDuration(seconds, s));
};

/**
 * Wire every refresh control under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachRefresh(root = document, { now = () => Date.now() } = {}) {
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(REFRESH) ? [root] : []),
        ...root.querySelectorAll(REFRESH),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of found) {
        if (handles.has(el)) continue;
        undo.push(wire(el, now));
    }
    return () => undo.forEach((u) => u());
}

/**
 * @param {HTMLElement} el
 * @param {() => number} clock
 * @returns {() => void}
 */
function wire(el, clock) {
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const memory = memoryFor(el, 'refresh');
    const choices = () => numbers(el.getAttribute('data-kp-refresh-choices'), REFRESH_CHOICES);
    const mode = () => el.getAttribute('data-kp-refresh-mode') ?? 'event';
    const look = () => (el.getAttribute('data-kp-look') === 'menu' ? 'menu' : 'segmented');
    const startValue = Number(el.getAttribute('data-kp-refresh') ?? REFRESH_DEFAULT);
    let interval = Number.isFinite(startValue) && startValue >= 0 ? Math.round(startValue) : REFRESH_DEFAULT;
    const remembered = memory?.read('value', null);
    if (typeof remembered === 'number' && remembered >= 0) interval = remembered;

    // --- The parts. ---
    el.classList.add('kp-refresh');
    const s = () => getStrings();
    const make = (/** @type {string} */ tag, /** @type {string} */ className) => {
        const node = doc.createElement(tag);
        node.className = className;
        return node;
    };
    const chooser = make('div', 'kp-refresh__chooser');
    /** @type {HTMLElement | null} */
    let menuHost = null;
    /** @type {HTMLElement | null} */
    let segHost = null;
    /** @type {HTMLButtonElement | null} */
    let menuButton = null;
    if (look() === 'menu') {
        menuHost = make('div', 'kp-menu-button kp-refresh__menu');
        menuHost.setAttribute('data-kp-menu-button', '');
        menuButton = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-refresh__button'));
        menuButton.type = 'button';
        menuButton.setAttribute('aria-label', s().refreshLabel);
        const menu = make('div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', s().refreshLabel);
        menuHost.append(menuButton, menu);
        chooser.append(menuHost);
    } else {
        segHost = make('div', 'kp-segmented kp-refresh__segments');
        segHost.setAttribute('data-kp-segmented', 'single');
        segHost.setAttribute('role', 'radiogroup');
        segHost.setAttribute('aria-label', s().refreshLabel);
        chooser.append(segHost);
    }
    const custom = make('form', 'kp-refresh__custom');
    custom.hidden = true;
    custom.setAttribute('novalidate', '');
    const customLabel = /** @type {HTMLLabelElement} */ (make('label', 'kp-refresh__custom-label'));
    customLabel.textContent = s().refreshCustomLabel;
    const input = /** @type {HTMLInputElement} */ (make('input', 'kp-field__input kp-refresh__input'));
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.id = `kp-refresh-${Math.random().toString(36).slice(2, 8)}`;
    customLabel.htmlFor = input.id;
    const apply = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-refresh__apply'));
    apply.type = 'submit';
    apply.textContent = s().refreshApply;
    const problem = make('span', 'kp-refresh__problem');
    problem.setAttribute('role', 'alert');
    custom.append(customLabel, input, apply, problem);

    const line = make('span', 'kp-refresh__line');
    const ago = /** @type {HTMLElement} */ (make('time', 'kp-ago kp-refresh__ago'));
    ago.setAttribute('data-kp-ago', '');
    const busyWords = make('span', 'kp-refresh__busy');
    busyWords.textContent = s().refreshUpdating;
    busyWords.hidden = true;
    line.append(ago, busyWords);
    const now = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-refresh__now'));
    now.type = 'button';
    now.textContent = s().refreshNow;
    now.setAttribute('aria-keyshortcuts', 'R');
    const count = make('span', 'kp-refresh__count');
    count.setAttribute('aria-hidden', 'true');
    const note = make('p', 'kp-refresh__note');
    note.setAttribute('role', 'status');
    const retry = /** @type {HTMLButtonElement} */ (make('button', 'kp-button kp-button--sm kp-refresh__retry'));
    retry.type = 'button';
    retry.textContent = s().refreshRetryNow;
    retry.hidden = true;
    const failure = make('div', 'kp-alert kp-alert--warning kp-refresh__failure');
    failure.hidden = true;
    failure.append(note, retry);
    const bar = make('div', 'kp-refresh__bar');
    bar.append(chooser, line, now);
    el.replaceChildren(bar, count, custom, failure);
    if (menuHost) attachMenuButtons(el);
    if (segHost) attachSegmented(el);

    // --- State. ---
    let busy = false;
    let failures = 0;
    /** @type {'timer' | 'now' | 'retry' | 'return'} */
    let reason = 'timer';
    let dueAt = 0;
    let timer = 0;
    let updatedAt = /** @type {number | null} */ (null);
    let lastDelay = 0;
    let missedWhileHidden = false;

    const staleAfter = () => {
        const own = Number(el.getAttribute('data-kp-stale-after'));
        return Number.isFinite(own) && own > 0 ? own : Math.max(60, 3 * (interval || REFRESH_DEFAULT));
    };
    const paintAgo = () => {
        ago.setAttribute('data-kp-stale-after', String(staleAfter()));
        ago.setAttribute('data-kp-ago-announce', el.getAttribute('data-kp-announce') === 'off' ? 'off' : 'state');
        setAgo(ago, updatedAt);
    };
    const paintChoice = () => {
        const list = [...new Set([...choices(), interval])].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
        if (menuHost && menuButton) {
            menuButton.textContent = `${wordsFor(interval)} ▾`;
            setMenu(menuHost, [
                {
                    group: '',
                    items: [
                        ...list.map((n) => ({
                            label: wordsFor(n),
                            value: String(n),
                            attrs: { 'aria-checked': String(n === interval), role: 'menuitemradio' },
                        })),
                        { label: s().refreshOther, value: 'other' },
                    ],
                },
            ]);
        } else if (segHost) {
            setSegmentedItems(segHost, [...list.map((n) => ({ value: String(n), label: wordsFor(n) })), { value: 'other', label: s().refreshOther }]);
            setSegmentedValues(segHost, [String(interval)]);
        }
    };
    const runBar = () => {
        const ms = Math.max(0, dueAt - clock());
        count.style.setProperty('--kp-refresh-ms', `${ms}ms`);
        count.removeAttribute('data-kp-run');
        void count.offsetWidth;
        if (interval > 0 && !busy) count.setAttribute('data-kp-run', '');
    };
    const blocked = () => {
        if (doc.visibilityState === 'hidden') return 'hidden';
        if (doc.querySelector('dialog[open]')) return 'dialog';
        const a = doc.activeElement;
        if (
            a instanceof HTMLElement &&
            !el.contains(a) &&
            a.matches(
                'input:not([type=checkbox], [type=radio], [type=button], [type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]',
            )
        )
            return 'typing';
        if (el.getAttribute('data-kp-refresh-hover') === 'pause' && doc.querySelector('.kp-table-wrap:hover')) return 'reading';
        return '';
    };
    const delayNow = () => (failures > 0 ? interval * 2 ** Math.min(failures - 1, 2) : interval) * 1000;
    const schedule = (ms = delayNow()) => {
        view.clearTimeout(timer);
        if (interval <= 0) {
            count.removeAttribute('data-kp-run');
            return;
        }
        lastDelay = ms;
        dueAt = clock() + ms;
        timer = view.setTimeout(fire, ms);
        runBar();
    };
    const finish = (/** @type {boolean} */ ok) => {
        if (!busy) return;
        busy = false;
        el.removeAttribute('aria-busy');
        busyWords.hidden = true;
        line.removeAttribute('data-kp-busy');
        if (ok) {
            failures = 0;
            updatedAt = clock();
            failure.hidden = true;
            retry.hidden = true;
            paintAgo();
        } else {
            failures += 1;
            const next = humanDuration(Math.round(delayNow() / 1000), s());
            note.textContent = s().refreshFailed(next);
            failure.hidden = false;
            retry.hidden = false;
            // The ago line turns stale by its own clock; make sure it is checked now.
            paintAgo();
        }
        schedule();
    };
    function fire() {
        if (interval <= 0 || busy) return;
        const why = blocked();
        if (why === 'hidden') {
            missedWhileHidden = true;
            return;
        }
        if (why) {
            timer = view.setTimeout(fire, 1000);
            return;
        }
        const r = reason;
        reason = 'timer';
        busy = true;
        el.setAttribute('aria-busy', 'true');
        busyWords.hidden = false;
        line.setAttribute('data-kp-busy', '');
        count.removeAttribute('data-kp-run');
        if (mode() === 'page') {
            view.location.reload();
            return;
        }
        if (mode() === 'region') {
            void regionRefresh().then(finish, () => finish(false));
            return;
        }
        let answered = false;
        el.dispatchEvent(
            new CustomEvent(REFRESH_EVENT, {
                bubbles: true,
                detail: {
                    reason: r,
                    interval,
                    done: (/** @type {boolean} */ ok = true) => {
                        if (answered) return;
                        answered = true;
                        finish(ok);
                    },
                },
            }),
        );
    }
    async function regionRefresh() {
        const selector = el.getAttribute('data-kp-refresh-region');
        if (!selector) return true;
        const response = await view.fetch(view.location.href, { headers: { 'X-Requested-With': 'kp-refresh' } });
        if (!response.ok) return false;
        const html = await response.text();
        const next = new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
        const here = doc.querySelector(selector);
        if (!next || !here) return false;
        // Swap the children, keeping the element itself: scroll and an open menu on it survive.
        const top = here.scrollTop;
        here.replaceChildren(...next.childNodes);
        here.scrollTop = top;
        return true;
    }

    /** @param {number} seconds @param {'user' | 'script'} by */
    const setInterval = (seconds, by = 'script') => {
        const next = Math.max(0, Math.round(Number(seconds)));
        if (!Number.isFinite(next)) return;
        interval = next;
        memory?.write('value', interval);
        failures = 0;
        failure.hidden = true;
        el.toggleAttribute('data-kp-paused', interval === 0);
        paintChoice();
        paintAgo();
        if (!busy) schedule();
        el.dispatchEvent(new CustomEvent(REFRESH_INTERVAL_EVENT, { bubbles: true, detail: { seconds: interval, by } }));
    };
    /** @param {'now' | 'retry'} [why] */
    const refreshNow = (why = 'now') => {
        if (busy) return;
        reason = why;
        view.clearTimeout(timer);
        fire();
    };

    // --- Events. ---
    /** @param {Event} event */
    const picked = (event) => {
        const detail = /** @type {CustomEvent} */ (event).detail;
        const value = event.type === 'kp-menu-select' ? detail?.value : detail?.value;
        if (value === undefined || value === null) return;
        if (value === 'other') {
            custom.hidden = false;
            input.value = String(interval || REFRESH_DEFAULT);
            input.focus();
            input.select();
            return;
        }
        custom.hidden = true;
        setInterval(Number(value), 'user');
    };
    el.addEventListener('kp-menu-select', picked);
    el.addEventListener('kp-segmented-change', picked);
    /** @param {SubmitEvent} event */
    const submit = (event) => {
        event.preventDefault();
        const n = Number(input.value);
        if (!Number.isInteger(n) || n < 1) {
            problem.textContent = s().refreshInvalid;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        problem.textContent = '';
        input.removeAttribute('aria-invalid');
        custom.hidden = true;
        setInterval(n, 'user');
    };
    custom.addEventListener('submit', submit);
    /** @param {KeyboardEvent} event */
    const customKey = (event) => {
        if (event.key === 'Escape') {
            custom.hidden = true;
            (menuButton ?? segHost)?.focus?.();
        }
    };
    custom.addEventListener('keydown', customKey);
    const onNow = () => refreshNow('now');
    now.addEventListener('click', onNow);
    const onRetry = () => refreshNow('retry');
    retry.addEventListener('click', onRetry);
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key !== 'r' && event.key !== 'R') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const t = event.target;
        if (t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')) return;
        refreshNow('now');
    };
    if (el.getAttribute('data-kp-refresh-key') !== 'off') doc.addEventListener('keydown', onKey);
    const onVisible = () => {
        if (doc.visibilityState === 'hidden') {
            view.clearTimeout(timer);
            count.removeAttribute('data-kp-run');
            return;
        }
        if (interval > 0 && !busy) {
            if (missedWhileHidden || clock() >= dueAt) {
                missedWhileHidden = false;
                reason = 'return';
                fire();
            } else schedule(Math.max(0, dueAt - clock()));
        }
    };
    doc.addEventListener('visibilitychange', onVisible);

    /** @type {RefreshHandle} */
    const handle = { element: el, interval: () => interval, setInterval, now: refreshNow, done: finish };
    handles.set(el, handle);
    paintChoice();
    paintAgo();
    schedule();
    void lastDelay;
    return () => {
        view.clearTimeout(timer);
        el.removeEventListener('kp-menu-select', picked);
        el.removeEventListener('kp-segmented-change', picked);
        custom.removeEventListener('submit', submit);
        now.removeEventListener('click', onNow);
        retry.removeEventListener('click', onRetry);
        doc.removeEventListener('keydown', onKey);
        doc.removeEventListener('visibilitychange', onVisible);
        handles.delete(el);
    };
}
