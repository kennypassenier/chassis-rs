// Pure ordering: the rows in the order things must go, cycles set apart, and the rows as plain text.

/** @typedef {import('../deplist.js').DepItem} DepItem */
/** @typedef {import('../deplist.js').DepRow} DepRow */

/**
 * The rows in the order things must go: a row stands after the rows of the things it needs (a thing's depth is one more than the
 * deepest thing it needs that is itself listed as needing something), numbered from 1. Rows in a cycle are not ordered: they
 * come back as `cycles`, each a path of names.
 *
 * @param {readonly DepItem[]} items
 * @param {{ numbers?: boolean }} [options]
 * @returns {{ rows: DepRow[], cycles: string[][] }}
 */
export function orderDependencies(items, { numbers = true } = {}) {
    /** @type {Map<string, string[]>} */
    const needs = new Map();
    for (const { from, to } of items) needs.set(from, [...(needs.get(from) ?? []), to]);
    /** @type {Map<string, number>} */
    const depth = new Map();
    /** @type {Set<string>} */
    const onPath = new Set();
    /** @type {Set<string>} */
    const inCycle = new Set();
    /** @type {string[][]} */
    const cycles = [];
    /** @param {string} name @param {string[]} path @returns {number} */
    const walk = (name, path) => {
        if (depth.has(name)) return /** @type {number} */ (depth.get(name));
        if (onPath.has(name)) {
            const loop = path.slice(path.indexOf(name));
            if (!loop.some((n) => inCycle.has(n))) cycles.push(loop);
            for (const n of loop) inCycle.add(n);
            return 0;
        }
        onPath.add(name);
        let deepest = -1;
        for (const to of needs.get(name) ?? []) deepest = Math.max(deepest, needs.has(to) ? walk(to, [...path, name]) : -1);
        onPath.delete(name);
        depth.set(name, deepest + 1);
        return deepest + 1;
    };
    for (const name of needs.keys()) walk(name, []);
    const whole = items.map((item, at) => ({ item, at, d: depth.get(item.from) ?? 0, cyc: inCycle.has(item.from) && inCycle.has(item.to) }));
    const ordered = whole.filter((r) => !r.cyc);
    if (numbers) ordered.sort((a, b) => a.d - b.d || a.at - b.at);
    return { rows: ordered.map((r, i) => ({ item: r.item, number: numbers ? i + 1 : null })), cycles };
}

/** The rows as plain text, one per line: "paperless -> postgres". @param {readonly DepItem[]} items */
export const depText = (items) => items.map((i) => `${i.from} -> ${i.to}`).join('\n');
