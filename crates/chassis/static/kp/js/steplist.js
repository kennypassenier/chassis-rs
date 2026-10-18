// The step list: the steps of one run, live.
//
// A process in flight (an update, an import, a deploy) is a list of steps,
// and each step is waiting, running, done, failed or skipped. The page changes
// them as the run goes, and a person must be able to follow it with their eyes
// or their ears. `data-state` on each item is the source; this module keeps
// the rest in step with it, as js/progressbar.js does for a bar's ARIA:
//
//   <ol class="kp-steplist" aria-label="Update progress">
//     <li class="kp-steplist__item" data-state="done" data-kp-step-id="pull">
//       <span class="kp-steplist__mark" aria-hidden="true"></span>
//       <span class="kp-steplist__body">
//         <span class="kp-steplist__title">Pull the images</span>
//         <span class="kp-steplist__note">Fetches what changed from the registry</span>
//       </span>
//       <time class="kp-steplist__time">4 s</time>
//     </li>
//     …
//   </ol>
//
// What attachSteplists() writes, so the markup can stay that short:
//   - the mark's content: the theme's spinner on the running step (the mark
//     is otherwise drawn by CSS from `data-state`);
//   - the state's word in `.kp-steplist__state` (visually hidden), so a reader
//     moving through the list hears "Pull the images, done";
//   - `aria-current="step"` on the running item;
//   - a visually hidden `role="status"` region after the list, which says "Pull
//     the images: running" when a step changes after the list was attached. The
//     list itself is not a live region: it would read every time and every
//     note again. A burst of changes in one tick is one announcement.
//
// A journey [kpadopt4]: `.kp-steplist--journey` lays the steps side by side
// on one path (a column under 30rem of its own width), the way an
// application goes draft, sent, interview, offer. `data-state="current"` is
// the step it stands at now (no spinner: nothing is running), a reached step
// is `done`, a closed path ends with a `failed` step (rejected, withdrawn),
// and `data-kp-tone="1"` … `"5"` (or `--kp-step-tone`) gives a step its own
// colour. The time column holds the date the step was reached.
//
// Change a step with setStep(list, 'pull', { state: 'running' }); no framework
// is needed, and a framework that sets `data-state` itself is followed too.
// Every word it adds is in js/strings.js.

import { getStrings } from './strings.js';

/** The lists this module looks after. */
export const STEPLIST_SELECTOR = '.kp-steplist';
/** The attribute that names a step, for setStep(). */
export const STEP_ID_ATTRIBUTE = 'data-kp-step-id';
/** Fired on the list, bubbling, when a step changed state after attach: `{ item, id, state, previous }`. */
export const STEPLIST_EVENT = 'kp-steplist-step';
/** The states a step can be in. */
export const STEP_STATES = /** @type {const} */ (['pending', 'running', 'done', 'failed', 'skipped', 'current']);

/**
 * @typedef {'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'current'} StepState
 * @typedef {object} StepRow
 * @property {string} [id] names the step for setStep(); defaults to its index
 * @property {string} title
 * @property {string} [note] the one-line description under the title; give every step one, so a note arriving later moves nothing
 * @property {StepState} [state] pending when absent
 * @property {string} [time] how long it took, as the page prints it (in a journey: the date the step was reached)
 * @property {1 | 2 | 3 | 4 | 5} [tone] the step's own colour, `--chart-1` … `--chart-5` (`data-kp-tone`) [kpadopt4]
 */

/** The state each item was last synced to, to tell a change from a first sync. @type {WeakMap<Element, string>} */
const synced = new WeakMap();
/** The messages waiting to be announced, per region. @type {WeakMap<Element, string[]>} */
const pending = new WeakMap();

/** @param {unknown} state @returns {StepState} */
const known = (state) => (STEP_STATES.includes(/** @type {any} */ (state)) ? /** @type {StepState} */ (state) : 'pending');

/** @param {StepState} state */
const stateWord = (state) => {
    const s = getStrings();
    return { pending: s.stepPending, running: s.stepRunning, done: s.stepDone, failed: s.stepFailed, skipped: s.stepSkipped, current: s.stepCurrent }[
        state
    ];
};

/** @param {string} className @param {string} [tag] */
const span = (className, tag = 'span') => {
    const el = document.createElement(tag);
    el.className = className;
    return el;
};

/**
 * Build a step list from rows. The result still needs attachSteplists() (on
 * the element or its container) for the spoken parts.
 *
 * @param {StepRow[]} rows
 * @param {{ label?: string }} [options] `label`: the list's accessible name
 * @returns {HTMLOListElement}
 */
export function buildSteplist(rows, { label } = {}) {
    const list = document.createElement('ol');
    list.className = 'kp-steplist';
    if (label) list.setAttribute('aria-label', label);
    rows.forEach((row, index) => {
        const item = span('kp-steplist__item', 'li');
        item.setAttribute(STEP_ID_ATTRIBUTE, row.id ?? String(index));
        item.dataset.state = known(row.state);
        if (row.tone) item.dataset.kpTone = String(row.tone);
        const body = span('kp-steplist__body');
        body.append(span('kp-steplist__title'), span('kp-steplist__note'));
        item.append(span('kp-steplist__mark'), body, span('kp-steplist__time', 'time'));
        list.append(item);
        writeText(item, row);
        syncItem(item);
    });
    return list;
}

