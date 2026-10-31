// The facet list: checkbox rows with a count and an "only" button
// [kpadopt2-tiles; the dashboard's `hl-opt`, the host log's Source and Level].
//
// Narrowing a list by one property (the source of a log line, a level, a
// status) is a column of checkboxes, each with how many items it would show,
// and a shortcut for the most common move: "only this one".
//
//   <div class="kp-facets" data-kp-facets data-kp-facets-all="Everything" role="group" aria-label="Source">
//     <ul class="kp-facets__list"></ul>
//     <p class="kp-facets__empty" hidden>No sources yet.</p>
//   </div>
//
//   setFacetItems(group, [{ value: 'HOST', label: 'Host', count: 120 }, …]);
//   group.addEventListener('kp-facet-change', (e) => show(e.detail.values));
//
// The rows are made by setFacetItems(), or written by hand as
// `li.kp-facet[data-value]` (see css/components.css for the parts): either way
// attachFacets() wires them.
//
// What it does:
//   - Each row is a real checkbox in a `<label>`; the "only" button is a
//     sibling of the label, never inside it (a control inside a label is a
//     second, hidden target). The checkbox is named by the row's name and
//     described by its count; "only" says which row it is for.
//   - "only" selects that row and unchecks every other; the "Everything" row
//     (`data-kp-facets-all`) checks every row, and shows a mixed state
//     (`indeterminate`) while only some are on.
//   - setFacetItems() reconciles by value and changes the rows in place: a row
//     that was there keeps its focus and its state, a new one is inserted at
//     its place, a gone one is removed. Nothing is rebuilt, so a log that
//     brings a new source every second never takes the keyboard away.
//   - A visually hidden `role="status"` region after the group says "Showing
//     only Host" or "Showing everything" after an "only" or an "Everything".
//
//   - A swatch can carry an identity pattern as well as a hue [kpadopt3]: the
//     item's `pattern` (or `data-kp-facet-pattern` on a hand-written
//     `.kp-facet__swatch`) is a seed, a name, from which a 5 by 5 pattern
//     mirrored about its middle column is drawn over the swatch's colour, the
//     same for the same name wherever it is drawn (identityCells()). So two
//     sources whose hues are close are still told apart, and the colour never
//     carries the identity alone.
//
// Every word it adds is in js/strings.js. Nothing runs on import.
//
// Each group is one FacetGroup controller (js/facets/controller.js, on js/controller.js); the rows, the page's calls and the pattern are in
// js/facets/rows.js, api.js and pattern.js, and the parts are listed in js/README.md.

import { attachAll } from './controller.js';
import { FacetGroup } from './facets/controller.js';
import { FACETS } from './facets/values.js';

export { FACETS, FACET_EVENT } from './facets/values.js';
export { identityCells } from './facets/pattern.js';
export { getFacetValues, setFacetValues, setFacetCounts, setFacetItems } from './facets/api.js';

/**
 * @typedef {object} FacetItem
 * @property {string} value what the row stands for
 * @property {string} label
 * @property {number | string | null} [count] shown at the end of the row; null leaves its place empty
 * @property {string} [swatch] a CSS colour for the small square before the name
 * @property {string} [pattern] a seed (a name) for an identity pattern drawn over the swatch [kpadopt3]; '' takes it away
 * @property {boolean} [checked] a new row is on when absent; a row that is already there keeps its state when absent
 * @property {boolean} [disabled] cannot be turned on or off, and has no "only"
 */

/**
 * Wire every facet group under `root`: the checkboxes, the "only" buttons and
 * the "Everything" row. Rows written later by setFacetItems() are covered
 * because the listeners are on the group.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachFacets(root = document) {
    return attachAll(root, FACETS, FacetGroup);
}
