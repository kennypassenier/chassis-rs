// Coupled wheels [parts-1102; Kitchen 15; round 2 parts-1102 r2l]: `data-kp-wheel-follows="<id>"` on a wheel makes it follow
// the wheel with that id (the leader). The app decides how, with `data-kp-wheel-follows-start`:
//
//   press (the default)  The follower is locked (its Spin disabled, the reason on its status line) until the leader has stopped
//                        and fired `kp-wheel-result`; then it waits for its own press. Kenny, 2026-11-02: Kitchen's side dish
//                        must not spin before the main course is known, so it cannot give the outcome away.
//   auto                 Locked the same way; it starts by itself once the leader's result is in, never before.
//   together             Not locked: it starts with the leader and turns for exactly the leader's time, so both settle
//                        together (the behaviour of round 1, for two picks that do not depend on each other).
//
// When the leader settles, the follower gets the leader's choice in `data-kp-wheel-leader-won` (the item's id) and in the event
// `kp-wheel-leader-result` { leader, item, index, source, waitUntil }, fired on the follower before an auto start, so the app can
// give the follower its choices for that outcome first (`setWheelItems`); `waitUntil(promise)` holds an auto start until the
// promise settles (a fetch of the choices). A new spin of the leader, or new choices for it, locks the follower again and
// clears its outcome, which belonged to the leader's last one. `data-kp-wheel-follows-reason` is the locked line (else the
// dictionary's `wheelLocked`). Every attribute is live. Without the attribute the app drives both wheels itself: listen for
// the leader's `kp-wheel-result` and call `spinWheel(follower)`.

import { paint } from './draw.js';
import { spinWheel } from './spin.js';
import { WHEEL_FOLLOWS_REASON, WHEEL_LOCKED, WHEEL_RESULT_EVENT, WHEEL_SPIN_EVENT, part, stateOf } from './state.js';

export { WHEEL_FOLLOWS_REASON, WHEEL_LOCKED };

/** The attribute that names the leader. */
export const WHEEL_FOLLOWS = 'data-kp-wheel-follows';
/** How the follower starts: `press` (default), `auto` or `together`. */
export const WHEEL_FOLLOWS_START = 'data-kp-wheel-follows-start';
/** The id of the leader's choice, written on the follower once the leader has settled. */
export const WHEEL_LEADER_WON = 'data-kp-wheel-leader-won';
/** Fired on the follower when its leader has settled. */
export const WHEEL_LEADER_RESULT_EVENT = 'kp-wheel-leader-result';
/** The start modes, the default first. */
export const WHEEL_FOLLOW_STARTS = /** @type {const} */ (['press', 'auto', 'together']);

/** @typedef {(typeof WHEEL_FOLLOW_STARTS)[number]} WheelFollowStart */

/** Values already warned about, so a console gets one line per mistake. @type {Set<string>} */
const warned = new Set();
/** @param {string} key @param {string} text */
const warnOnce = (key, text) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`kp-wheel: ${text}`);
};

/** @param {HTMLElement} follower @returns {WheelFollowStart} */
export function followStart(follower) {
    const raw = follower.getAttribute(WHEEL_FOLLOWS_START)?.trim() ?? '';
    const known = WHEEL_FOLLOW_STARTS.find((mode) => mode === raw);
    if (known) return known;
    if (raw) warnOnce(`start:${raw}`, `${WHEEL_FOLLOWS_START}="${raw}" is not one of ${WHEEL_FOLLOW_STARTS.join(', ')}; "press" is used.`);
    return 'press';
}

/** The leader the follower names, or null (none named, or no wheel with that id). @param {HTMLElement} follower */
function leaderOf(follower) {
    const id = follower.getAttribute(WHEEL_FOLLOWS)?.trim();
    if (!id) return null;
    const leader = follower.ownerDocument.getElementById(id);
    if (leader instanceof HTMLElement && leader !== follower && leader.matches('[data-kp-wheel]')) return leader;
    warnOnce(`leader:${id}`, `${WHEEL_FOLLOWS}="${id}" names no other wheel on this page; the follower stays locked until it does.`);
    return null;
}

/** Whether the follower must wait: it names a leader, does not start with it, and the leader has no outcome standing. @param {HTMLElement} follower */
function mustWait(follower) {
    if (!follower.getAttribute(WHEEL_FOLLOWS)?.trim() || followStart(follower) === 'together') return false;
    const leader = leaderOf(follower);
    return !leader || stateOf(leader).spinning || !leader.hasAttribute('data-kp-wheel-won');
}

/** Clear the follower's outcome: it answered the leader's last choice. @param {HTMLElement} follower */
function clearOutcome(follower) {
    if (stateOf(follower).spinning) {
        follower.addEventListener(WHEEL_RESULT_EVENT, () => follower.hasAttribute(WHEEL_LOCKED) && clearOutcome(follower), { once: true });
        return;
    }
    follower.removeAttribute('data-kp-wheel-won');
    follower.removeAttribute(WHEEL_LEADER_WON);
}