/**
 * Set the text parts of an item from a row or a change.
 * @param {Element} item
 * @param {{ title?: string, note?: string, time?: string }} change
 */
function writeText(item, { title, note, time }) {
    if (title !== undefined) item.querySelector('.kp-steplist__title')?.replaceChildren(title);
    if (note !== undefined) item.querySelector('.kp-steplist__note')?.replaceChildren(note);
    if (time !== undefined) item.querySelector('.kp-steplist__time')?.replaceChildren(time);
}

/**
 * Bring an item's mark, spoken state and `aria-current` in step with its
 * `data-state`, and announce a change.
 *
 * @param {Element} item
 * @param {{ announce?: boolean }} [options]
 * @returns {StepState}
 */
function syncItem(item, { announce = false } = {}) {
    const state = known(item.getAttribute('data-state'));
    if (item.getAttribute('data-state') !== state) item.setAttribute('data-state', state);
    let mark = item.querySelector(':scope > .kp-steplist__mark');
    if (!mark) {
        mark = span('kp-steplist__mark');
        item.prepend(mark);
    }
    mark.setAttribute('aria-hidden', 'true');
    const spinning = mark.querySelector('.kp-spinner');
    if (state === 'running' && !spinning) {
        const spinner = span('kp-spinner');
        spinner.setAttribute('aria-hidden', 'true');
        mark.append(spinner);
    } else if (state !== 'running' && spinning) spinning.remove();
    const body = item.querySelector('.kp-steplist__body') ?? item;
    let word = item.querySelector('.kp-steplist__state');
    if (!word) {
        word = span('kp-steplist__state');
        body.append(word);
    }
    // ", done" after the title: the comma makes the reader pause.
    word.textContent = `, ${stateWord(state)}`;
    if (state === 'running' || state === 'current') item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');

    const previous = synced.get(item);
    synced.set(item, state);
    const list = item.closest(STEPLIST_SELECTOR);
    if (list && announce && previous !== undefined && previous !== state) {
        const title = item.querySelector('.kp-steplist__title')?.textContent?.trim() ?? '';
        say(list, getStrings().stepAnnounce(title, stateWord(state)));
        list.dispatchEvent(
            new CustomEvent(STEPLIST_EVENT, {
                bubbles: true,
                detail: { item, id: item.getAttribute(STEP_ID_ATTRIBUTE), state, previous },
            }),
        );
    }
    return state;
}

/**
 * The list's status region, made on first need (right after the list).
 * @param {Element} list
 * @returns {HTMLElement}
 */
function regionOf(list) {
    const next = list.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('kp-steplist__live')) return next;
    const region = span('kp-sr-only kp-steplist__live');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    list.after(region);
    return region;
}

/**
 * Say something through the list's region; a burst in one tick is one message.
 * @param {Element} list
 * @param {string} message
 */
function say(list, message) {
    const fresh = !(list.nextElementSibling?.classList.contains('kp-steplist__live') ?? false);
    const region = regionOf(list);
    const queue = pending.get(region);
    if (queue) {
        queue.push(message);
        return;
    }
    pending.set(region, [message]);
    // A region put in the page and written to in the same breath is often not
    // read; one made just now waits a moment.
    setTimeout(
        () => {
            region.textContent = (pending.get(region) ?? []).join('. ');
            pending.delete(region);
        },
        fresh ? 100 : 0,
    );
}

/**
 * Change one step. `key` is the step's `data-kp-step-id` or its index.
 *
 * @param {Element} list
 * @param {string | number} key
 * @param {{ state?: StepState, title?: string, note?: string, time?: string }} change
 * @returns {Element | null} the item, or null when there is no such step
 */
export function setStep(list, key, change) {
    const items = [...list.querySelectorAll(':scope > .kp-steplist__item')];
    const item = typeof key === 'number' ? items[key] : items.find((el) => el.getAttribute(STEP_ID_ATTRIBUTE) === key);
    if (!item) return null;
    writeText(item, change);
    if (change.state !== undefined) item.setAttribute('data-state', known(change.state));
    syncItem(item, { announce: true });
    return item;
}

/**
 * Sync every `.kp-steplist` under `root`, and follow `data-state` changes
 * later, so a framework or a hand-written `setAttribute` is followed too.
 * A list rendered after this ran is attached by calling it on that subtree.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops following the lists
 */
export function attachSteplists(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(STEPLIST_SELECTOR) ? [root] : []),
        ...root.querySelectorAll(STEPLIST_SELECTOR),
    ]);
    for (const list of lists) {
        for (const item of list.querySelectorAll(':scope > .kp-steplist__item')) syncItem(item);
        regionOf(list);
    }
    if (typeof MutationObserver === 'undefined' || lists.length === 0) return () => {};
    const watch = new MutationObserver((records) => {
        for (const record of records) {
            const target = /** @type {Element} */ (record.target);
            if (target.classList.contains('kp-steplist__item')) syncItem(target, { announce: true });
        }
    });
    for (const list of lists) watch.observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true });
    return () => watch.disconnect();
}
