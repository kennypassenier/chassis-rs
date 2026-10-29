// An editable multi-track sequencer: bars in lanes that are moved, resized and linked like clips in a video editor
// [timeline-1029; Kitchen's recipe steps: Kenny, 2026-10-29 "Echt onderdeel"].
//
// Why its own module and not an `editable` mode of the run timeline (js/gantt.js): the gantt lives on the clock (epoch ms, a
// window that follows now, runs that grow, a brush that selects a range) and an editor lives on a plan (relative values in
// one unit, a window that fits the plan, a bar that follows the pointer). Sharing the code would have meant a switch in every
// function of a 2 100-line module. What is shared is the look: the host is `.kp-gantt`, its frame, axis, lanes, rules, line for
// now, state plate, busy card and bars are the gantt's own classes (`.kp-gantt__run` with `data-kp-state="ok"` and a series), so
// every register that dresses the gantt dresses this too, and a bar here is the same bar there.
//
//   <section class="kp-gantt kp-sequencer" data-kp-sequencer data-kp-sequencer-unit="minute" data-kp-sequencer-snap="1"
//            aria-label="Spaghetti bolognese"></section>
//
//   setSequencerItems(el, [
//       { id: 'boil', lane: 'pasta', label: 'Boil the water', start: 20, duration: 8 },
//       { id: 'cook', lane: 'pasta', label: 'Cook the spaghetti', start: 28, duration: 10 },
//       { id: 'brown', lane: 'sauce', label: 'Brown the mince', start: 20, duration: 11, with: 'boil' },
//   ], [{ id: 'sauce', label: 'Sauce' }, { id: 'pasta', label: 'Pasta' }]);
//   el.addEventListener('kp-sequencer-change', (e) => save(e.detail.items));   // [{ id, lane, start, duration, with }]
//
// Values (`start`, `duration`, `with`) are in the sequencer's unit: minutes by default, `data-kp-sequencer-unit` takes second,
// minute, hour, day or week (and their short forms). `with` is the id of another item: "starts together with it".
//
// Options (attributes, read again when they change; each has a default):
//   unit      second | minute (default) | hour | day | week
//   snap      the step, in the unit, everything snaps to (1)
//   snap-items  `off` leaves out the snap to other items' edges (on; within 8 px)
//   overlap   `refuse` (default: an edit that would overlap in a lane does not happen), `push` (the items in the way, with
//             what runs alongside them, move later) or `allow` (items overlap and take rows of their lane)
//   lanes     `fixed` keeps every item in its lane (default: items change lane)
//   editable  `off` shows the plan without editing
//   zoom      1 = the plot fits its box; 0.5 to 16. Under --kp-sequencer-min-width (26rem) the plot keeps that width and the
//             frame scrolls sideways, the lane names held at the start edge
//   span      the shortest window, in the unit (0: fit the plan with a little room)
//   toolbar, hint   `off` leaves out the zoom row (and the total in it) or the hint line
//
// Pointer: drag a bar to move it (along the axis and between lanes), drag either edge to resize it; Escape during a drag puts it
// back. A mouse wheel with Ctrl or a two-finger pinch zooms; a finger on empty ground pans. The window never changes under a
// drag (it grows when the edit is dropped), and nothing the pointer is on is rebuilt: bars are kept by id and move by custom
// properties only.
// Keyboard: arrows move between items; Enter or Space picks one up; then ← → move by the snap step (Ctrl: ten steps),
// Shift+← → resize the end, Ctrl+Shift+← → the start, Alt+↑ ↓ change lane, Enter drops it, Escape puts it back. L chooses the
// item the focused one runs alongside, U lets it run on its own. Every step is announced in a polite status region.
// Linked: moving any member of a group moves the whole group by the same amount; a join is drawn from an item to its partner.
//
// Events (bubbling, on the sequencer): kp-sequencer-change { items, changed, source: 'pointer' | 'keyboard' | 'link', total },
// kp-sequencer-select { id }, kp-sequencer-refuse { id, reason, blocker }, kp-sequencer-retry (the failed plate's Retry).
// The words are the dictionary's (`sequencer…` in js/strings.js). Nothing runs on import; attachSequencers(root) returns a detach.

import { openBusyCard } from './busy-card.js';
import { hostStatePlate } from './state-plate.js';
import { watchOptions } from './live-options.js';
import { resolveStrings } from './strings.js';

/** The editable sequencers. */
export const SEQUENCER = '[data-kp-sequencer]';
/** Fired after an edit is dropped: `detail` `{ items, changed, source, total }`. */
export const SEQUENCER_CHANGE_EVENT = 'kp-sequencer-change';
/** Fired when the selected item changes: `detail` `{ id }` (null when none). */
export const SEQUENCER_SELECT_EVENT = 'kp-sequencer-select';
/** Fired when an edit was refused: `detail` `{ id, reason, blocker }`. */
export const SEQUENCER_REFUSE_EVENT = 'kp-sequencer-refuse';
/** Fired when the Retry of the failed plate is pressed. */
export const SEQUENCER_RETRY_EVENT = 'kp-sequencer-retry';
/** What one unit is, in seconds. */
export const SEQUENCER_UNITS = Object.freeze({ second: 1, minute: 60, hour: 3600, day: 86_400, week: 604_800 });
/** The overlap rules. */
export const SEQUENCER_OVERLAPS = Object.freeze(['refuse', 'push', 'allow']);
/** The zoom limits. */
export const SEQUENCER_ZOOM_MIN = 0.5;
export const SEQUENCER_ZOOM_MAX = 16;

/** The steps an axis chooses from, in seconds. */
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400, 172_800, 604_800, 1_209_600, 2_419_200, 4_838_400, 9_676_800, 31_536_000];
const EPS = 1e-9;
/** How far, in px, an edge pulls a dragged edge to it. */
const REACH_PX = 8;
/** How far, in px, a pointer moves before a press is a drag. */
const DRAG_PX = 4;
/** The room, as a share of the plan, the window keeps after the last item. */
const HEADROOM = 0.2;

/**
 * @typedef {'second' | 'minute' | 'hour' | 'day' | 'week'} SequencerUnit
 * @typedef {'refuse' | 'push' | 'allow'} SequencerOverlap
 * @typedef {object} SequencerItem
 * @property {string} id what the page calls the item
 * @property {string} lane the lane's id
 * @property {string} label what it is, one line
 * @property {number} start where it begins, in the unit
 * @property {number} duration how long it takes, in the unit
 * @property {string | null} [with] the id of the item it starts together with ("runs alongside")
 * @property {1 | 2 | 3 | 4 | 5} [series] its colour (default: the lane's)
 * @property {string} [detail] more words about the item, kept for the page (not drawn)
 * @property {boolean} [locked] cannot be moved or resized
 * @typedef {{ id: string, label: string }} SequencerLane
 * @typedef {{ id: string, lane: string, start: number, duration: number, with: string | null }} SequencerChangeItem
 * @typedef {'unknown' | 'locked' | 'overlap' | 'edge' | 'lane' | 'cycle'} SequencerRefusal
 * @typedef {{ ok: boolean, items: SequencerItem[], changed: string[], pushed: string[], reason: SequencerRefusal | null, blocker: string | null }} SequencerPlan
 * @typedef {{ id: string, kind: 'move' | 'resize-start' | 'resize-end', start?: number, end?: number, lane?: string }} SequencerEdit
 * @typedef {object} SequencerOptions
 * @property {number} [step] the snap step (default 1)
 * @property {SequencerOverlap} [overlap] default `refuse`
 * @property {boolean} [edges] snap to the edges of other items (default true)
 * @property {number} [reach] how far an edge pulls, in the unit (default 0)
 * @property {boolean} [laneMove] items may change lane (default true)
 * @property {readonly string[] | null} [lanes] the lane ids in order, to refuse an unknown lane and to step through them
 * @property {number} [max] the window's end: an edit does not push the end of what it moves past it (default none)
 * @property {boolean} [strict] a move that changes nothing because it was clamped is refused (`edge`), for the keyboard
 * @typedef {{ kind: 'move' | 'resize-start' | 'resize-end', by: number } | { kind: 'lane', by: number } | { kind: 'drop' } | { kind: 'cancel' }} SequencerKeyAction
 * @typedef {'loading' | 'ready' | 'empty' | 'error'} SequencerState
 * @typedef {import('./strings.js').Strings} Strings
 * @typedef {object} SequencerAttachOptions
 * @property {Partial<Strings>} [strings] any of the dictionary's words, for these sequencers only
 */

/** @param {number} n */
const round = (n) => Math.round(n * 1e6) / 1e6;

/** @param {unknown} v @param {number} fallback */
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : fallback);

/**
 * The unit a word names: `minute`, `min`, `m`, `hours`, `d` … null when it names none.
 * @param {unknown} word
 * @returns {{ name: SequencerUnit, seconds: number } | null}
 */
export function sequencerUnit(word) {
    /** @type {Record<string, SequencerUnit>} */
    const names = {
        s: 'second', sec: 'second', secs: 'second', second: 'second', seconds: 'second',
        m: 'minute', min: 'minute', mins: 'minute', minute: 'minute', minutes: 'minute',
        h: 'hour', hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour',
        d: 'day', day: 'day', days: 'day',
        w: 'week', wk: 'week', wks: 'week', week: 'week', weeks: 'week',
    };
    const name = names[String(word ?? '').trim().toLowerCase()];
    return name ? { name, seconds: SEQUENCER_UNITS[name] } : null;
}

