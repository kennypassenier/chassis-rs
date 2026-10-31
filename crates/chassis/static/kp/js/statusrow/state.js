// The status lists' selector, events and states, their per-row memory, and the small helpers every part shares.

import { getStrings } from '../strings.js';

/** The lists this module looks after. */
export const STATUS_LIST = '.kp-statuslist';

/** The attribute that names a row, for setStatus(). */
export const STATUS_ID_ATTRIBUTE = 'data-kp-status-id';

/** Fired on the list, bubbling, when a row changed state after attach: `{ item, id, state, previous }`. */
export const STATUS_EVENT = 'kp-status-change';

/** Fired on the list, bubbling, when a Retry is pressed: `{ item, id }`. */
export const STATUS_RETRY_EVENT = 'kp-status-retry';

/** Fired on the list, bubbling, when Resume is pressed on a paused calm row (cancelable): `{ item, id }`. */
export const STATUS_RESUME_EVENT = 'kp-status-resume';

/** Fired on the list, bubbling, when Pause is pressed on an open calm row (cancelable): `{ item, id }`. */
export const STATUS_PAUSE_EVENT = 'kp-status-pause';

/** Fired on the list, bubbling, when Undo takes a resume or a pause back: `{ item, id, action }`. */
export const STATUS_UNDO_EVENT = 'kp-status-undo';

/** The states a row can be in. */
export const STATUS_STATES = /** @type {const} */ (['ok', 'loading', 'failed', 'empty', 'warn']);

/** The states a row of the calm vocabulary can be in. */
export const CALM_STATUS_STATES = /** @type {const} */ (['open', 'done', 'paused', 'unknown', 'loading']);

/**
 * @typedef {'ok' | 'loading' | 'failed' | 'empty' | 'warn' | 'open' | 'done' | 'paused' | 'unknown'} StatusState
 * @typedef {object} StatusRow
 * @property {string} [id] names the row for setStatus(); defaults to its label
 * @property {string} label
 * @property {string} [detail] the short line under the label: how long, the reason; give every row one so a reason arriving later moves nothing
 * @property {StatusState} [state] loading when absent
 * @property {string} [fix] what to do about it, written out; shown on a failed or warn row only [kpadopt4-rows]
 * @property {string} [since] a paused calm row's day, `YYYY-MM-DD` [kpadopt6]
 */

/** The state each row was last synced to. @type {WeakMap<Element, string>} */
export const synced = new WeakMap();

/** The messages waiting to be announced, per region. @type {WeakMap<Element, { label: string, state: StatusState, detail: string }[]>} */
export const pending = new WeakMap();

/** @param {Element | null} list */
export const isCalm = (list) => list?.getAttribute('data-kp-status-vocab') === 'calm';

/** The tones a calm list has been warned about, so each is said once. */
export const warned = new Set();

/**
 * A row's state in the list's vocabulary. A calm list keeps its four, maps the standard `ok` to done and `empty` to open, and
 * draws anything else (a red `failed`, a `warn`) as unknown, so a red cannot slip into a calm list by accident.
 * @param {unknown} state @param {boolean} [calm] @returns {StatusState}
 */
export function known(state, calm = false) {
    if (!calm) return STATUS_STATES.includes(/** @type {any} */ (state)) ? /** @type {StatusState} */ (state) : 'loading';
    if (CALM_STATUS_STATES.includes(/** @type {any} */ (state))) return /** @type {StatusState} */ (state);
    if (state === 'ok') return 'done';
    if (state === 'empty') return 'open';
    const key = String(state);
    if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[kp-statuslist] "${key}" is not a calm state; the row is drawn as "unknown". Use open, done, paused or unknown.`);
    }
    return 'unknown';
}

/** @param {StatusState} state */
export const stateWord = (state) => {
    const s = getStrings();
    return {
        ok: s.statusOk,
        loading: s.statusLoading,
        failed: s.statusFailed,
        empty: s.statusEmpty,
        warn: s.statusWarn,
        open: s.statusOpen,
        done: s.statusDone,
        paused: s.statusPaused,
        unknown: s.statusUnknown,
    }[state];
};

/** @param {string} className @param {string} [tag] */
export const el = (className, tag = 'span') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};