/** Ids of the outcome lines that describe a locked control. */
let outcomeIds = 0;

/**
 * A locked follower's controls are described by its reason, so a screen reader hears why Spin does nothing [parts-1102 r2l].
 * @param {HTMLElement} root @param {boolean} locked @param {HTMLElement[]} controls
 */
function describeLock(root, locked, controls) {
    const outcome = part(root, 'outcome');
    if (!outcome) return;
    if (locked && !outcome.id) outcome.id = `kp-wheel-outcome-${++outcomeIds}`;
    for (const control of controls) {
        if (!control) continue;
        if (locked) control.setAttribute('aria-describedby', outcome.id);
        else if (outcome.id && control.getAttribute('aria-describedby') === outcome.id) control.removeAttribute('aria-describedby');
    }
}

/** Lock or unlock the follower from its leader's state, and draw it. @param {HTMLElement} follower */
export function syncFollower(follower) {
    const lock = mustWait(follower);
    const was = follower.hasAttribute(WHEEL_LOCKED);
    if (lock && !was) clearOutcome(follower);
    follower.toggleAttribute(WHEEL_LOCKED, lock);
    // The leader's choice is only handed to a follower that waits for it.
    if (!follower.getAttribute(WHEEL_FOLLOWS)?.trim() || followStart(follower) === 'together') follower.removeAttribute(WHEEL_LEADER_WON);
    paint(follower);
    describeLock(follower, lock, [part(follower, 'spin'), part(follower, 'stage')]);
}

/**
 * The leader settled: unlock, hand the app its choice, and start an auto follower once the app's waits are over.
 * @param {HTMLElement} follower @param {HTMLElement} leader @param {{ item: { id: string }, index: number, source: string }} detail
 */
async function onLeaderResult(follower, leader, detail) {
    if (followStart(follower) === 'together') return;
    follower.setAttribute(WHEEL_LEADER_WON, detail.item.id);
    syncFollower(follower);
    /** @type {Promise<unknown>[]} */
    const waits = [];
    const waitUntil = (/** @type {Promise<unknown>} */ promise) => void waits.push(Promise.resolve(promise));
    follower.dispatchEvent(new CustomEvent(WHEEL_LEADER_RESULT_EVENT, { bubbles: true, detail: { leader, ...detail, waitUntil } }));
    if (followStart(follower) !== 'auto') return;
    try {
        await Promise.all(waits);
    } catch (error) {
        console.error('kp-wheel: the follower did not start by itself, a waitUntil() promise of kp-wheel-leader-result failed; it waits for a press.', error);
        return;
    }
    // The leader may have spun again meanwhile: spinWheel() refuses a locked wheel, so a stale start never happens.
    if (follower.isConnected && follower.getAttribute(WHEEL_LEADER_WON) === detail.item.id) void spinWheel(follower);
}

/**
 * Follow the leader the follower names: the leader's spin, result and new choices, and the follower's own attributes.
 * @param {HTMLElement} follower
 * @returns {() => void} stop following
 */
export function followLeader(follower) {
    const doc = follower.ownerDocument;
    /** @param {EventTarget | null} target */
    const isLeader = (target) => target instanceof HTMLElement && target !== follower && target.id !== '' && target.id === follower.getAttribute(WHEEL_FOLLOWS)?.trim();
    /** @param {Event} event */
    const onSpin = (event) => {
        if (!isLeader(event.target) || !follower.isConnected) return;
        if (followStart(follower) !== 'together') return syncFollower(follower);
        const { duration } = /** @type {CustomEvent<{ duration?: number }>} */ (event).detail ?? {};
        void spinWheel(follower, { duration });
    };
    /** @param {Event} event */
    const onResult = (event) => {
        if (!isLeader(event.target) || !follower.isConnected) return;
        void onLeaderResult(follower, /** @type {HTMLElement} */ (event.target), /** @type {CustomEvent} */ (event).detail);
    };
    doc.addEventListener(WHEEL_SPIN_EVENT, onSpin);
    doc.addEventListener(WHEEL_RESULT_EVENT, onResult);
    // New choices for the leader clear its outcome (setWheelItems); the follower's own attributes are live.
    const watch = new MutationObserver((records) => {
        if (records.some((r) => r.target === follower || isLeader(r.target))) syncFollower(follower);
    });
    watch.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-kp-wheel-won', WHEEL_FOLLOWS, WHEEL_FOLLOWS_START, WHEEL_FOLLOWS_REASON] });
    syncFollower(follower);
    return () => {
        doc.removeEventListener(WHEEL_SPIN_EVENT, onSpin);
        doc.removeEventListener(WHEEL_RESULT_EVENT, onResult);
        watch.disconnect();
        follower.removeAttribute(WHEEL_LOCKED);
        describeLock(follower, false, [part(follower, 'spin'), part(follower, 'stage')]);
    };
}