/**
 * Snap a value to the grid of `step`, or to the nearest of `candidates` (the edges of other items) when one is within `reach`.
 * @param {number} value
 * @param {number} step
 * @param {readonly number[]} [candidates]
 * @param {number} [reach]
 * @returns {number}
 */
export function sequencerSnap(value, step, candidates = [], reach = 0) {
    /** @type {{ c: number, d: number } | null} */
    let best = null;
    for (const c of candidates) {
        const d = Math.abs(c - value);
        if (d <= reach + EPS && (best === null || d < best.d)) best = { c, d };
    }
    if (best) return round(best.c);
    return step > 0 ? round(Math.round(value / step + EPS) * step) : round(value);
}

/**
 * The next grid line from a value: `by` steps (negative: back), always on the grid, so a value off the grid lands on it first.
 * @param {number} value @param {number} by @param {number} step
 */
function stepFrom(value, by, step) {
    const k = Math.round(by / step);
    return round((k > 0 ? Math.floor(value / step + EPS) + k : Math.ceil(value / step - EPS) + k) * step);
}

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
        for (let cur = item; cur.with; ) {
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
    for (const queue = [id]; queue.length; ) {
        for (const next of near.get(/** @type {string} */ (queue.pop())) ?? [])
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
    }
    return seen;
}

