// Turning a CSS entrance around: playEntranceBackwards() and stopReversing().
import { reduced } from './timing.js';

/** The attribute playEntranceBackwards() sets while it turns an entrance around. */
export const REVERSING_ATTRIBUTE = 'data-kp-reversing';
/**
 * Play the CSS entrance `el` wears now backwards, then settle: a tooltip
 * that slid in slides out, a tour card that faded in fades out, each in its
 * entrance's own time on its curve turned around, so frame t of the going
 * is frame (T - t) of the coming (Kenny, 2026-10-05: "find out where else
 * there is a discrepancy between opening/closing"). The entrance is
 * restarted reversed on the element and its pseudo-elements
 * (`[data-kp-reversing]`, css/components.css), whatever its fill, so one
 * that already played out is turned around too. With no entrance (reduced
 * motion, a theme without one) it settles at once. The caller hides the
 * element when it settles true and then calls stopReversing(), which also
 * stops it early when the element is wanted back meanwhile.
 * @param {HTMLElement} el
 * @returns {Promise<boolean>} true once played out, false when there was nothing to play or it was stopped
 */
export function playEntranceBackwards(el) {
    stopReversing(el);
    if (reduced() || !el.isConnected) return Promise.resolve(false);
    const named = (/** @type {string | null} */ pseudo) => {
        const name = getComputedStyle(el, pseudo).animationName;
        return Boolean(name) && name !== 'none';
    };
    if (![null, '::before', '::after'].some(named)) return Promise.resolve(false);
    el.setAttribute(REVERSING_ATTRIBUTE, 'reset');
    for (const pseudo of [null, '::before', '::after']) getComputedStyle(el, pseudo).animationName;
    el.setAttribute(REVERSING_ATTRIBUTE, 'play');
    for (const pseudo of [null, '::before', '::after']) getComputedStyle(el, pseudo).animationName;
    // A loop on it (a pulse) never plays out; only the entrance is waited for.
    const plays = el
        .getAnimations({ subtree: true })
        .filter(
            (a) =>
                typeof CSSAnimation !== 'undefined' &&
                a instanceof CSSAnimation &&
                /** @type {KeyframeEffect} */ (a.effect)?.target === el &&
                a.effect?.getComputedTiming().iterations !== Infinity,
        );
    if (plays.length === 0) {
        el.removeAttribute(REVERSING_ATTRIBUTE);
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        const own = /** @type {any} */ (el);
        own.__kpReversing = () => {
            // Wanted back halfway: the entrance goes on forwards from the
            // frame on screen instead of starting over or jumping.
            for (const a of plays) {
                if (a.playState !== 'running' || a.currentTime === null) continue;
                const end = Number(a.effect?.getComputedTiming().endTime) || 0;
                a.currentTime = Math.max(0, end - Number(a.currentTime));
            }
            resolve(false);
        };
        // The close ends when the animations on the element have ended, not when
        // the ones first seen have. A theme switch while it runs swaps the
        // register's animation: the one waited on is cancelled (its `finished`
        // may never settle, hence the `cancel` event) and another takes over, so
        // the element is looked at again each time. Waiting on the first alone
        // left a backdrop (a solid one in brutalism) over the page for good.
        const ended = (/** @type {Animation} */ a) =>
            new Promise((done) => {
                a.addEventListener('cancel', done, { once: true });
                a.addEventListener('remove', done, { once: true });
                a.finished.then(done, done);
            });
        const running = () =>
            el
                .getAnimations()
                .filter(
                    (a) =>
                        typeof CSSAnimation !== 'undefined' &&
                        a instanceof CSSAnimation &&
                        /** @type {KeyframeEffect} */ (a.effect)?.target === el &&
                        a.effect?.getComputedTiming().iterations !== Infinity &&
                        a.playState !== 'finished',
                );
        const settle = (/** @type {Animation[]} */ waited) => {
            if (own.__kpReversing === undefined) return;
            void Promise.all(waited.map(ended)).then(() => {
                if (own.__kpReversing === undefined) return;
                const next = running();
                if (next.length > 0) return settle(next);
                delete own.__kpReversing;
                resolve(true);
            });
        };
        settle(plays);
    });
}
/**
 * Stop a playEntranceBackwards() on `el` (it is wanted back), or tidy up
 * after one that played out: a running one settles false, and the entrance
 * is the element's own again.
 * @param {HTMLElement} el
 */
export function stopReversing(el) {
    const own = /** @type {any} */ (el);
    const stop = own.__kpReversing;
    delete own.__kpReversing;
    stop?.();
    el.removeAttribute(REVERSING_ATTRIBUTE);
}
