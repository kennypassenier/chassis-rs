// Tree, reorder and split pane, framework-free [TH45, TH46, TH55].
//
// Three structural controls that share one property: each is trivial with
// a mouse and each is where keyboard access usually stops. So the
// keyboard is what the code is mostly about.
//
//   TH45  tree     arrows walk and open, Home/End jump, typeahead finds
//   TH46  reorder  a grab handle that moves an item with the arrow keys
//   TH55  split    a separator that resizes with the arrow keys
//
// None of them uses a drag library. Pointer dragging is the easy half and
// the platform gives it away; what a library would also give away is a
// keyboard story, and the ones that do it well do it exactly like this.
//
// Since 3.0.0 [KT6]: every change is an event a consumer can persist —
// the tree was entirely silent; each control has a handle (expand,
// select, setOrder, setValue); the split runs vertically too; the
// reorder moves with a pointer as well and announces the move in words;
// and detach restores what attach stamped, which the first version left
// on every treeitem.
//
// Since the controller split [closure-pattern B]: each control is one controller class, TreeControl, ReorderControl and
// SplitControl in js/structure/, on js/controller.js.

import { attachOne, controllerOf } from './controller.js';
import { ReorderControl } from './structure/reorder.js';
import { DEFAULTS, REORDER, SPLIT, TREE } from './structure/shared.js';
import { SplitControl } from './structure/split.js';
import { TreeControl } from './structure/tree.js';

export { TREE_EXPAND_EVENT, TREE_SELECT_EVENT, REORDER_EVENT, SPLIT_EVENT, visibleItems } from './structure/shared.js';

/**
 * @typedef {object} TreeHandle
 * @property {HTMLElement} element
 * @property {(id: string, expanded?: boolean) => void} expand
 * @property {() => void} expandAll
 * @property {() => void} collapseAll
 * @property {(id: string) => void} focusItem
 * @property {(id: string | null) => void} select
 * @property {() => string | null} selected
 */
/**
 * @typedef {object} ReorderHandle
 * @property {HTMLElement} element
 * @property {() => string[]} order
 * @property {(order: readonly string[]) => void} setOrder
 */
/**
 * @typedef {object} SplitHandle
 * @property {HTMLElement} element
 * @property {() => number} value
 * @property {(value: number) => void} setValue
 */

/** The handle for an attached tree, reorder list or split pane. @param {Element} element @returns {TreeHandle | ReorderHandle | SplitHandle | null} */
export function structure(element) {
    return (controllerOf(element, TreeControl) ?? controllerOf(element, ReorderControl) ?? controllerOf(element, SplitControl))?.handle ?? null;
}

/**
 * The three controls, in the order they are wired. An element that carries a control's attached mark is never wired twice.
 * @type {[string, typeof TreeControl | typeof ReorderControl | typeof SplitControl][]}
 */
const KINDS = [
    [TREE, TreeControl],
    [REORDER, ReorderControl],
    [SPLIT, SplitControl],
];

/**
 * @param {ParentNode} root
 * @param {{ typeahead?: boolean, typeaheadMs?: number, clickToggles?: boolean, selectable?: boolean, reorderPointer?: boolean, splitStep?: number, splitLargeStep?: number, collapseOnDoubleClick?: boolean }} [options]
 *   Defaults; per element as data-attributes: `data-kp-typeahead="false"`, `data-kp-click="select"`, `data-kp-selectable`, `data-kp-pointer="false"`, `data-kp-step`, `data-kp-large-step`, `data-kp-orientation="horizontal"`, `data-kp-collapse`.
 * @returns {(() => void) & { handles: (TreeHandle | ReorderHandle | SplitHandle)[] }} detach
 */
export function attachStructure(root = document, options = {}) {
    const o = { ...DEFAULTS, ...options };
    /** @type {(TreeControl | ReorderControl | SplitControl)[]} */
    const made = [];
    /** @type {(TreeHandle | ReorderHandle | SplitHandle)[]} */
    const created = [];
    for (const [selector, Kind] of KINDS) {
        for (const element of root.querySelectorAll(selector)) {
            if (!(element instanceof HTMLElement) || Kind.isAttached(element)) continue;
            const control = attachOne(element, /** @type {new (host: HTMLElement, options?: any) => TreeControl | ReorderControl | SplitControl} */ (Kind), o);
            if (!control) continue;
            made.push(control);
            if (control.handle) created.push(control.handle);
        }
    }
    const detach = () => {
        for (const control of made) control.destroy();
    };
    return Object.assign(detach, { handles: created });
}