/** `id` and every item whose `with` chain leads to it. @param {readonly SequencerItem[]} items @param {string} id */
function followersOf(items, id) {
    const out = new Set([id]);
    for (let grew = true; grew; ) {
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
const overlaps = (a, b) => a.start < b.start + b.duration - EPS && b.start < a.start + a.duration - EPS;

/**
 * Settle the items the edit moved against the rule: refuse an overlap, or push what is in the way later. Mutates `list`.
 * @param {SequencerItem[]} list @param {Iterable<string>} movedIds @param {SequencerOverlap} policy
 * @returns {{ ok: true, pushed: string[] } | { ok: false, reason: SequencerRefusal, blocker: string | null }}
 */
function settle(list, movedIds, policy) {
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
    const o = { step: 1, overlap: /** @type {SequencerOverlap} */ ('refuse'), edges: true, reach: 0, laneMove: true, lanes: null, max: Infinity, strict: false, ...options };
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
            edit.start === undefined ? item.start : sequencerSnap(edit.start, step, cands.flatMap((c) => [c, c - item.duration]), o.reach);
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

/** The ids whose lane, start, duration or partner differ between two lists. @param {readonly SequencerItem[]} before @param {readonly SequencerItem[]} after */
function changedIds(before, after) {
    const was = new Map(before.map((i) => [i.id, i]));
    return after
        .filter((i) => {
            const b = was.get(i.id);
            return !b || b.lane !== i.lane || Math.abs(b.start - i.start) > EPS || Math.abs(b.duration - i.duration) > EPS || (b.with ?? null) !== (i.with ?? null);
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
    if (delta !== 0) for (const r of riders) /** @type {SequencerItem} */ (by.get(r)).start = round(/** @type {SequencerItem} */ (by.get(r)).start + delta);
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
    const dir = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'PageDown' ? 1 : e.key === 'PageUp' ? -1 : 0;
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
        if (order.indexOf(item.lane) < 0 || next === undefined) return { ok: false, items: /** @type {SequencerItem[]} */ (items), changed: [], pushed: [], reason: 'edge', blocker: null };
        return sequencerPlan(items, { id, kind: 'move', lane: next }, opt);
    }
    if (action.kind === 'move') return sequencerPlan(items, { id, kind: 'move', start: stepFrom(item.start, action.by, step) }, opt);
    if (action.kind === 'resize-end') return sequencerPlan(items, { id, kind: 'resize-end', end: stepFrom(item.start + item.duration, action.by, step) }, opt);
    return sequencerPlan(items, { id, kind: 'resize-start', start: stepFrom(item.start, action.by, step) }, opt);
}

/**
 * A row of its lane for every item: the first where nothing in the way. Items that do not overlap all take row 0.
 * @param {readonly SequencerItem[]} items @param {readonly string[]} laneIds
 * @returns {{ rows: Map<string, number>, counts: Map<string, number> }}
 */
export function sequencerRows(items, laneIds) {
    /** @type {Map<string, number>} */
    const rows = new Map();
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const lane of laneIds) {
        const inLane = items.filter((i) => i.lane === lane).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
        /** @type {number[]} */
        const ends = [];
        for (const item of inLane) {
            let row = ends.findIndex((end) => end <= item.start + EPS);
            if (row < 0) {
                row = ends.length;
                ends.push(0);
            }
            ends[row] = item.start + item.duration;
            rows.set(item.id, row);
        }
        counts.set(lane, Math.max(1, ends.length));
    }
    return { rows, counts };
}

/** The end of the last item, 0 when there is none. @param {readonly SequencerItem[]} items */
export function sequencerTotalOf(items) {
    return round(items.reduce((end, i) => Math.max(end, i.start + i.duration), 0));
}

/**
 * The window that holds a plan: the longest of `minSpan` and the plan with some room, rounded up to a whole step.
 * @param {number} total @param {number} minSpan @param {number} step
 */
export function sequencerWindow(total, minSpan, step) {
    const s = step > 0 ? step : 1;
    const want = Math.max(minSpan, total + Math.max(total * HEADROOM, s * 2));
    return Math.max(s, round(Math.ceil(want / s - EPS) * s));
}

/**
 * The axis ticks of a window `span` long (in the unit) drawn `room` px wide: the step (in the unit) and the values.
 * @param {number} span @param {number} room @param {number} unitSeconds @param {number} [gap] the px a label needs
 * @returns {{ step: number, values: number[] }}
 */
export function sequencerTicks(span, room, unitSeconds, gap = 72) {
    const most = Math.max(2, Math.floor(room / gap));
    const seconds = TICK_STEPS.find((s) => (span * unitSeconds) / s <= most) ?? /** @type {number} */ (TICK_STEPS[TICK_STEPS.length - 1]);
    const step = seconds / unitSeconds;
    /** @type {number[]} */
    const values = [];
    for (let k = 0; k * step <= span + EPS && values.length < 400; k += 1) values.push(round(k * step));
    return { step, values };
}

/** A zoom kept inside the limits, to the hundredth. @param {number} zoom */
export function sequencerClampZoom(zoom) {
    return Math.round(Math.min(SEQUENCER_ZOOM_MAX, Math.max(SEQUENCER_ZOOM_MIN, Number.isFinite(zoom) ? zoom : 1)) * 100) / 100;
}

/**
 * @typedef {object} SequencerModel
 * @property {HTMLElement} el
 * @property {Strings} strings
 * @property {string} id
 * @property {HTMLElement} bar the toolbar
 * @property {HTMLElement} zoomGroup
 * @property {HTMLButtonElement[]} zoomButtons out, fit, in
 * @property {HTMLElement} zoomValue
 * @property {HTMLElement} total
 * @property {HTMLElement} frame
 * @property {HTMLElement} scroll
 * @property {HTMLElement} body
 * @property {HTMLElement} axis
 * @property {HTMLElement} lines
 * @property {HTMLElement} layer the bars
 * @property {HTMLElement} plot the line for now, the end of the plan, the guide and the readout
 * @property {HTMLElement} nowLine
 * @property {HTMLElement} endLine
 * @property {HTMLElement} guide
 * @property {HTMLElement} readout
 * @property {HTMLElement} plate
 * @property {HTMLElement} selection
 * @property {HTMLElement} selectionText
 * @property {HTMLButtonElement} linkButton
 * @property {HTMLButtonElement} unlinkButton
 * @property {HTMLButtonElement} cancelButton
 * @property {HTMLElement} hint
 * @property {HTMLElement} help
 * @property {HTMLElement} announcer
 * @property {HTMLElement} measure a hidden label that wraps, to ask whether a name fits its bar
 * @property {HTMLElement} ruler a hidden label on one line, to ask how wide a name is
 * @property {HTMLElement} probe a hidden box one row tall and one pad wide, to read both in px
 * @property {number} rowPx
 * @property {number} padPx
 * @property {{ name: SequencerUnit, seconds: number }} unit
 * @property {number} step
 * @property {SequencerOverlap} overlap
 * @property {boolean} edges
 * @property {boolean} laneMove
 * @property {boolean} editable
 * @property {number} minSpan
 * @property {SequencerItem[]} items committed
 * @property {SequencerItem[]} view what is drawn (items, or the draft of an edit in progress)
 * @property {SequencerLane[]} lanes
 * @property {{ rows: Map<string, number>, counts: Map<string, number> }} rows
 * @property {number} span
 * @property {number} zoom
 * @property {number | null} nowAt
 * @property {SequencerState} state
 * @property {string} stateWords
 * @property {string} stateText
 * @property {Node | string | null} stateArt
 * @property {string} plateKey
 * @property {string} laneKey
 * @property {string} tickKey
 * @property {HTMLElement[]} laneEls
 * @property {{ id: string, top: number }[]} laneTops
 * @property {Map<string, HTMLButtonElement>} bars
 * @property {Map<string, HTMLElement>} outsides
 * @property {Map<string, HTMLElement>} joins
 * @property {string | null} selected
 * @property {string | null} focusId the item that holds the tab stop
 * @property {string | null} linking
 * @property {{ id: string, before: SequencerItem[] } | null} kb an item picked up with the keyboard
 * @property {{ id: string, edge: 'start' | 'end' | 'body', x: number, y: number, pointer: number, grab: number, bar: HTMLButtonElement, moved: boolean, before: SequencerItem[], refused: boolean, lanes: { id: string, top: number, bottom: number }[], last: SequencerPlan | null, edgeX: number } | null} press
 * @property {{ items: Partial<SequencerItem>[], lanes: SequencerLane[] | undefined } | null} pending
 * @property {import('./busy-card.js').BusyCard | null} busy
 * @property {Promise<void> | null} leaving
 * @property {Map<number, { x: number }>} touches
 * @property {{ dist: number, zoom: number } | null} pinch
 * @property {number} scrollTimer
 * @property {number} frameTimer
 * @property {boolean} drawn
 * @property {ResizeObserver | null} observer
 */

/** @type {WeakMap<Element, SequencerModel>} */
const sequencers = new WeakMap();
let idSeq = 0;

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc @param {K} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
const make = (doc, tag, className, text) => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
};

/** @param {number} n */
const px = (n) => `${Math.round(n * 100) / 100}px`;

/** @param {SequencerModel} c @param {number} value */
const words = (c, value) => c.strings.sequencerSpan(value, c.unit.name);

/** The item as a screen reader and the selection line say it. @param {SequencerModel} c @param {SequencerItem} item */
function summary(c, item) {
    const lane = c.lanes.find((l) => l.id === item.lane)?.label ?? item.lane;
    const partner = item.with ? (c.view.find((i) => i.id === item.with)?.label ?? null) : null;
    return c.strings.sequencerItem(item.label, lane, words(c, item.start), words(c, item.duration), partner);
}

/** @param {SequencerModel} c @param {string} id */
const labelOf = (c, id) => c.view.find((i) => i.id === id)?.label ?? id;

/** Say something politely, even the same sentence twice. @param {SequencerModel} c @param {string} text */
function announce(c, text) {
    c.announcer.textContent = '';
    c.announcer.textContent = text;
}

/** @param {SequencerModel} c @param {string} name @param {unknown} detail */
const emit = (c, name, detail) => c.el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

/** @param {SequencerModel} c @param {SequencerItem[]} list @returns {SequencerChangeItem[]} */
const outItems = (c, list) => list.map((i) => ({ id: i.id, lane: i.lane, start: i.start, duration: i.duration, with: i.with ?? null }));

/** The options as the attributes say them. @param {SequencerModel} c */
function readOptions(c) {
    const d = c.el.dataset;
    c.unit = sequencerUnit(d.kpSequencerUnit ?? 'minute') ?? { name: 'minute', seconds: 60 };
    const step = Number(d.kpSequencerSnap);
    c.step = Number.isFinite(step) && step > 0 ? step : 1;
    c.overlap = d.kpSequencerOverlap === 'push' || d.kpSequencerOverlap === 'allow' ? d.kpSequencerOverlap : 'refuse';
    c.edges = d.kpSequencerSnapItems !== 'off';
    c.laneMove = d.kpSequencerLanes !== 'fixed';
    c.editable = d.kpSequencerEditable !== 'off';
    const span = Number(d.kpSequencerSpan);
    c.minSpan = Number.isFinite(span) && span > 0 ? span : 0;
    c.bar.hidden = d.kpSequencerToolbar === 'off';
    c.hint.hidden = d.kpSequencerHint === 'off';
    c.hint.textContent = c.editable ? c.strings.sequencerHint : c.strings.sequencerHintReadonly;
    c.selection.hidden = !c.editable && d.kpSequencerSelection === 'off';
}

/** The options a plan takes. @param {SequencerModel} c @param {{ max?: number, reach?: number, edges?: boolean }} [more] @returns {SequencerOptions} */
const planOptions = (c, more = {}) => ({
    step: c.step,
    overlap: c.overlap,
    edges: c.edges,
    laneMove: c.laneMove,
    lanes: c.lanes.map((l) => l.id),
    ...more,
});

/** Build the parts once. @param {HTMLElement} el @param {Strings} strings @returns {SequencerModel} */
function build(el, strings) {
    const doc = el.ownerDocument;
    const id = `kp-sequencer-${(idSeq += 1)}`;
    const bar = make(doc, 'div', 'kp-gantt__bar kp-sequencer__bar');
    const zoomGroup = make(doc, 'div', 'kp-sequencer__zoom');
    zoomGroup.setAttribute('role', 'group');
    zoomGroup.setAttribute('aria-label', strings.sequencerZoomLabel);
    /** @param {string} key @param {string} text */
    const zoomButton = (key, text) => {
        const b = make(doc, 'button', 'kp-button kp-button--sm', text);
        b.type = 'button';
        b.dataset.kpSequencerZoom = key;
        return b;
    };
    const zoomButtons = [zoomButton('out', strings.sequencerZoomOut), zoomButton('fit', strings.sequencerZoomFit), zoomButton('in', strings.sequencerZoomIn)];
    const zoomValue = make(doc, 'span', 'kp-sequencer__zoomvalue');
    zoomValue.setAttribute('aria-hidden', 'true');
    zoomGroup.append(...zoomButtons, zoomValue);
    const total = make(doc, 'p', 'kp-sequencer__total');
    bar.append(zoomGroup, total);

    const scroll = make(doc, 'div', 'kp-gantt__scroll kp-sequencer__scroll');
    const body = make(doc, 'div', 'kp-gantt__body kp-sequencer__body');
    body.setAttribute('role', 'group');
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) body.setAttribute('aria-label', strings.sequencerLabel);
    const corner = make(doc, 'div', 'kp-gantt__corner');
    const axis = make(doc, 'div', 'kp-gantt__axis');
    axis.setAttribute('aria-hidden', 'true');
    const lines = make(doc, 'div', 'kp-gantt__lines kp-sequencer__lines');
    lines.setAttribute('aria-hidden', 'true');
    const layer = make(doc, 'div', 'kp-sequencer__items');
    const plot = make(doc, 'div', 'kp-gantt__plot kp-sequencer__plot');
    const nowLine = make(doc, 'div', 'kp-gantt__now');
    nowLine.setAttribute('role', 'separator');
    nowLine.hidden = true;
    const endLine = make(doc, 'div', 'kp-sequencer__end');
    endLine.setAttribute('aria-hidden', 'true');
    const guide = make(doc, 'div', 'kp-sequencer__guide');
    guide.setAttribute('aria-hidden', 'true');
    guide.hidden = true;
    const readout = make(doc, 'p', 'kp-sequencer__readout');
    readout.setAttribute('aria-hidden', 'true');
    readout.hidden = true;
    plot.append(endLine, nowLine, guide, readout);
    body.append(corner, axis, lines, layer, plot);
    scroll.append(body);
    const plate = make(doc, 'div', 'kp-gantt__plate');
    plate.hidden = true;
    const frame = make(doc, 'div', 'kp-gantt__frame');
    frame.append(scroll, plate);

    const selection = make(doc, 'div', 'kp-sequencer__selection');
    selection.setAttribute('role', 'group');
    const selectionText = make(doc, 'p', 'kp-sequencer__selected');
    const actions = make(doc, 'div', 'kp-sequencer__actions');
    /** @param {string} key @param {string} text */
    const action = (key, text) => {
        const b = make(doc, 'button', 'kp-button kp-button--sm', text);
        b.type = 'button';
        b.dataset.kpSequencerAction = key;
        return b;
    };
    const linkButton = action('link', strings.sequencerLinkButton);
    const unlinkButton = action('unlink', strings.sequencerUnlinkButton);
    const cancelButton = action('cancel', strings.sequencerLinkCancel);
    actions.append(linkButton, unlinkButton, cancelButton);
    selection.append(selectionText, actions);

    const hint = make(doc, 'p', 'kp-gantt__hint kp-sequencer__hint');
    const help = make(doc, 'p', 'kp-gantt__announce', strings.sequencerItemHelp);
    help.id = `${id}-help`;
    const announcer = make(doc, 'p', 'kp-gantt__announce');
    announcer.setAttribute('role', 'status');
    const measure = make(doc, 'span', 'kp-gantt__label kp-sequencer__measure');
    measure.setAttribute('aria-hidden', 'true');
    const ruler = make(doc, 'span', 'kp-gantt__label kp-sequencer__measure kp-sequencer__ruler');
    ruler.setAttribute('aria-hidden', 'true');
    const probe = make(doc, 'span', 'kp-sequencer__probe');
    probe.setAttribute('aria-hidden', 'true');
    layer.append(measure, ruler, probe);
    el.replaceChildren(bar, frame, selection, hint, help, announcer);
    el.dataset.kpSequencerId = id;
    return {
        el, strings, id, bar, zoomGroup, zoomButtons, zoomValue, total, frame, scroll, body, axis, lines, layer, plot, nowLine, endLine, guide, readout, plate,
        selection, selectionText, linkButton, unlinkButton, cancelButton, hint, help, announcer, measure, ruler, probe, rowPx: 28, padPx: 4,
        unit: { name: 'minute', seconds: 60 }, step: 1, overlap: 'refuse', edges: true, laneMove: true, editable: true, minSpan: 0,
        items: [], view: [], lanes: [], rows: { rows: new Map(), counts: new Map() }, span: 60, zoom: 1, nowAt: null,
        state: 'ready', stateWords: '', stateText: '', stateArt: null, plateKey: '', laneKey: '', tickKey: '', laneEls: [], laneTops: [],
        bars: new Map(), outsides: new Map(), joins: new Map(), selected: null, focusId: null, linking: null, kb: null, press: null, pending: null,
        busy: null, leaving: null, touches: new Map(), pinch: null, scrollTimer: 0, frameTimer: 0, drawn: false, observer: null,
    };
}

/** @param {SequencerModel} c @param {SequencerItem} item */
function seriesOf(c, item) {
    const at = c.lanes.findIndex((l) => l.id === item.lane);
    return item.series ?? /** @type {1 | 2 | 3 | 4 | 5} */ (((Math.max(0, at) % 5) + 1));
}

/** The lanes the page gave, plus a lane for every item's lane that none names. @param {SequencerModel} c @param {SequencerLane[]} given */
function lanesFor(c, given) {
    /** @type {SequencerLane[]} */
    const lanes = given.map((l) => ({ id: String(l.id), label: String(l.label ?? l.id) }));
    for (const item of c.items) if (!lanes.some((l) => l.id === item.lane)) lanes.push({ id: item.lane, label: item.lane });
    return lanes;
}

/** Draw the lanes (names and tracks) when they changed. @param {SequencerModel} c */
function paintLanes(c) {
    const doc = c.el.ownerDocument;
    const ghostOnly = c.lanes.length === 0 && c.state === 'loading';
    const key = ghostOnly ? 'ghost' : JSON.stringify(c.lanes.map((l) => [l.id, l.label, c.rows.counts.get(l.id) ?? 1]));
    if (key !== c.laneKey) {
        c.laneKey = key;
        for (const e of c.laneEls.splice(0)) e.remove();
        /** @type {{ id: string, label: string, rows: number, ghost: boolean }[]} */
        const spec = ghostOnly
            ? (c.el.dataset.kpSequencerGhosts ?? '1 1 1').split(/\s+/).map((n, i) => ({ id: `g${i}`, label: '', rows: Math.max(1, Math.min(6, Number.parseInt(n, 10) || 1)), ghost: true }))
            : c.lanes.map((l) => ({ id: l.id, label: l.label, rows: c.rows.counts.get(l.id) ?? 1, ghost: false }));
        spec.forEach((lane, i) => {
            const name = make(doc, 'div', `kp-gantt__lane${lane.ghost ? ' kp-gantt__ghost' : ''}`);
            const track = make(doc, 'div', `kp-gantt__track kp-sequencer__track${lane.ghost ? ' kp-gantt__ghost' : ''}`);
            for (const e of [name, track]) {
                e.style.setProperty('grid-row', String(i + 2));
                if (lane.ghost) e.setAttribute('aria-hidden', 'true');
            }
            if (lane.ghost) {
                name.append(make(doc, 'span', 'kp-skeleton'));
                const shapes = [[0.08, 0.2, 0.52], [0.3, 0.28], [0.14, 0.1, 0.6]];
                (shapes[i % shapes.length] ?? []).forEach((at, k) => {
                    const piece = make(doc, 'span', 'kp-gantt__run kp-skeleton');
                    piece.style.setProperty('--kp-g-row', String(k % lane.rows));
                    piece.style.setProperty('--kp-g-at', String(at));
                    piece.style.setProperty('--kp-g-width', String(0.05 + ((i + k) % 3) * 0.05));
                    track.append(piece);
                });
            } else {
                name.append(make(doc, 'span', '', lane.label));
                name.dataset.kpLane = lane.id;
            }
            track.style.setProperty('--kp-g-rows', String(lane.rows));
            c.body.insertBefore(name, c.lines);
            c.body.insertBefore(track, c.lines);
            c.laneEls.push(name, track);
        });
        c.body.style.setProperty('--kp-g-lanes', String(Math.max(1, spec.length)));
    }
}

/** Where each lane starts, in px from the top of the bars' layer. @param {SequencerModel} c */
function measureLanes(c) {
    const tracks = /** @type {HTMLElement[]} */ (c.laneEls.filter((e) => e.classList.contains('kp-gantt__track')));
    c.rowPx = c.probe.offsetHeight || 28;
    c.padPx = c.probe.offsetWidth || 4;
    const origin = c.layer.getBoundingClientRect().top;
    c.laneTops = tracks.map((t, i) => ({ id: c.lanes[i]?.id ?? '', top: t.getBoundingClientRect().top - origin }));
}

/** @param {HTMLElement} el @param {string} name @param {string} value */
function setProp(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

/** The place of one bar: custom properties only. @param {SequencerModel} c @param {HTMLElement} el @param {SequencerItem} item @param {number} row */
function place(c, el, item, row) {
    const top = c.laneTops.find((l) => l.id === item.lane)?.top ?? 0;
    setProp(el, '--kp-g-s', String(item.start));
    setProp(el, '--kp-g-e', String(round(item.start + item.duration)));
    setProp(el, '--kp-tl-top', px(top));
    setProp(el, '--kp-tl-line', String(row));
}

/** Bars by id: made when new, removed when gone, never rebuilt. @param {SequencerModel} c @param {SequencerItem[]} list */
function syncBars(c, list) {
    const doc = c.el.ownerDocument;
    const keep = new Set(list.map((i) => i.id));
    for (const [id, bar] of c.bars)
        if (!keep.has(id)) {
            bar.remove();
            c.outsides.get(id)?.remove();
            c.outsides.delete(id);
            c.bars.delete(id);
        }
    for (const item of list) {
        let bar = c.bars.get(item.id);
        if (!bar) {
            bar = make(doc, 'button', 'kp-gantt__run kp-sequencer__item');
            bar.type = 'button';
            bar.dataset.kpState = 'ok';
            bar.dataset.kpId = item.id;
            bar.setAttribute('aria-describedby', c.help.id);
            const start = make(doc, 'span', 'kp-sequencer__handle');
            start.dataset.edge = 'start';
            start.setAttribute('aria-hidden', 'true');
            const end = make(doc, 'span', 'kp-sequencer__handle');
            end.dataset.edge = 'end';
            end.setAttribute('aria-hidden', 'true');
            bar.append(start, make(doc, 'span', 'kp-gantt__label'), end);
            c.layer.append(bar);
            c.bars.set(item.id, bar);
        }
        const label = /** @type {HTMLElement} */ (bar.querySelector('.kp-gantt__label'));
        if (label.textContent !== item.label) label.textContent = item.label;
        bar.dataset.kpSeries = String(seriesOf(c, item));
        const said = summary(c, item);
        if (bar.getAttribute('aria-label') !== said) bar.setAttribute('aria-label', said);
        bar.toggleAttribute('data-kp-linked', Boolean(item.with) || list.some((i) => i.with === item.id));
        bar.toggleAttribute('data-kp-locked', Boolean(item.locked));
        bar.setAttribute('aria-pressed', String(c.selected === item.id));
        bar.tabIndex = (c.focusId ?? c.selected ?? list[0]?.id) === item.id ? 0 : -1;
    }
}

/** The joins: a line from every item down or up to the partner it starts with. @param {SequencerModel} c @param {SequencerItem[]} list */
function syncJoins(c, list) {
    const doc = c.el.ownerDocument;
    /** The middle of an item's bar, in px from the top of the layer. @param {SequencerItem} i */
    const centre = (i) => {
        const was = c.items.find((x) => x.id === i.id);
        const row = was && was.lane === i.lane ? (c.rows.rows.get(i.id) ?? 0) : 0;
        return (c.laneTops.find((l) => l.id === i.lane)?.top ?? 0) + c.padPx + row * c.rowPx + c.rowPx / 2;
    };
    const keep = new Set();
    for (const item of list) {
        const partner = item.with ? list.find((i) => i.id === item.with) : null;
        if (!partner) continue;
        keep.add(item.id);
        let join = c.joins.get(item.id);
        if (!join) {
            join = make(doc, 'span', 'kp-sequencer__join');
            join.setAttribute('aria-hidden', 'true');
            c.layer.append(join);
            c.joins.set(item.id, join);
        }
        const a = centre(item);
        const b = centre(partner);
        setProp(join, '--kp-g-s', String(item.start));
        setProp(join, '--kp-tl-top', px(Math.min(a, b)));
        setProp(join, '--kp-tl-height', px(Math.abs(a - b)));
    }
    for (const [id, join] of c.joins)
        if (!keep.has(id)) {
            join.remove();
            c.joins.delete(id);
        }
}

/** Axis ticks and the rules under them. @param {SequencerModel} c */
function syncTicks(c) {
    const room = c.plot.clientWidth || 600;
    const { step, values } = sequencerTicks(c.span, room, c.unit.seconds);
    const key = `${c.unit.name}:${step}:${values.length}:${c.span}`;
    if (key === c.tickKey) return;
    c.tickKey = key;
    const doc = c.el.ownerDocument;
    c.axis.replaceChildren();
    c.lines.replaceChildren();
    for (const v of values) {
        const tick = make(doc, 'span', 'kp-gantt__tick', words(c, v));
        tick.style.setProperty('--kp-g-t', String(v));
        if (v >= c.span - step / 2 && v > 0) tick.setAttribute('data-kp-gantt-edge', '');
        c.axis.append(tick);
        const rule = make(doc, 'span', 'kp-gantt__rule');
        rule.style.setProperty('--kp-g-t', String(v));
        c.lines.append(rule);
    }
}

/**
 * A name that does not fit its bar (wrapped on at most the lines the bar is tall for) stands outside it: after it when the row has
 * room, else before it, else it is left to the bar's name (its label). Never cut with an ellipsis. @param {SequencerModel} c
 */
function placeLabels(c) {
    const width = c.plot.clientWidth;
    if (!width) return;
    const perUnit = width / c.span;
    const doc = c.el.ownerDocument;
    const pad = Number.parseFloat(getComputedStyle(c.measure).paddingLeft) * 2 || 12;
    const barPx = c.rowPx * 0.8;
    /** @type {Map<string, SequencerItem[]>} */
    const byRow = new Map();
    for (const item of c.view) {
        const key = `${item.lane}|${c.rows.rows.get(item.id) ?? 0}`;
        byRow.set(key, [...(byRow.get(key) ?? []), item]);
    }
    for (const row of byRow.values()) {
        row.sort((a, b) => a.start - b.start);
        // The right edge of the last name stood after its bar: the next bar's name may not stand before its bar over it.
        let claimed = 0;
        row.forEach((item, i) => {
            const bar = c.bars.get(item.id);
            if (!bar) return;
            const left = item.start * perUnit;
            const right = (item.start + item.duration) * perUnit;
            c.measure.textContent = item.label;
            c.measure.style.inlineSize = `${Math.max(0, right - left - 2)}px`;
            const fits = right - left - 2 > pad + 8 && c.measure.scrollHeight <= barPx - 2 + 0.5 && c.measure.scrollWidth <= c.measure.clientWidth + 0.5;
            c.ruler.textContent = item.label;
            const need = c.ruler.offsetWidth;
            const prev = row[i - 1];
            const next = row[i + 1];
            const after = (next ? next.start * perUnit : width) - right - 8;
            const before = left - Math.max(prev ? (prev.start + prev.duration) * perUnit : 0, claimed) - 8;
            const side = fits ? null : after >= need ? 'after' : before >= need ? 'before' : 'none';
            if (side === 'after') claimed = right + 4 + need + 4;
            let out = c.outsides.get(item.id);
            if (side === null || side === 'none') {
                out?.remove();
                c.outsides.delete(item.id);
            } else {
                if (!out) {
                    out = make(doc, 'span', 'kp-gantt__outside kp-sequencer__outside');
                    out.setAttribute('aria-hidden', 'true');
                    c.layer.append(out);
                    c.outsides.set(item.id, out);
                }
                out.textContent = item.label;
                out.dataset.kpSide = side;
                out.dataset.kpState = 'ok';
                setProp(out, '--kp-g-label-room', px(side === 'after' ? after : before));
                setProp(out, '--kp-g-s', String(item.start));
                setProp(out, '--kp-g-e', String(round(item.start + item.duration)));
                setProp(out, '--kp-tl-top', bar.style.getPropertyValue('--kp-tl-top'));
                setProp(out, '--kp-tl-line', bar.style.getPropertyValue('--kp-tl-line'));
            }
            if (side) bar.dataset.kpLabel = side;
            else bar.removeAttribute('data-kp-label');
        });
    }
}

/** The window, the zoom, the total, the line for now. @param {SequencerModel} c @param {SequencerItem[]} list @param {boolean} fit refit the window to the plan */
function paintWindow(c, list, fit) {
    const total = sequencerTotalOf(list);
    if (fit) c.span = sequencerWindow(total, c.minSpan, c.step);
    c.body.style.setProperty('--kp-g-from', '0');
    c.body.style.setProperty('--kp-g-span', String(c.span));
    c.body.style.setProperty('--kp-tl-zoom', String(c.zoom));
    c.endLine.style.setProperty('--kp-g-t', String(total));
    c.endLine.hidden = total <= 0;
    c.total.textContent = list.length ? c.strings.sequencerTotal(words(c, total)) : '';
    c.zoomValue.textContent = c.strings.sequencerZoomValue(Math.round(c.zoom * 100));
    const [out, fitButton, zin] = /** @type {[HTMLButtonElement, HTMLButtonElement, HTMLButtonElement]} */ (c.zoomButtons);
    out.setAttribute('aria-disabled', String(c.zoom <= SEQUENCER_ZOOM_MIN + EPS));
    zin.setAttribute('aria-disabled', String(c.zoom >= SEQUENCER_ZOOM_MAX - EPS));
    fitButton.setAttribute('aria-disabled', String(c.zoom === 1));
    if (c.nowAt === null) c.nowLine.hidden = true;
    else {
        c.nowLine.hidden = false;
        c.body.style.setProperty('--kp-g-now', String(c.nowAt));
        c.nowLine.toggleAttribute('data-kp-out', c.nowAt < 0 || c.nowAt > c.span);
        c.nowLine.setAttribute('aria-label', c.strings.sequencerNow(words(c, c.nowAt)));
    }
}

/** The selection line and its buttons. @param {SequencerModel} c */
function paintSelection(c) {
    const item = c.selected ? c.view.find((i) => i.id === c.selected) : undefined;
    const linking = c.linking ? c.view.find((i) => i.id === c.linking) : undefined;
    c.selectionText.textContent = linking ? c.strings.sequencerLinkStart(linking.label) : item ? summary(c, item) : c.strings.sequencerSelectedNone;
    const can = c.editable && Boolean(item) && !linking;
    c.linkButton.hidden = !can || c.view.length < 2;
    c.unlinkButton.hidden = !can || !item?.with;
    c.cancelButton.hidden = !linking;
    c.selection.dataset.kpMode = linking ? 'linking' : item ? 'selected' : 'none';
}

/** The state: loading card, plate. @param {SequencerModel} c */
function paintState(c) {
    const empty = c.state === 'ready' && c.items.length === 0;
    const plateKind = c.state === 'error' || c.state === 'empty' || empty ? (c.state === 'error' ? 'error' : 'empty') : null;
    c.el.dataset.kpState = empty ? 'empty' : c.state;
    c.el.setAttribute('aria-busy', String(c.state === 'loading'));
    const title = c.state === 'error' ? c.stateWords || c.strings.sequencerFailed : c.stateWords || c.strings.sequencerEmpty;
    const text = c.state === 'error' ? c.stateText : c.stateText || c.strings.sequencerEmptyText;
    const key = plateKind ? `${plateKind}|${title}|${text}` : '';
    if (key !== c.plateKey) {
        c.plateKey = key;
        c.plate.replaceChildren();
        if (plateKind)
            c.plate.append(
                hostStatePlate(c.el, {
                    kind: plateKind,
                    title,
                    ...(text ? { text } : {}),
                    art: c.stateArt,
                    retryEvent: SEQUENCER_RETRY_EVENT,
                }),
            );
    }
    c.plate.hidden = plateKind === null;
    c.plate.dataset.kpState = plateKind ?? '';
    const want = c.state === 'loading';
    if (want === (c.busy !== null)) {
        c.busy?.place();
        return;
    }
    if (!want) {
        const card = /** @type {import('./busy-card.js').BusyCard} */ (c.busy);
        c.busy = null;
        const gone = card.close();
        c.leaving = gone;
        c.el.toggleAttribute('data-kp-leaving', true);
        void gone.then(() => {
            if (c.leaving !== gone) return;
            c.leaving = null;
            c.el.removeAttribute('data-kp-leaving');
        });
        return;
    }
    for (const old of c.el.querySelectorAll(':scope > .kp-gantt__busy')) old.remove();
    c.leaving = null;
    c.el.removeAttribute('data-kp-leaving');
    c.busy = openBusyCard(c.el, {
        words: c.strings.sequencerLoading,
        area: () => [c.frame],
        className: 'kp-gantt__busy',
        arrive: c.drawn,
    });
}

/** Draw everything from the committed items. @param {SequencerModel} c @param {{ fit?: boolean }} [how] */
function paint(c, { fit = true } = {}) {
    c.view = c.items;
    c.rows = sequencerRows(c.items, c.lanes.map((l) => l.id));
    paintLanes(c);
    paintState(c);
    measureLanes(c);
    paintWindow(c, c.view, fit);
    syncTicks(c);
    syncBars(c, c.view);
    for (const item of c.view) {
        const bar = c.bars.get(item.id);
        if (bar) place(c, bar, item, c.rows.rows.get(item.id) ?? 0);
    }
    syncJoins(c, c.view);
    placeLabels(c);
    paintSelection(c);
    c.drawn = true;
}

/**
 * Draw a draft while an edit is in progress: the moved bars by custom properties, nothing rebuilt, the window as it is.
 * @param {SequencerModel} c @param {SequencerItem[]} list @param {string[]} ids the bars that may have moved
 * @param {boolean} [refit]
 */
function drawDraft(c, list, ids, refit = false) {
    c.view = list;
    if (refit) {
        paintWindow(c, list, true);
        syncTicks(c);
    } else {
        const total = sequencerTotalOf(list);
        c.endLine.style.setProperty('--kp-g-t', String(total));
        c.total.textContent = c.strings.sequencerTotal(words(c, total));
    }
    for (const id of ids) {
        const item = list.find((i) => i.id === id);
        const bar = c.bars.get(id);
        if (!item || !bar) continue;
        const before = c.items.find((i) => i.id === id);
        place(c, bar, item, before && before.lane === item.lane ? (c.rows.rows.get(id) ?? 0) : 0);
        const out = c.outsides.get(id);
        if (out) out.hidden = true;
        bar.removeAttribute('data-kp-label');
        const said = summary(c, item);
        if (bar.getAttribute('aria-label') !== said) bar.setAttribute('aria-label', said);
    }
    syncJoins(c, list);
    paintSelection(c);
}

/** Put the committed items back on screen after an edit ended. @param {SequencerModel} c */
function settleDraw(c) {
    for (const out of c.outsides.values()) out.hidden = false;
    paint(c);
}

/** Drop an edit: commit `list` when it differs. @param {SequencerModel} c @param {SequencerItem[]} list @param {'pointer' | 'keyboard' | 'link'} source @returns {boolean} */
function commit(c, list, source) {
    const changed = changedIds(c.items, list);
    c.press = null;
    c.kb = null;
    c.guide.hidden = true;
    c.readout.hidden = true;
    c.el.removeAttribute('data-kp-editing');
    if (!changed.length) {
        settleDraw(c);
        flushPending(c);
        return false;
    }
    c.items = list;
    settleDraw(c);
    emit(c, SEQUENCER_CHANGE_EVENT, { items: outItems(c, c.items), changed, source, total: sequencerTotalOf(c.items) });
    flushPending(c);
    return true;
}

/** A page's set that came during an edit is applied once the edit ended. @param {SequencerModel} c */
function flushPending(c) {
    const pending = c.pending;
    if (!pending || c.press || c.kb) return;
    c.pending = null;
    apply(c, pending.items, pending.lanes);
}

/** @param {SequencerModel} c @param {Partial<SequencerItem>[]} raw @param {SequencerLane[] | undefined} lanes */
function apply(c, raw, lanes) {
    c.items = sequencerClean(raw);
    if (lanes) c.lanes = lanesFor(c, lanes);
    else c.lanes = lanesFor(c, c.lanes);
    if (c.selected && !c.items.some((i) => i.id === c.selected)) c.selected = null;
    if (c.focusId && !c.items.some((i) => i.id === c.focusId)) c.focusId = null;
    paint(c);
}

/** @param {SequencerModel} c @param {string | null} id */
function select(c, id) {
    if (c.selected === id) return;
    c.selected = id;
    for (const [key, bar] of c.bars) bar.setAttribute('aria-pressed', String(key === id));
    paintSelection(c);
    emit(c, SEQUENCER_SELECT_EVENT, { id });
}

/** Say why an edit did not happen. @param {SequencerModel} c @param {string} id @param {SequencerPlan} plan */
function refuse(c, id, plan) {
    const label = labelOf(c, id);
    const s = c.strings;
    const text =
        plan.reason === 'overlap' ? s.sequencerRefusedOverlap(label, plan.blocker ? labelOf(c, plan.blocker) : '')
        : plan.reason === 'locked' ? s.sequencerRefusedLocked(label)
        : plan.reason === 'cycle' ? s.sequencerRefusedLink(label)
        : s.sequencerRefusedEdge(label);
    announce(c, text);
    emit(c, SEQUENCER_REFUSE_EVENT, { id, reason: plan.reason, blocker: plan.blocker });
}

/** The zoom, around the point of the plot under `anchorX` (client px), or the middle of what is seen. @param {SequencerModel} c @param {number} zoom @param {number} [anchorX] */
function setZoom(c, zoom, anchorX) {
    const next = sequencerClampZoom(zoom);
    if (next === c.zoom) return false;
    const before = c.layer.getBoundingClientRect();
    const seen = c.scroll.getBoundingClientRect();
    const ax = anchorX ?? Math.max(before.left, seen.left) + (Math.min(before.right, seen.right) - Math.max(before.left, seen.left)) / 2;
    const frac = before.width ? Math.min(1, Math.max(0, (ax - before.left) / before.width)) : 0;
    c.zoom = next;
    c.body.style.setProperty('--kp-tl-zoom', String(next));
    const after = c.layer.getBoundingClientRect();
    c.scroll.scrollLeft += after.left + frac * after.width - ax;
    afterLayout(c);
    return true;
}

/** What depends on the width: ticks, lane tops, outside labels, the zoom words. @param {SequencerModel} c */
function afterLayout(c) {
    paintWindow(c, c.view, false);
    c.tickKey = '';
    syncTicks(c);
    measureLanes(c);
    for (const item of c.view) {
        const bar = c.bars.get(item.id);
        if (bar && !(c.press?.moved && c.press.id === item.id)) place(c, bar, item, c.rows.rows.get(item.id) ?? 0);
    }
    syncJoins(c, c.view);
    placeLabels(c);
}

/** The time under a client x. @param {SequencerModel} c @param {number} x */
function unitAt(c, x) {
    const box = c.layer.getBoundingClientRect();
    return box.width ? ((x - box.left) / box.width) * c.span : 0;
}

/** @param {SequencerModel} c */
const reachNow = (c) => {
    const box = c.layer.getBoundingClientRect();
    return box.width ? (REACH_PX / box.width) * c.span : 0;
};

/** The lane under a client y, the nearest when above or below all. @param {SequencerModel} c @param {number} y */
function laneAt(c, y) {
    const lanes = c.press?.lanes ?? [];
    if (!lanes.length) return null;
    return (lanes.find((l) => y >= l.top && y < l.bottom) ?? (y < (lanes[0]?.top ?? 0) ? lanes[0] : lanes[lanes.length - 1]))?.id ?? null;
}

/** Show the guide where a dragged edge sits on another item's edge, and the chip that follows the bar. @param {SequencerModel} c @param {SequencerItem[]} list @param {string} id @param {boolean} refused */
function showDragMarks(c, list, id, refused) {
    const item = list.find((i) => i.id === id);
    if (!item) return;
    const ids = sequencerGroup(list, id);
    const edges = list.filter((i) => !ids.has(i.id)).flatMap((i) => [i.start, round(i.start + i.duration)]);
    const mine = [item.start, round(item.start + item.duration)];
    const hit = mine.find((m) => edges.some((e) => Math.abs(e - m) < EPS));
    c.guide.hidden = hit === undefined;
    if (hit !== undefined) c.guide.style.setProperty('--kp-g-t', String(hit));
    c.readout.hidden = false;
    c.readout.textContent = refused ? c.strings.sequencerReadoutRefused : c.strings.sequencerReadout(words(c, item.start), words(c, item.duration));
    c.readout.toggleAttribute('data-kp-refused', refused);
    c.readout.style.setProperty('--kp-g-s', String(item.start));
    c.readout.style.setProperty('--kp-g-e', String(round(item.start + item.duration)));
    c.readout.toggleAttribute('data-kp-flip', item.start + item.duration > c.span * 0.7);
    const top = c.laneTops.find((l) => l.id === item.lane)?.top ?? 0;
    c.readout.style.setProperty('--kp-tl-top', px(top));
}

/** One step of a pointer drag. @param {SequencerModel} c @param {PointerEvent} e */
function dragTo(c, e) {
    const p = c.press;
    if (!p) return;
    const item = p.before.find((i) => i.id === p.id);
    if (!item) return;
    const u = unitAt(c, e.clientX);
    /** @type {SequencerEdit} */
    const edit =
        p.edge === 'start' ? { id: p.id, kind: 'resize-start', start: u }
        : p.edge === 'end' ? { id: p.id, kind: 'resize-end', end: u }
        : { id: p.id, kind: 'move', start: u - p.grab, lane: laneAt(c, e.clientY) ?? item.lane };
    const more = { max: c.span, reach: reachNow(c) };
    let plan = sequencerPlan(p.before, edit, planOptions(c, more));
    p.refused = !plan.ok;
    if (!plan.ok) {
        // The bar still follows the pointer, marked, and goes back when dropped.
        plan = sequencerPlan(p.before, edit, { ...planOptions(c, more), overlap: 'allow' });
        p.last = plan.ok ? plan : p.last;
    } else p.last = plan;
    const draft = plan.ok ? plan.items : p.last?.items;
    if (!draft) return;
    p.bar.toggleAttribute('data-kp-refused', p.refused);
    drawDraft(c, draft, [...new Set([...changedIds(c.items, draft), ...changedIds(c.items, c.view)])]);
    showDragMarks(c, draft, p.id, p.refused);
    edgeScroll(c, e.clientX);
}

/** Scroll the box while a drag is at its edge. @param {SequencerModel} c @param {number} x */
function edgeScroll(c, x) {
    window.clearTimeout(c.scrollTimer);
    const box = c.scroll.getBoundingClientRect();
    const hot = 28;
    const push = x < box.left + hot ? -12 : x > box.right - hot ? 12 : 0;
    if (!push || !c.press?.moved) return;
    const again = () => {
        if (!c.press?.moved) return;
        c.scroll.scrollLeft += push;
        if (c.press.last) {
            const lastX = x;
            // The pointer has not moved but the plot under it has: plan the drag again from the same place.
            dragTo(c, /** @type {PointerEvent} */ ({ clientX: lastX, clientY: c.press.y }));
        }
        c.scrollTimer = window.setTimeout(again, 30);
    };
    c.scrollTimer = window.setTimeout(again, 30);
}

/** Put an edit in progress back. @param {SequencerModel} c @param {string} why */
function cancelEdit(c, why) {
    const was = c.kb?.id ?? c.press?.id ?? null;
    const bar = c.press?.bar;
    window.clearTimeout(c.scrollTimer);
    if (bar) {
        bar.removeAttribute('data-kp-refused');
        bar.removeAttribute('data-kp-dragging');
    }
    for (const b of c.bars.values()) b.removeAttribute('data-kp-grabbed');
    c.press = null;
    c.kb = null;
    c.guide.hidden = true;
    c.readout.hidden = true;
    c.el.removeAttribute('data-kp-editing');
    settleDraw(c);
    if (was && why !== 'quiet') announce(c, c.strings.sequencerCancelled(labelOf(c, was)));
    flushPending(c);
}

/** Start choosing a partner for `id`. @param {SequencerModel} c @param {string} id */
function startLink(c, id) {
    if (!c.editable || c.items.length < 2) return;
    c.linking = id;
    paintSelection(c);
    announce(c, c.strings.sequencerLinkStart(labelOf(c, id)));
}

/** @param {SequencerModel} c */
function stopLink(c) {
    c.linking = null;
    paintSelection(c);
}

/** Make the linking item run alongside `partner`. @param {SequencerModel} c @param {string} partner */
function finishLink(c, partner) {
    const id = c.linking;
    if (!id) return;
    c.linking = null;
    const plan = sequencerLink(c.items, id, partner, planOptions(c));
    if (!plan.ok) {
        paintSelection(c);
        refuse(c, id, plan);
        return;
    }
    commit(c, plan.items, 'link');
    announce(c, c.strings.sequencerLinked(labelOf(c, id), labelOf(c, partner)));
}

/** @param {SequencerModel} c @param {string} id */
function unlink(c, id) {
    const plan = sequencerUnlink(c.items, id);
    if (!plan.ok || !plan.changed.length) return;
    commit(c, plan.items, 'link');
    announce(c, c.strings.sequencerUnlinked(labelOf(c, id)));
}

/** Move the focus between items with the arrows. @param {SequencerModel} c @param {string} id @param {KeyboardEvent} e @returns {boolean} */
function navigate(c, id, e) {
    const item = c.items.find((i) => i.id === id);
    if (!item) return false;
    const inLane = c.items.filter((i) => i.lane === item.lane).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const rtl = getComputedStyle(c.el).direction === 'rtl';
    /** @type {SequencerItem | undefined} */
    let to;
    const at = inLane.findIndex((i) => i.id === id);
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) to = inLane[at + 1];
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) to = inLane[at - 1];
    else if (e.key === 'Home') to = inLane[0];
    else if (e.key === 'End') to = inLane[inLane.length - 1];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const order = c.lanes.map((l) => l.id);
        for (let k = order.indexOf(item.lane) + (e.key === 'ArrowDown' ? 1 : -1); k >= 0 && k < order.length && !to; k += e.key === 'ArrowDown' ? 1 : -1) {
            const near = c.items.filter((i) => i.lane === order[k]);
            to = near.sort((a, b) => Math.abs(a.start - item.start) - Math.abs(b.start - item.start))[0];
        }
    } else return false;
    if (to) focusItem(c, to.id);
    return true;
}

