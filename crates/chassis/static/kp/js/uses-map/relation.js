// The pure part of the lines view: the relation of a spec as lists, and the path of one line.

/** @typedef {import('../uses-map.js').UsesNode} UsesNode */
/** @typedef {import('../uses-map.js').UsesLine} UsesLine */

/** The tones a line takes. */
const TONES = ['ok', 'warn', 'bad', 'muted'];

/**
 * The relation of a spec, as lists. Pure.
 * @param {{ rows?: readonly UsesNode[], columns?: readonly UsesNode[], cell?: (row: string, column: string) => unknown }} spec
 * @returns {{ uses: Map<string, string[]>, usedBy: Map<string, string[]>, lines: Map<string, UsesLine> }} `lines` by `"<row>><column>"`
 */
export function usesRelation(spec) {
    /** @type {Map<string, string[]>} */
    const uses = new Map();
    /** @type {Map<string, string[]>} */
    const usedBy = new Map();
    /** @type {Map<string, UsesLine>} */
    const lines = new Map();
    for (const row of spec.rows ?? []) uses.set(row.key, []);
    for (const column of spec.columns ?? []) usedBy.set(column.key, []);
    for (const row of spec.rows ?? []) {
        for (const column of spec.columns ?? []) {
            const hit = spec.cell?.(row.key, column.key);
            if (!hit || /** @type {any} */ (hit).tone === 'none' || /** @type {any} */ (hit).tone === 'self') continue;
            uses.get(row.key)?.push(column.key);
            usedBy.get(column.key)?.push(row.key);
            const line = /** @type {any} */ (hit);
            lines.set(`${row.key}>${column.key}`, {
                ...(TONES.includes(line.tone) ? { tone: line.tone } : {}),
                ...(typeof line.label === 'string' && line.label.trim() ? { label: line.label.trim() } : {}),
            });
        }
    }
    return { uses, usedBy, lines };
}

/**
 * The path of one line between two points. Pure.
 * @param {'curve' | 'elbow' | 'straight'} shape @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 */
export function usesPath(shape, x1, y1, x2, y2) {
    const mid = (x1 + x2) / 2;
    if (shape === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
    if (shape === 'elbow') return `M${x1} ${y1} H${mid} V${y2} H${x2}`;
    return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}
