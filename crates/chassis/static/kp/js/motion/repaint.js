// Repaint tracking: which added elements only repaint what was there, and what one batch of records says before any arrives.

import { ARRIVE_KEYS, SKELETON } from './constants.js';

/**
 * @typedef {{ getAttribute: (name: string) => string | null, tagName: string, className: string, id?: string, nodeType: number, matches?: (selector: string) => boolean, querySelector?: (selector: string) => unknown }} RepaintNode
 */

/**
 * The added elements of one batch of changes that only repaint what was
 * there [port spec G; the homelab dashboard's `repaints()`, moved here]:
 * an element is a repaint when its parent lost, in the same batch, an
 * element with its key (the first of `keys` it carries) or, with no key,
 * one more element of its tag and class than it already took back. An
 * element added where a loading skeleton left (`.kp-skeleton`,
 * `[data-kp-skeleton]`) is not news either: it is the data the skeleton
 * waited for. Everything else is new content.
 *
 * Measured by the dashboard (8 quiet seconds per page): without this, a
 * live refresh that redrew its rows replayed the arrival on 158 cells of
 * one page, 112 on another and 72 on a third, though nothing new had come.
 *
 * @param {Iterable<{ type: string, target: unknown, addedNodes: ArrayLike<any>, removedNodes: ArrayLike<any> }>} records
 * @param {{ keys?: readonly string[] }} [options]
 * @returns {Set<any>} the added elements that are repaints
 */
export function repaintedIn(records, { keys = ARRIVE_KEYS } = {}) {
    const list = [...records].filter((r) => r.type === 'childList');
    /** @type {Map<unknown, { keys: Set<string>, sigs: Map<string, number>, skeleton: boolean }>} */
    const gone = new Map();
    const keyOf = (/** @type {RepaintNode} */ e) => {
        for (const name of keys) {
            const value = name === 'id' ? e.getAttribute('id') || e.id || null : e.getAttribute(name);
            if (value) return `${name}=${value}`;
        }
        return null;
    };
    const sigOf = (/** @type {RepaintNode} */ e) => `${e.tagName}.${e.className}`;
    const skeletal = (/** @type {RepaintNode} */ e) =>
        (typeof e.matches === 'function' && e.matches(SKELETON)) || (typeof e.querySelector === 'function' && e.querySelector(SKELETON) !== null);
    for (const r of list)
        for (const n of Array.from(r.removedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target) ?? { keys: new Set(), sigs: new Map(), skeleton: false };
            gone.set(r.target, g);
            const k = keyOf(n);
            if (k) g.keys.add(k);
            g.sigs.set(sigOf(n), (g.sigs.get(sigOf(n)) ?? 0) + 1);
            if (skeletal(n)) g.skeleton = true;
        }
    /** @type {Set<any>} */
    const out = new Set();
    for (const r of list)
        for (const n of Array.from(r.addedNodes)) {
            if (n?.nodeType !== 1) continue;
            const g = gone.get(r.target);
            if (!g) continue;
            if (g.skeleton) {
                out.add(n);
                continue;
            }
            const k = keyOf(n);
            const left = g.sigs.get(sigOf(n)) ?? 0;
            if (k ? g.keys.has(k) : left > 0) {
                out.add(n);
                if (!k) g.sigs.set(sigOf(n), left - 1);
            }
        }
    return out;
}

/**
 * What one batch of records says before any arrives: which targets were hidden before it, and which nodes it took out.
 * @param {MutationRecord[]} records
 */
export function batchOf(records) {
    /** @type {Map<Node, boolean>} */
    const hiddenBefore = new Map();
    /** @type {Set<Node>} */
    const moved = new Set();
    for (const record of records) {
        if (record.type === 'attributes' && !hiddenBefore.has(record.target)) hiddenBefore.set(record.target, record.oldValue !== null);
        if (record.type === 'childList') for (const node of record.removedNodes) moved.add(node);
    }
    return { hiddenBefore, moved };
}