/** @param {SequencerModel} c @param {string} id */
function focusItem(c, id) {
    c.focusId = id;
    for (const [key, bar] of c.bars) bar.tabIndex = key === id ? 0 : -1;
    c.bars.get(id)?.focus();
}

/** @param {SequencerModel} c @param {KeyboardEvent} e */
function onKey(c, e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const bar = target.closest?.('.kp-sequencer__item');
    if (!(bar instanceof HTMLElement)) return;
    const id = bar.dataset.kpId ?? '';
    const item = c.items.find((i) => i.id === id);
    if (!item) return;
    if (c.kb && c.kb.id === id) {
        const action = sequencerKey(e, { step: c.step, rtl: getComputedStyle(c.el).direction === 'rtl' });
        if (!action) return;
        e.preventDefault();
        if (action.kind === 'cancel') {
            cancelEdit(c, 'key');
            return;
        }
        if (action.kind === 'drop') {
            bar.removeAttribute('data-kp-grabbed');
            commit(c, c.view, 'keyboard');
            announce(c, c.strings.sequencerDropped(summary(c, c.items.find((i) => i.id === id) ?? item)));
            return;
        }
        const plan = sequencerApplyKey(c.view, id, action, planOptions(c));
        if (!plan.ok) {
            refuse(c, id, plan);
            return;
        }
        if (!plan.changed.length) return;
        drawDraft(c, plan.items, plan.changed, true);
        const now = plan.items.find((i) => i.id === id) ?? item;
        announce(c, plan.pushed.length ? `${summary(c, now)}. ${c.strings.sequencerPushed(plan.pushed.length)}` : summary(c, now));
        return;
    }
    if (c.linking) {
        if (e.key === 'Escape') {
            e.preventDefault();
            stopLink(c);
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && id !== c.linking) {
            e.preventDefault();
            finishLink(c, id);
            return;
        }
    }
    if (navigate(c, id, e)) {
        e.preventDefault();
        return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(c, id);
        if (!c.editable) return;
        c.kb = { id, before: c.items };
        bar.setAttribute('data-kp-grabbed', '');
        c.el.setAttribute('data-kp-editing', 'keyboard');
        announce(c, c.strings.sequencerGrabbed(item.label));
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        select(c, id);
        startLink(c, id);
    } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        unlink(c, id);
    } else if (e.key === 'Escape' && c.selected) select(c, null);
}

