// What one draw knows: the matrix's options, the nodes of both columns and the relation between them.

import { getStrings } from '../strings.js';
import { USES_COLLAPSE_BELOW } from './constants.js';
import { attr } from './dom.js';
import { usesRelation } from './relation.js';

/** @typedef {import('../uses-map.js').UsesNode} UsesNode */
/** @typedef {import('../uses-map.js').UsesLine} UsesLine */
/** @typedef {import('./memory.js').UsesMemory} UsesMemory */

/** How many skeleton nodes a loading map shows per column when the spec gives no count. */
const SKELETON_NODES = 4;

/**
 * The model of one draw.
 * @typedef {object} UsesModel
 * @property {HTMLElement} el
 * @property {Document} doc
 * @property {ReturnType<typeof getStrings>} strings
 * @property {any} spec
 * @property {string} state
 * @property {boolean} loading
 * @property {string} side
 * @property {'curve' | 'elbow' | 'straight'} shape
 * @property {string} lightMode
 * @property {boolean} countOn
 * @property {boolean} hideEmpty
 * @property {number} collapseBelow
 * @property {UsesMemory} memory
 * @property {UsesNode[]} sources
 * @property {UsesNode[]} users
 * @property {Map<string, string[]>} uses
 * @property {Map<string, string[]>} usedBy
 * @property {Map<string, UsesLine>} lineInfo
 * @property {Map<string, UsesNode>} byKey
 */

/**
 * The options a matrix carries as markup, each with its default [KT6].
 * @param {HTMLElement} el
 */
export function readOptions(el) {
    return {
        side: attr(el, 'data-kp-lines-side', 'sources-left'),
        shape: /** @type {'curve' | 'elbow' | 'straight'} */ (attr(el, 'data-kp-lines-shape', 'curve')),
        lightMode: attr(el, 'data-kp-lines-light', 'both'),
        countOn: attr(el, 'data-kp-lines-count', 'on') !== 'off',
        hideEmpty: attr(el, 'data-kp-lines-empty-sources', 'show') === 'hide',
        collapseBelow: Number(attr(el, 'data-kp-lines-collapse-below', String(USES_COLLAPSE_BELOW))) || USES_COLLAPSE_BELOW,
    };
}

/** The nodes of a column; a loading map with none shows skeleton nodes. @param {readonly UsesNode[] | undefined} given @param {boolean} loading @param {string} prefix @param {number | undefined} count */
const columnNodes = (given, loading, prefix, count) => {
    const nodes = [...(given ?? [])];
    if (loading && nodes.length === 0) return Array.from({ length: count ?? SKELETON_NODES }, (_, i) => ({ key: `${prefix}${i}`, label: '' }));
    return nodes;
};

/**
 * The model of a ready, loading or empty draw.
 * @param {HTMLElement} el @param {any} spec @param {UsesMemory} memory
 * @returns {UsesModel}
 */
export function readModel(el, spec, memory) {
    const state = spec.state ?? 'ready';
    const loading = state === 'loading';
    const options = readOptions(el);
    let sources = columnNodes(spec.rows, loading, 's', spec.skeleton);
    const users = columnNodes(spec.columns, loading, 'u', spec.skeleton);
    // A loading map has no relation yet, and an empty or failed one draws a plate: the page's `cell` is asked only for a map of lines.
    const plate = state === 'empty' || state === 'error';
    const { uses, usedBy, lines: lineInfo } = loading || plate ? { uses: new Map(), usedBy: new Map(), lines: new Map() } : usesRelation({ rows: sources, columns: users, cell: spec.cell });
    if (options.hideEmpty) sources = sources.filter((s) => (uses.get(s.key)?.length ?? 0) > 0);
    const byKey = new Map([...sources, ...users].map((n) => [n.key, n]));
    return { el, doc: el.ownerDocument, strings: getStrings(), spec, state, loading, ...options, memory, sources, users, uses, usedBy, lineInfo, byKey };
}

/**
 * The words of the nodes on the far end of a node's lines, each with its line's label: "Deloitte (writes here), Takto".
 * @param {UsesModel} m @param {string[]} keys @param {string} self @param {'source' | 'user'} kind
 */
export function namesOf(m, keys, self, kind) {
    return keys
        .map((k) => {
            const label = m.lineInfo.get(kind === 'source' ? `${self}>${k}` : `${k}>${self}`)?.label;
            return `${m.byKey.get(k)?.label ?? k}${label ? ` (${label})` : ''}`;
        })
        .join(', ');
}
