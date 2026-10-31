// The selectors and events of the tree, the reorder list and the split pane, the options they share, and the walk of a
// tree's visible items.

/** The trees, reorder lists and split panes this module wires. */
export const TREE = '[data-kp-tree]';
export const REORDER = '[data-kp-reorder]';
export const SPLIT = '[data-kp-split]';

/** Fired on a tree when a branch opens or closes: `{ item, id, expanded }`. */
export const TREE_EXPAND_EVENT = 'kp-tree-expand';
/** Fired on a tree when an item is selected: `{ item, id }`. */
export const TREE_SELECT_EVENT = 'kp-tree-select';
/** Fired on a reorder list when the order changed. A contract value [TH26]: `{ order, id, from, to }`. */
export const REORDER_EVENT = 'kp-reorder';
/** Fired on a split pane when the divider moved; the detail carries the percentage. */
export const SPLIT_EVENT = 'kp-split';

/**
 * The tree's visible items, in the order a reader meets them.
 *
 * Collapsed branches are excluded, because Down should go to the next
 * thing you can see — walking into a closed folder is the bug that makes
 * a tree feel broken rather than merely awkward.
 *
 * @param {HTMLElement} tree
 */
export function visibleItems(tree) {
    return /** @type {HTMLElement[]} */ (
        [...tree.querySelectorAll('[role="treeitem"]')].filter((item) => {
            /** @type {HTMLElement | null} */
            let parent = item.parentElement;
            while (parent !== null && parent !== tree) {
                if (parent.getAttribute('role') === 'group' && parent.parentElement?.getAttribute('aria-expanded') === 'false') return false;
                parent = parent.parentElement;
            }
            return true;
        })
    );
}

/**
 * The defaults attachStructure() takes; each can be set per element with a data attribute.
 * @typedef {{ typeahead: boolean, typeaheadMs: number, clickToggles: boolean, selectable: boolean, reorderPointer: boolean, splitStep: number, splitLargeStep: number, collapseOnDoubleClick: boolean }} StructureOptions
 */

/** @type {StructureOptions} */
export const DEFAULTS = Object.freeze({
    typeahead: true,
    /** How long typed letters keep adding up before the search starts again [ms]. */
    typeaheadMs: 500,
    clickToggles: true,
    selectable: false,
    reorderPointer: true,
    /** The split's arrow step and its Shift step [percent]. */
    splitStep: 2,
    splitLargeStep: 10,
    collapseOnDoubleClick: false,
});