/** @param {SequencerModel} c @param {PointerEvent} e */
function onDown(c, e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const bar = target.closest?.('.kp-sequencer__item');
    if (e.pointerType === 'touch' && !(bar instanceof HTMLElement) && c.scroll.contains(target)) {
        c.touches.set(e.pointerId, { x: e.clientX });
        if (c.touches.size === 2) {
            const [a, b] = [...c.touches.values()];
            c.pinch = { dist: Math.abs((a?.x ?? 0) - (b?.x ?? 0)) || 1, zoom: c.zoom };
        }
        return;
    }
    if (!(bar instanceof HTMLElement) || e.button !== 0) return;
    const id = bar.dataset.kpId ?? '';
    const item = c.items.find((i) => i.id === id);
    if (!item) return;
    if (c.linking) {
        e.preventDefault();
        if (id !== c.linking) finishLink(c, id);
        else stopLink(c);
        return;
    }
    if (c.kb) cancelEdit(c, 'quiet');
    const handle = target.closest?.('.kp-sequencer__handle');
    const edge = handle instanceof HTMLElement && handle.dataset.edge === 'start' ? 'start' : handle instanceof HTMLElement && handle.dataset.edge === 'end' ? 'end' : 'body';
    c.press = { id, edge, x: e.clientX, y: e.clientY, pointer: e.pointerId, grab: unitAt(c, e.clientX) - item.start, bar: /** @type {HTMLButtonElement} */ (bar), moved: false, before: c.items, refused: false, lanes: [], last: null, edgeX: e.clientX };
    select(c, id);
    c.focusId = id;
    try {
        bar.setPointerCapture(e.pointerId);
    } catch {
        // A pointer that is already gone cannot be captured; the press ends with it.
    }
}

