// How the graph's names break into lines, the room tried for names beside the ring, and the overlap count of drawn nodes.

/**
 * The room tried, in order, for names beside the ring at a phone width [graph-1020]: the picture as tall as ever, then taller; on each
 * height the ring as wide as ever, then a little narrower or wider; on each width the ring unturned, then turned a quarter step at a time.
 */
export const SIDE_ROOM = [1, 1.1, 1.2, 1.3, 1.4].flatMap((height) =>
    [1, 0.9, 1.1, 0.8, 1.2].flatMap((stretch) => [0, 0.25, 0.5, 0.75].map((phase) => ({ height, stretch, phase }))),
);
/** How many pairs of node groups (a node and its name) of a drawn world come closer than 3 px? @param {SVGGElement} world */
export function groupsTouching(world) {
    const boxes = [...world.querySelectorAll('.kp-graph__node')].map((n) => /** @type {SVGGraphicsElement} */ (n).getBBox());
    const gap = 3;
    let pairs = 0;
    for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1))
            if (a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap) pairs += 1;
    return pairs;
}
/**
 * A name on as few centred lines as keep each within `target` [graph-1020]: broken after a hyphen or at a space, and of all the ways
 * to break it into that many lines the one whose widest line is narrowest, so the lines are as even as the name allows. A name that
 * fits, or has no break point, is one line. `widthOf(text)` is the width of a piece as drawn.
 * @param {string} label
 * @param {number} target
 * @param {(text: string) => number} widthOf
 * @returns {string[]}
 */
export function graphLabelLines(label, target, widthOf) {
    if (widthOf(label) <= target) return [label];
    const pieces = label.split(/(?<=[-_/ ])/);
    if (pieces.length < 2) return [label];
    const join = (/** @type {number} */ from, /** @type {number} */ to) => pieces.slice(from, to).join('').trimEnd();
    const width = (/** @type {number} */ from, /** @type {number} */ to) => widthOf(join(from, to));
    // The fewest lines: take pieces while they fit.
    let rows = 1;
    for (let from = 0, to = 1; to <= pieces.length; to += 1) {
        if (to - from > 1 && width(from, to) > target) {
            rows += 1;
            from = to - 1;
        }
    }
    rows = Math.min(rows, pieces.length);
    // Of the ways to cut `pieces` into `rows` lines, the one with the narrowest widest line (pieces are few, so every way is tried).
    /** @type {(from: number, left: number) => { widest: number, cuts: number[] }} */
    const cut = (from, left) => {
        if (left === 1) return { widest: width(from, pieces.length), cuts: [] };
        /** @type {{ widest: number, cuts: number[] }} */
        let best = { widest: Infinity, cuts: [] };
        for (let to = from + 1; to <= pieces.length - (left - 1); to += 1) {
            const rest = cut(to, left - 1);
            const widest = Math.max(width(from, to), rest.widest);
            if (widest < best.widest) best = { widest, cuts: [to, ...rest.cuts] };
        }
        return best;
    };
    const { cuts } = cut(0, rows);
    const edges = [0, ...cuts, pieces.length];
    return edges.slice(1).map((to, i) => join(edges[i], to));
}
