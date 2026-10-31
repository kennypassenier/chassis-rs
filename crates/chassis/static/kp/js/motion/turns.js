// Arrivals in turn: the gap between successive entrances.

/** @typedef {{ el: HTMLElement, plays: Animation[], total: number, lag: number }} Arriving */
/** A delay the Web Animations API accepts: a finite number of ms, else 0 (an infinite exit has no end to count back from). @param {number} ms */
export const finiteMs = (ms) => (Number.isFinite(ms) ? ms : 0);
/**
 * Several elements that arrive at once come one by one, the highest first:
 * the row of leaves leaveInTurn() plays (the lowest first, each starting
 * when the one before is `--kp-leave-stagger` through its exit) turned
 * around as a whole, so frame t of the arrivals is frame (S - t) of that
 * row of leaves, S being when its last leave ends (Kenny, 2026-10-05:
 * "showing should also be the reverse of removing").
 * A theme that says `--kp-arrive-turn: siblings` (cyberpunk) takes turns only
 * among elements that share a parent: a layer arriving over a table does not
 * wait for an unrelated part that was drawn in the same task (the review
 * stage's mirrored controls held the busy layer back one stagger, 240 ms,
 * against a leave that went at once). Every other theme keeps one row.
 * @param {Arriving[]} items
 */
export function arriveInTurn(items) {
    if (items.length < 2) return;
    if (getComputedStyle(items[0].el).getPropertyValue('--kp-arrive-turn').trim() === 'siblings') {
        /** @type {Map<Element | null, Arriving[]>} */
        const rows = new Map();
        for (const item of items) rows.set(item.el.parentElement, [...(rows.get(item.el.parentElement) ?? []), item]);
        if (rows.size > 1) {
            for (const row of rows.values()) turnsOf(row);
            return;
        }
    }
    turnsOf(items);
}
/** @param {Arriving[]} items */
function turnsOf(items) {
    if (items.length < 2) return;
    items = items.filter((item) => Number.isFinite(item.total) && Number.isFinite(item.lag));
    if (items.length < 2) return;
    // Bottom first, as leaveInTurn() sorts them.
    items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1));
    let start = 0;
    const ends = items.map((item) => {
        const end = start + item.total;
        start += inTurnGap(item.lag, items.length);
        return end;
    });
    const last = Math.max(...ends);
    items.forEach((item, k) => {
        const later = last - ends[k];
        if (later <= 0) return;
        for (const play of item.plays) {
            const effect = play.effect;
            if (!effect) continue;
            effect.updateTiming({ delay: finiteMs((Number(effect.getTiming().delay) || 0) + later) });
        }
    });
}
/**
 * The most a row of three or more arrivals or leaves may spend getting
 * going, in ms, unless one gap alone is longer [Forest applied, 2026-10-09].
 * Measured in forest: twenty rows put into a `.kp-dialog` at once waited
 * 13 083 ms before the first showed, each a 690 ms gap after the one before.
 */
const IN_TURN_MS = 600;
/**
 * The gap after one of `count` elements arriving or leaving in turn: its own
 * `gap` when the whole row's gaps fit in IN_TURN_MS (or in that one gap, so
 * a pair is never hurried), else the row's share of that budget. Arrivals
 * and leaves both take it, so a row's arrival stays its leave turned around.
 * @param {number} gap ms @param {number} count
 */
export function inTurnGap(gap, count) {
    if (count < 3 || !(gap > 0)) return gap;
    const budget = Math.max(IN_TURN_MS, gap);
    return (count - 1) * gap <= budget ? gap : budget / (count - 1);
}
/**
 * When an animation with `timing` (and its active phase ending at `end`)
 * is `share` of the way through, as partway() polls it: its progress at or
 * past `share`, its first iteration over, or itself over.
 * @param {EffectTiming} timing @param {number} end @param {number} share
 * @returns {number} ms from its start
 */
export function reaches(timing, end, share) {
    if (!Number.isFinite(end)) return 0;
    if (typeof KeyframeEffect === 'undefined' || typeof Animation === 'undefined') return end * share;
    const effect = new KeyframeEffect(null, null, timing);
    const probe = new Animation(effect, null);
    for (let t = 0; t < end; t += 1) {
        probe.currentTime = t;
        const now = effect.getComputedTiming();
        if ((now.progress ?? 0) >= share || (now.currentIteration ?? 0) > 0) return t;
    }
    return end;
}