/** @param {SequencerModel} c @param {PointerEvent} e */
function onMove(c, e) {
    if (c.touches.has(e.pointerId)) {
        c.touches.set(e.pointerId, { x: e.clientX });
        if (c.pinch && c.touches.size === 2) {
            const [a, b] = [...c.touches.values()];
            const dist = Math.abs((a?.x ?? 0) - (b?.x ?? 0)) || 1;
            setZoom(c, c.pinch.zoom * (dist / c.pinch.dist), ((a?.x ?? 0) + (b?.x ?? 0)) / 2);
        }
        return;
    }
    const p = c.press;
    if (!p || p.pointer !== e.pointerId) return;
    if (!p.moved) {
        if (!c.editable || Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
        p.moved = true;
        p.lanes = c.laneEls
            .filter((el) => el.classList.contains('kp-gantt__track'))
            .map((el, i) => {
                const r = el.getBoundingClientRect();
                return { id: c.lanes[i]?.id ?? '', top: r.top, bottom: r.bottom };
            });
        p.bar.setAttribute('data-kp-dragging', '');
        c.el.setAttribute('data-kp-editing', 'pointer');
    }
    p.y = e.clientY;
    dragTo(c, e);
}

/** @param {SequencerModel} c @param {PointerEvent} e */
function onUp(c, e) {
    if (c.touches.delete(e.pointerId)) {
        if (c.touches.size < 2) c.pinch = null;
        return;
    }
    const p = c.press;
    if (!p || p.pointer !== e.pointerId) return;
    window.clearTimeout(c.scrollTimer);
    p.bar.removeAttribute('data-kp-dragging');
    p.bar.removeAttribute('data-kp-refused');
    if (!p.moved) {
        c.press = null;
        return;
    }
    if (p.refused) {
        const last = p.last;
        const blocker = last ? overlapBlocker(c, last.items, p.id) : null;
        c.press = null;
        settleDraw(c);
        c.guide.hidden = true;
        c.readout.hidden = true;
        c.el.removeAttribute('data-kp-editing');
        refuse(c, p.id, { ok: false, items: p.before, changed: [], pushed: [], reason: 'overlap', blocker });
        flushPending(c);
        return;
    }
    commit(c, p.last?.items ?? c.items, 'pointer');
    const item = c.items.find((i) => i.id === p.id);
    if (item) announce(c, c.strings.sequencerDropped(summary(c, item)));
}

/** The item a refused draft overlaps. @param {SequencerModel} c @param {SequencerItem[]} draft @param {string} id */
function overlapBlocker(c, draft, id) {
    const me = draft.find((i) => i.id === id);
    const group = sequencerGroup(draft, id);
    if (!me) return null;
    return draft.find((i) => !group.has(i.id) && i.lane === me.lane && overlaps(me, i))?.id ?? null;
}

/** @param {SequencerModel} c @param {PointerEvent} e */
function onCancel(c, e) {
    if (c.touches.delete(e.pointerId)) {
        if (c.touches.size < 2) c.pinch = null;
        return;
    }
    if (c.press && c.press.pointer === e.pointerId) cancelEdit(c, 'pointer');
}

/**
 * Attach every `[data-kp-sequencer]` under `root`. Returns a detach.
 * @param {ParentNode} [root]
 * @param {SequencerAttachOptions} [options]
 * @returns {() => void}
 */
export function attachSequencers(root = document, options = {}) {
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el of /** @type {HTMLElement[]} */ ([...root.querySelectorAll(SEQUENCER)])) {
        if (sequencers.has(el)) continue;
        const c = build(el, resolveStrings(options.strings));
        sequencers.set(el, c);
        readOptions(c);
        c.zoom = sequencerClampZoom(Number(el.dataset.kpSequencerZoom) || 1);
        const now = Number(el.dataset.kpSequencerNow);
        c.nowAt = el.dataset.kpSequencerNow !== undefined && Number.isFinite(now) ? now : null;
        if (el.dataset.kpState === 'loading') c.state = 'loading';
        paint(c);

        /** @param {Event} e */
        const onClick = (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            const zoomButton = target.closest?.('[data-kp-sequencer-zoom]');
            if (zoomButton instanceof HTMLElement) {
                if (zoomButton.getAttribute('aria-disabled') === 'true') return;
                const key = zoomButton.dataset.kpSequencerZoom;
                if (setZoom(c, key === 'fit' ? 1 : c.zoom * (key === 'in' ? 1.25 : 0.8))) announce(c, `${c.strings.sequencerZoomLabel} ${c.strings.sequencerZoomValue(Math.round(c.zoom * 100))}`);
                return;
            }
            const action = target.closest?.('[data-kp-sequencer-action]');
            if (action instanceof HTMLElement && c.selected) {
                const which = action.dataset.kpSequencerAction;
                if (which === 'link') startLink(c, c.selected);
                else if (which === 'unlink') unlink(c, c.selected);
                else if (which === 'cancel') stopLink(c);
                return;
            }
            if (!target.closest?.('.kp-sequencer__item') && target.closest?.('.kp-gantt__track, .kp-gantt__lane, .kp-sequencer__items')) {
                if (c.linking) stopLink(c);
                else select(c, null);
            }
        };
        /** @param {KeyboardEvent} e */
        const keydown = (e) => onKey(c, e);
        /** @param {PointerEvent} e */
        const down = (e) => onDown(c, e);
        /** @param {PointerEvent} e */
        const move = (e) => onMove(c, e);
        /** @param {PointerEvent} e */
        const up = (e) => onUp(c, e);
        /** @param {PointerEvent} e */
        const cancel = (e) => onCancel(c, e);
        /** @param {FocusEvent} e */
        const focusin = (e) => {
            const bar = /** @type {HTMLElement} */ (e.target).closest?.('.kp-sequencer__item');
            if (bar instanceof HTMLElement && bar.dataset.kpId && !c.press) {
                c.focusId = bar.dataset.kpId;
                select(c, bar.dataset.kpId);
            }
        };
        /** @param {FocusEvent} e */
        const focusout = (e) => {
            const bar = /** @type {HTMLElement} */ (e.target).closest?.('.kp-sequencer__item');
            if (c.kb && bar instanceof HTMLElement && bar.dataset.kpId === c.kb.id && !c.el.contains(/** @type {Node | null} */ (e.relatedTarget))) cancelEdit(c, 'blur');
        };
        /** @param {WheelEvent} e */
        const wheel = (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoom(c, c.zoom * Math.exp(-e.deltaY * 0.01), e.clientX);
        };
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', keydown);
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', cancel);
        el.addEventListener('focusin', focusin);
        el.addEventListener('focusout', focusout);
        c.scroll.addEventListener('wheel', wheel, { passive: false });
        const stopOptions = watchOptions(
            el,
            ['data-kp-sequencer-unit', 'data-kp-sequencer-snap', 'data-kp-sequencer-snap-items', 'data-kp-sequencer-overlap', 'data-kp-sequencer-lanes', 'data-kp-sequencer-editable', 'data-kp-sequencer-span', 'data-kp-sequencer-toolbar', 'data-kp-sequencer-hint', 'data-kp-sequencer-zoom'],
            (names) => {
                readOptions(c);
                if (names.includes('data-kp-sequencer-zoom')) c.zoom = sequencerClampZoom(Number(el.dataset.kpSequencerZoom) || 1);
                if (!c.press && !c.kb) {
                    c.tickKey = '';
                    paint(c);
                }
            },
        );
        if (typeof ResizeObserver !== 'undefined') {
            let last = 0;
            c.observer = new ResizeObserver(() => {
                const width = c.plot.clientWidth;
                if (width === last) return;
                last = width;
                window.cancelAnimationFrame(c.frameTimer);
                c.frameTimer = window.requestAnimationFrame(() => {
                    if (!c.press?.moved) afterLayout(c);
                });
            });
            c.observer.observe(c.plot);
        }
        undo.push(() => {
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', keydown);
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', cancel);
            el.removeEventListener('focusin', focusin);
            el.removeEventListener('focusout', focusout);
            c.scroll.removeEventListener('wheel', wheel);
            window.clearTimeout(c.scrollTimer);
            window.cancelAnimationFrame(c.frameTimer);
            stopOptions();
            c.observer?.disconnect();
            c.busy?.close();
            sequencers.delete(el);
        });
    }
    return () => undo.splice(0).forEach((off) => off());
}

