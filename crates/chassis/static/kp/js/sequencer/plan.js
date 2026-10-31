// Pure planning: cleans the items, groups them and settles overlaps.
import { num, round, sequencerSnap } from './units.js';
import { EPS } from './constants.js';
import { changedIds } from './links.js';
/** @typedef {import('./units.js').SequencerEdit} SequencerEdit */
/** @typedef {import('./units.js').SequencerItem} SequencerItem */
/** @typedef {import('./units.js').SequencerOptions} SequencerOptions */
/** @typedef {import('./units.js').SequencerOverlap} SequencerOverlap */
/** @typedef {import('./units.js').SequencerPlan} SequencerPlan */
/** @typedef {import('./units.js').SequencerRefusal} SequencerRefusal */

/**
 * Clean what a page gave: strings for ids, numbers for times, a `with` that names another item (a dangling one, one that names
 * itself and a cycle are dropped).
 * @param {readonly Partial<SequencerItem>[]} raw
 * @returns {SequencerItem[]}
 */
export function sequencerClean(raw) {
    /** @type {Map<string, SequencerItem>} */
    const by = new Map();
    for (const r of raw ?? []) {
        const id = String(r?.id ?? '');
        if (!id || by.has(id)) continue;
        /** @type {SequencerItem} */
        const item = {
            id,
            lane: String(r.lane ?? ''),
            label: String(r.label ?? id),
            start: Math.max(0, round(num(r.start))),
            duration: Math.max(0, round(num(r.duration))),
            with: r.with ? String(r.with) : null,
        };
        if (r.series) item.series = r.series;
        if (r.detail) item.detail = String(r.detail);
        if (r.locked) item.locked = true;
        by.set(id, item);
    }
    for (const item of by.values()) {
        if (item.with && (!by.has(item.with) || item.with === item.id)) item.with = null;
    }
    for (const item of by.values()) {
        const walked = new Set([item.id]);
        for (let cur = item; cur.with;) {
            if (walked.has(cur.with)) {
                cur.with = null;
                break;
            }
            walked.add(cur.with);
            cur = /** @type {SequencerItem} */ (by.get(cur.with));
        }
    }
    return [...by.values()];
}
/**
 * The ids linked to `id`, itself included: everything its `with` chains connect to it, in both directions.
 * @param {readonly SequencerItem[]} items @param {string} id
 * @returns {Set<string>}
 */
export function sequencerGroup(items, id) {
    const known = new Set(items.map((i) => i.id));
    /** @type {Map<string, string[]>} */
    const near = new Map();
    /** @param {string} a @param {string} b */
    const join = (a, b) => near.set(a, [...(near.get(a) ?? []), b]);
    for (const item of items)
        if (item.with && known.has(item.with)) {
            join(item.id, item.with);
            join(item.with, item.id);
        }
    const seen = new Set([id]);
    for (const queue = [id]; queue.length;) {
        for (const next of near.get(/** @type {string} */ (queue.pop())) ?? [])
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
    }
    return seen;
}
/** `id` and every item whose `with` chain leads to it. @param {readonly SequencerItem[]} items @param {string} id */
export function followersOf(items, id) {
    const out = new Set([id]);
    for (let grew = true; grew;) {
        grew = false;
        for (const item of items)
            if (item.with && out.has(item.with) && !out.has(item.id)) {
                out.add(item.id);
                grew = true;
            }
    }
    return out;
}
/** @param {SequencerItem} a @param {SequencerItem} b */
export const overlaps = (a, b) => a.start < b.start + b.duration - EPS && b.start < a.start + a.duration - EPS;
/**
 * Settle the items the edit moved against the rule: refuse an overlap, or push what is in the way later. Mutates `list`.
 * @param {SequencerItem[]} list @param {Iterable<string>} movedIds @param {SequencerOverlap} policy
 * @returns {{ ok: true, pushed: string[] } | { ok: false, reason: SequencerRefusal, blocker: string | null }}
 */
export function settle(list, movedIds, policy) {
    if (policy === 'allow') return { ok: true, pushed: [] };
    const first = new Set(movedIds);
    const movers = new Set(first);
    /** @type {Set<string>} */
    const pushed = new Set();
    for (let guard = list.length * list.length + 8; guard > 0; guard -= 1) {
        /** @type {{ m: SequencerItem, o: SequencerItem } | null} */
        let hit = null;
        for (const m of list) {
            if (!movers.has(m.id)) continue;
            const o = list.find((x) => !movers.has(x.id) && x.lane === m.lane && overlaps(m, x));
            if (o) {
                hit = { m, o };
                break;
            }
        }
        if (!hit) return { ok: true, pushed: [...pushed] };
        // A neighbour that starts before the mover cannot be pushed past it: the edit would reorder them.
        if (policy === 'refuse' || hit.o.start < hit.m.start - EPS) return { ok: false, reason: 'overlap', blocker: hit.o.id };
        const delta = round(hit.m.start + hit.m.duration - hit.o.start);
        for (const id of sequencerGroup(list, hit.o.id)) {
            if (first.has(id)) return { ok: false, reason: 'overlap', blocker: hit.o.id };
            const g = /** @type {SequencerItem} */ (list.find((x) => x.id === id));
            g.start = round(g.start + delta);
            movers.add(id);
            pushed.add(id);
        }
    }
    return { ok: false, reason: 'overlap', blocker: null };
}
/**
 * Plan an edit: where the items end up when `edit` is applied, or why it cannot be. Pure: `items` is never changed.
 * Move: the item and everything linked to it move by the same amount (the item alone changes lane). Resize end: the item's
 * duration. Resize start: the start of the item and of everything linked to it moves, their ends stay. Every value snaps to
 * `step` and to other items' edges within `reach`; nothing starts before 0; the overlap rule settles the rest.
 * @param {readonly SequencerItem[]} items
 * @param {SequencerEdit} edit
 * @param {SequencerOptions} [options]
 * @returns {SequencerPlan}
 */
