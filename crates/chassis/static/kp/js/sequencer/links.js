// Pure link rules: linking, unlinking and moving an item by key.
import { EPS } from './constants.js';
import { followersOf, sequencerPlan, settle } from './plan.js';
import { round, stepFrom } from './units.js';
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerKeyAction} SequencerKeyAction */
/** @typedef {import('./units.js').SequencerOptions} SequencerOptions */
/** @typedef {import('./units.js').SequencerPlan} SequencerPlan */
/** @typedef {import('./units.js').SequencerRefusal} SequencerRefusal */

/** The ids whose lane, start, duration or partner differ between two lists. @param {readonly SequencerItem[]} before @param {readonly SequencerItem[]} after */
export function changedIds(before, after) {
    const was = new Map(before.map((i) => [i.id, i]));
    return after
        .filter((i) => {
            const b = was.get(i.id);
            return (
                !b ||
                b.lane !== i.lane ||
                Math.abs(b.start - i.start) > EPS ||
                Math.abs(b.duration - i.duration) > EPS ||
                (b.with ?? null) !== (i.with ?? null)
            );
        })
        .map((i) => i.id);
}
/**
 * Make `id` run alongside `partnerId`: it (and what runs alongside it) moves to the partner's start; the overlap rule settles the
 * rest. A partner whose chain leads back to the item is refused (`cycle`). Pure.
 * @param {readonly SequencerItem[]} items @param {string} id @param {string} partnerId @param {SequencerOptions} [options]
 * @returns {SequencerPlan}
 */
export function sequencerLink(items, id, partnerId, options = {}) {
    const list = items.map((i) => ({ ...i }));
    const by = new Map(list.map((i) => [i.id, i]));
    const item = by.get(id);
    const partner = by.get(partnerId);
    /** @param {SequencerRefusal} reason @param {string | null} [blocker] @returns {SequencerPlan} */
    const fail = (reason, blocker = null) => ({ ok: false, items: /** @type {SequencerItem[]} */ (items), changed: [], pushed: [], reason, blocker });
    if (!item || !partner || id === partnerId) return fail('unknown');
    for (let cur = partner, hops = 0; hops <= list.length; hops += 1) {
        if (cur.id === id) return fail('cycle');
        const next = cur.with ? by.get(cur.with) : undefined;
        if (!next) break;
        cur = next;
    }
    const riders = followersOf(list, id);
    if ([...riders].some((r) => by.get(r)?.locked)) return fail('locked');
    const delta = round(partner.start - item.start);
    if (Math.min(...[...riders].map((r) => /** @type {SequencerItem} */ (by.get(r)).start)) + delta < -EPS) return fail('edge');
    item.with = partnerId;
    if (delta !== 0)
        for (const r of riders) /** @type {SequencerItem} */ (by.get(r)).start = round(/** @type {SequencerItem} */ (by.get(r)).start + delta);
    const verdict = settle(list, delta === 0 ? [] : riders, options.overlap ?? 'refuse');
    if (!verdict.ok) return fail(verdict.reason, verdict.blocker);
    return { ok: true, items: list, changed: changedIds(items, list), pushed: verdict.pushed, reason: null, blocker: null };
}
/** Let `id` run on its own. Pure. @param {readonly SequencerItem[]} items @param {string} id @returns {SequencerPlan} */
export function sequencerUnlink(items, id) {
    const list = items.map((i) => (i.id === id ? { ...i, with: null } : { ...i }));
    return { ok: items.some((i) => i.id === id), items: list, changed: changedIds(items, list), pushed: [], reason: null, blocker: null };
}
/**
 * What a key does to the item that is picked up. Arrows move by the step (Ctrl: ten steps), Shift+arrows resize the end,
 * Ctrl+Shift+arrows the start, Alt+Up/Down change lane, Enter or Space drops, Escape puts back. `by` of a move or resize is in
 * the unit, positive toward the end of the axis; `rtl` swaps left and right.
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {{ step?: number, rtl?: boolean }} [options]
 * @returns {SequencerKeyAction | null}
 */
export function sequencerKey(e, { step = 1, rtl = false } = {}) {
    if (e.key === 'Enter' || e.key === ' ') return { kind: 'drop' };
    if (e.key === 'Escape') return { kind: 'cancel' };
    const strong = Boolean(e.ctrlKey || e.metaKey);
    if (e.altKey && !strong) return e.key === 'ArrowUp' ? { kind: 'lane', by: -1 } : e.key === 'ArrowDown' ? { kind: 'lane', by: 1 } : null;
    const dir =
        e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'PageDown' ? 1 : e.key === 'PageUp' ? -1 : 0;
    if (!dir) return null;
    const page = e.key === 'PageDown' || e.key === 'PageUp';
    if (e.shiftKey && strong) return { kind: 'resize-start', by: dir * step };
    if (e.shiftKey) return { kind: 'resize-end', by: dir * step };
    return { kind: 'move', by: dir * step * (strong || page ? 10 : 1) };
}
/**
 * The plan a key makes of the picked-up item (see sequencerKey): one step on the grid, no edge snap, refused (`edge`) when
 * nothing could change.
 * @param {readonly SequencerItem[]} items @param {string} id
 * @param {Exclude<SequencerKeyAction, { kind: 'drop' } | { kind: 'cancel' }>} action
 * @param {SequencerOptions} [options]
 * @returns {SequencerPlan}
 */
export function sequencerApplyKey(items, id, action, options = {}) {
    const item = items.find((i) => i.id === id);
    const step = options.step && options.step > 0 ? options.step : 1;
    const opt = { ...options, edges: false, strict: true };
    if (!item) return sequencerPlan(items, { id, kind: 'move' }, opt);
    if (action.kind === 'lane') {
        const order = options.lanes ?? [];
        const next = order[order.indexOf(item.lane) + action.by];
        if (order.indexOf(item.lane) < 0 || next === undefined)
            return { ok: false, items: /** @type {SequencerItem[]} */ (items), changed: [], pushed: [], reason: 'edge', blocker: null };
        return sequencerPlan(items, { id, kind: 'move', lane: next }, opt);
    }
    if (action.kind === 'move') return sequencerPlan(items, { id, kind: 'move', start: stepFrom(item.start, action.by, step) }, opt);
    if (action.kind === 'resize-end')
        return sequencerPlan(items, { id, kind: 'resize-end', end: stepFrom(item.start + item.duration, action.by, step) }, opt);
    return sequencerPlan(items, { id, kind: 'resize-start', start: stepFrom(item.start, action.by, step) }, opt);
}