/**
 * Give the sequencer its items and lanes. Items are kept by id: a bar that stays is the same element, so a refresh keeps focus and
 * selection. Without `lanes` the lanes already given stay; a lane an item names that no lane does is added with its id as its
 * name. An edit in progress is not disturbed: the set is applied when it ends. No event: the page asked.
 * @param {Element} el
 * @param {Partial<SequencerItem>[]} items
 * @param {SequencerLane[]} [lanes]
 */
export function setSequencerItems(el, items, lanes) {
    const c = sequencers.get(el);
    if (!c) return;
    if (c.press || c.kb) {
        c.pending = { items, lanes };
        return;
    }
    apply(c, items, lanes);
}

/**
 * The items as the page last saw them: `{ id, lane, start, duration, with }` each, in the sequencer's unit.
 * @param {Element} el
 * @returns {SequencerChangeItem[]}
 */
export function getSequencerItems(el) {
    const c = sequencers.get(el);
    return c ? outItems(c, c.items) : [];
}

/**
 * The end of the last item, in the unit.
 * @param {Element} el
 * @returns {number}
 */
export function getSequencerTotal(el) {
    const c = sequencers.get(el);
    return c ? sequencerTotalOf(c.items) : 0;
}

/**
 * The state of the whole: `loading` (the busy card), `empty`, `error` (the plate, with its Retry as `kp-sequencer-retry`), `ready`.
 * `words` is the plate's title, `text` its sentence.
 * @param {Element} el
 * @param {SequencerState} state
 * @param {string} [words]
 * @param {{ text?: string, art?: Node | string | null }} [more]
 */