export function sequencerPlan(items, edit, options = {}) {
    const o = {
        step: 1,
        overlap: /** @type {SequencerOverlap} */ ('refuse'),
        edges: true,
        reach: 0,
        laneMove: true,
        lanes: null,
        max: Infinity,
        strict: false,
        ...options,
    };
    const step = o.step > 0 ? o.step : 1;
    const list = items.map((i) => ({ ...i }));
    const item = list.find((i) => i.id === edit.id);
    /** @param {SequencerRefusal} reason @param {string | null} [blocker] @returns {SequencerPlan} */
    const fail = (reason, blocker = null) => ({ ok: false, items: /** @type {SequencerItem[]} */ (items), changed: [], pushed: [], reason, blocker });
    /** @returns {SequencerPlan} */
    const same = () => ({ ok: true, items: /** @type {SequencerItem[]} */ (items), changed: [], pushed: [], reason: null, blocker: null });
    if (!item) return fail('unknown');
    const group = sequencerGroup(list, item.id);
    const grouped = list.filter((i) => group.has(i.id));
    /** @param {SequencerItem} m */
    const least = (m) => Math.min(step, m.duration);
    /** @param {Set<string>} skip */
    const edgesOf = (skip) => (o.edges ? list.filter((i) => !skip.has(i.id)).flatMap((i) => [i.start, i.start + i.duration]) : []);
    /** @type {Set<string>} */
    let moved;
    if (edit.kind === 'move') {
        if (grouped.some((m) => m.locked)) return fail('locked');
        const cands = edgesOf(group);
        const start =
            edit.start === undefined
                ? item.start
                : sequencerSnap(
                      edit.start,
                      step,
                      cands.flatMap((c) => [c, c - item.duration]),
                      o.reach,
                  );
        let delta = round(start - item.start);
        let clamped = false;
        const lowest = Math.min(...grouped.map((m) => m.start));
        if (lowest + delta < -EPS) {
            delta = -lowest;
            clamped = true;
        }
        const highest = Math.max(...grouped.map((m) => m.start + m.duration));
        if (highest + delta > o.max + EPS) {
            delta = Math.min(delta, Math.max(0, round(o.max - highest)));
            clamped = true;
        }
        const lane = edit.lane ?? item.lane;
        if (lane !== item.lane && (!o.laneMove || (o.lanes && !o.lanes.includes(lane)))) return fail('lane');
        if (delta === 0 && lane === item.lane) return clamped && o.strict ? fail('edge') : same();
        for (const m of grouped) m.start = round(m.start + delta);
        item.lane = lane;
        moved = new Set(delta === 0 ? [item.id] : group);
    } else if (edit.kind === 'resize-end') {
        if (item.locked) return fail('locked');
        const cands = edgesOf(new Set([item.id]));
        let end = sequencerSnap(edit.end ?? item.start + item.duration, step, cands, o.reach);
        end = Math.min(end, Math.max(o.max, item.start + item.duration));
        const duration = Math.max(least(item), round(end - item.start));
        if (Math.abs(duration - item.duration) < EPS) return o.strict ? fail('edge') : same();
        item.duration = duration;
        moved = new Set([item.id]);
    } else {
        if (grouped.some((m) => m.locked)) return fail('locked');
        const cands = edgesOf(group);
        const start = sequencerSnap(edit.start ?? item.start, step, cands, o.reach);
        let delta = round(start - item.start);
        const lowest = Math.min(...grouped.map((m) => m.start));
        if (lowest + delta < -EPS) delta = -lowest;
        const room = Math.min(...grouped.map((m) => round(m.duration - least(m))));
        if (delta > room) delta = room;
        if (Math.abs(delta) < EPS) return o.strict ? fail('edge') : same();
        for (const m of grouped) {
            m.start = round(m.start + delta);
            m.duration = round(m.duration - delta);
        }
        moved = new Set(group);
    }
    const verdict = settle(list, moved, o.overlap);
    if (!verdict.ok) return fail(verdict.reason, verdict.blocker);
    return { ok: true, items: list, changed: changedIds(items, list), pushed: verdict.pushed, reason: null, blocker: null };
}