export function setSequencerState(el, state, words = '', { text = '', art = null } = {}) {
    const c = sequencers.get(el);
    if (!c) return;
    c.state = state;
    c.stateWords = words;
    c.stateText = text;
    c.stateArt = art;
    if (c.press || c.kb) cancelEdit(c, 'quiet');
    paint(c, { fit: false });
}

/**
 * Put the line for now at a point of the plan, in the unit; null takes it away.
 * @param {Element} el
 * @param {number | null} at
 */
export function setSequencerNow(el, at) {
    const c = sequencers.get(el);
    if (!c) return;
    c.nowAt = at === null || !Number.isFinite(at) ? null : at;
    paintWindow(c, c.view, false);
}

/**
 * Set the zoom (1 fits the plot to its box); the window keeps its middle.
 * @param {Element} el
 * @param {number} zoom
 */
export function setSequencerZoom(el, zoom) {
    const c = sequencers.get(el);
    if (c) setZoom(c, zoom);
}

/**
 * The zoom as it stands.
 * @param {Element} el
 * @returns {number}
 */
export function getSequencerZoom(el) {
    return sequencers.get(el)?.zoom ?? 1;
}

/**
 * Select an item (or none) as a click would; no change event.
 * @param {Element} el
 * @param {string | null} id
 */
export function setSequencerSelection(el, id) {
    const c = sequencers.get(el);
    if (!c) return;
    c.selected = id && c.items.some((i) => i.id === id) ? id : null;
    c.focusId = c.selected ?? c.focusId;
    paint(c, { fit: false });
}
