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

import { getStrings } from './strings.js';
import { paintRemembered, treeItemId } from './remember.js';

const TREE = '[data-kp-tree]';
const REORDER = '[data-kp-reorder]';
const SPLIT = '[data-kp-split]';

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

/** @type {WeakMap<Element, TreeHandle | ReorderHandle | SplitHandle>} */
const handles = new WeakMap();
/** The handle for an attached tree, reorder list or split pane. @param {Element} element */
export function structure(element) {
    return handles.get(element) ?? null;
}

/**
 * @param {ParentNode} root
 * @param {{ typeahead?: boolean, typeaheadMs?: number, clickToggles?: boolean, selectable?: boolean, reorderPointer?: boolean, splitStep?: number, splitLargeStep?: number, collapseOnDoubleClick?: boolean }} [options]
 *   Defaults; per element as data-attributes: `data-kp-typeahead="false"`, `data-kp-click="select"`, `data-kp-selectable`, `data-kp-pointer="false"`, `data-kp-step`, `data-kp-large-step`, `data-kp-orientation="horizontal"`, `data-kp-collapse`.
 * @returns {(() => void) & { handles: (TreeHandle | ReorderHandle | SplitHandle)[] }} detach
 */
export function attachStructure(
    root = document,
    {
        typeahead = true,
        typeaheadMs = 500,
        clickToggles = true,
        selectable = false,
        reorderPointer = true,
        splitStep = 2,
        splitLargeStep = 10,
        collapseOnDoubleClick = false,
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {(TreeHandle | ReorderHandle | SplitHandle)[]} */
    const created = [];

    // --- Tree [TH45] ---------------------------------------------------
    for (const element of root.querySelectorAll(TREE)) {
        const tree = /** @type {HTMLElement} */ (element);
        if (tree.dataset.kpTreeAttached !== undefined) continue;
        tree.dataset.kpTreeAttached = '';
        // Which branches were open, when the tree asked to be remembered
        // [Kenny, 2026-09-16]. Painted before the first read below, so the
        // starting state is the markup either way.
        const memory = paintRemembered(tree, 'tree');
        const finds = tree.dataset.kpTypeahead === undefined ? typeahead : tree.dataset.kpTypeahead !== 'false';
        const clickMode = tree.dataset.kpClick ?? (clickToggles ? 'toggle' : 'select');
        const selects = tree.dataset.kpSelectable !== undefined || selectable;
        const all = () => /** @type {HTMLElement[]} */ ([...tree.querySelectorAll('[role="treeitem"]')]);
        const before = all().map((item) => ({ item, tabindex: item.getAttribute('tabindex'), selected: item.getAttribute('aria-selected') }));
        /** @param {HTMLElement} item */
        const idOf = (item) => item.dataset.kpItem ?? item.id ?? (item.textContent ?? '').trim();
        /** @param {string} id */
        const byId = (id) => all().find((item) => idOf(item) === id) ?? null;

        /** One tab stop for the whole tree, arrows inside it — the ARIA practice. */
        const setStop = (/** @type {HTMLElement} */ item) => {
            for (const other of all()) other.setAttribute('tabindex', '-1');
            item.setAttribute('tabindex', '0');
            item.focus();
        };
        /** @param {HTMLElement} item @param {boolean} expanded */
        const setExpanded = (item, expanded) => {
            if (!item.hasAttribute('aria-expanded')) return;
            if ((item.getAttribute('aria-expanded') === 'true') === expanded) return;
            item.setAttribute('aria-expanded', String(expanded));
            if (memory !== null) {
                /** @type {Record<string, boolean>} */
                const branches = {};
                for (const branch of tree.querySelectorAll('[role="treeitem"][aria-expanded]'))
                    branches[treeItemId(branch)] = branch.getAttribute('aria-expanded') === 'true';
                memory.write('branches', branches);
            }
            tree.dispatchEvent(new CustomEvent(TREE_EXPAND_EVENT, { bubbles: true, detail: { item, id: idOf(item), expanded } }));
        };
        /** @param {HTMLElement | null} item */
        const setSelected = (item) => {
            for (const other of all()) {
                if (other === item) other.setAttribute('aria-selected', 'true');
                else if (other.getAttribute('aria-selected') === 'true') other.setAttribute('aria-selected', 'false');
            }
            if (item !== null) tree.dispatchEvent(new CustomEvent(TREE_SELECT_EVENT, { bubbles: true, detail: { item, id: idOf(item) } }));
        };

        const items = visibleItems(tree);
        if (items[0] !== undefined) {
            for (const item of all()) item.setAttribute('tabindex', '-1');
            items[0].setAttribute('tabindex', '0');
        }

        let buffer = '';
        let bufferTimer = 0;
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[role="treeitem"]'));
            if (item === null) return;
            const list = visibleItems(tree);
            const at = list.indexOf(item);
            const expandable = item.hasAttribute('aria-expanded');
            const open = item.getAttribute('aria-expanded') === 'true';

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    if (list[at + 1]) setStop(list[at + 1]);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    if (list[at - 1]) setStop(list[at - 1]);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    // Right opens a closed branch and steps into an open
                    // one — two jobs for one key, which is what makes a
                    // tree navigable without a mouse.
                    if (expandable && !open) setExpanded(item, true);
                    else if (list[at + 1]) setStop(list[at + 1]);
                    break;
                case 'ArrowLeft': {
                    event.preventDefault();
                    if (expandable && open) {
                        setExpanded(item, false);
                        break;
                    }
                    const parent = /** @type {HTMLElement | null} */ (item.parentElement?.closest('[role="treeitem"]') ?? null);
                    if (parent !== null) setStop(parent);
                    break;
                }
                case 'Home':
                    event.preventDefault();
                    if (list[0]) setStop(list[0]);
                    break;
                case 'End':
                    event.preventDefault();
                    if (list[list.length - 1]) setStop(list[list.length - 1]);
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (selects) setSelected(item);
                    else if (expandable) setExpanded(item, !open);
                    break;
                default:
                    // Typeahead: letters jump to the next item that starts
                    // with them, and keep accumulating for half a second
                    // so "do" finds Documents rather than Downloads. In a
                    // tree of forty folders this is the difference between
                    // usable and theoretical.
                    if (finds && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                        clearTimeout(bufferTimer);
                        buffer += event.key.toLowerCase();
                        bufferTimer = window.setTimeout(() => (buffer = ''), typeaheadMs);
                        const after = buffer.length > 1 ? list : [...list.slice(at + 1), ...list.slice(0, at + 1)];
                        const found = after.find((candidate) => (candidate.textContent ?? '').trim().toLowerCase().startsWith(buffer));
                        if (found !== undefined) {
                            event.preventDefault();
                            setStop(found);
                        }
                    }
                    break;
            }
        };

        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[role="treeitem"]'));
            if (item === null) return;
            const onChevron = /** @type {HTMLElement} */ (event.target).closest('[data-kp-tree-toggle]') !== null;
            if (clickMode === 'toggle' || onChevron) {
                if (item.hasAttribute('aria-expanded')) setExpanded(item, item.getAttribute('aria-expanded') !== 'true');
            }
            if (selects && (clickMode === 'select' || !onChevron)) setSelected(item);
            setStop(item);
        };

        tree.addEventListener('keydown', onKey);
        tree.addEventListener('click', onClick);
        /** @type {TreeHandle} */
        const handle = {
            element: tree,
            expand: (id, expanded = true) => {
                const item = byId(id);
                if (item) setExpanded(item, expanded);
            },
            expandAll: () => {
                for (const item of all()) setExpanded(item, true);
            },
            collapseAll: () => {
                for (const item of all()) setExpanded(item, false);
            },
            focusItem: (id) => {
                const item = byId(id);
                if (item) setStop(item);
            },
            select: (id) => setSelected(id === null ? null : byId(id)),
            selected: () => {
                const item = all().find((i) => i.getAttribute('aria-selected') === 'true');
                return item ? idOf(item) : null;
            },
        };
        handles.set(tree, handle);
        created.push(handle);
        cleanups.push(() => {
            clearTimeout(bufferTimer);
            tree.removeEventListener('keydown', onKey);
            tree.removeEventListener('click', onClick);
            for (const b of before) {
                if (b.tabindex === null) b.item.removeAttribute('tabindex');
                else b.item.setAttribute('tabindex', b.tabindex);
                if (b.selected === null) b.item.removeAttribute('aria-selected');
                else b.item.setAttribute('aria-selected', b.selected);
            }
            handles.delete(tree);
            delete tree.dataset.kpTreeAttached;
        });
    }

    // --- Reorder [TH46] ------------------------------------------------
    for (const element of root.querySelectorAll(REORDER)) {
        const list = /** @type {HTMLElement} */ (element);
        if (list.dataset.kpReorderAttached !== undefined) continue;
        list.dataset.kpReorderAttached = '';
        const pointer = list.dataset.kpPointer === undefined ? reorderPointer : list.dataset.kpPointer !== 'false';
        const original = [...list.children];
        let live = /** @type {HTMLElement | null} */ (list.querySelector('[data-kp-reorder-status]'));
        let madeLive = false;
        if (live === null) {
            live = document.createElement('span');
            live.className = 'kp-sr-only';
            live.setAttribute('role', 'status');
            live.setAttribute('aria-live', 'polite');
            live.dataset.kpReorderStatus = '';
            list.after(live);
            madeLive = true;
        }

        const order = () => [...list.children].map((child) => /** @type {HTMLElement} */ (child).dataset.kpItem ?? '');
        /** @param {HTMLElement} item @param {number} from @param {number} to */
        const announce = (item, from, to) => {
            const s = getStrings();
            const name = item.dataset.kpLabel ?? item.querySelector('[data-kp-item-label]')?.textContent?.trim() ?? item.dataset.kpItem ?? '';
            // In words, and not only by moving: a list that reorders
            // silently is one a screen reader user cannot arrange.
            if (live) live.textContent = s.reorderMoved(name, to + 1, list.children.length);
            list.dispatchEvent(
                new CustomEvent(REORDER_EVENT, { bubbles: true, detail: { order: order(), id: item.dataset.kpItem ?? '', from, to } }),
            );
        };
        /** @param {HTMLElement} item @param {number} to */
        const moveTo = (item, to) => {
            const children = [...list.children];
            const from = children.indexOf(item);
            const target = Math.max(0, Math.min(children.length - 1, to));
            if (from === -1 || from === target) return;
            const ref = children[target];
            if (target < from) list.insertBefore(item, ref ?? null);
            else list.insertBefore(item, ref?.nextSibling ?? null);
            announce(item, from, target);
        };

        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const handle = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-handle]'));
            if (handle === null) return;
            const item = handle.closest('[data-kp-item]');
            if (!(item instanceof HTMLElement)) return;
            const at = [...list.children].indexOf(item);
            /** @type {Record<string, number>} */
            const targets = { ArrowUp: at - 1, ArrowDown: at + 1, Home: 0, End: list.children.length - 1 };
            const to = targets[event.key];
            if (to === undefined) return;
            event.preventDefault();
            moveTo(item, to);
            // Focus follows the item, not the position: losing focus after
            // every move is what makes keyboard reordering unusable.
            handle.focus();
        };

        // The pointer route: drag by the handle, drop between siblings.
        // The move and release are heard on the window, not on the handle:
        // moving the row in the DOM detaches the handle for a moment, which
        // releases its pointer capture, and the first version then stopped
        // hearing the pointer after one row [held-60].
        /** @type {(() => void) | null} */
        let endDrag = null;
        /** @param {PointerEvent} event */
        const onPointerDown = (event) => {
            if (!pointer || event.button !== 0) return;
            const handle = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-kp-handle]'));
            const item = handle?.closest('[data-kp-item]');
            if (!handle || !(item instanceof HTMLElement) || item.parentElement !== list) return;
            event.preventDefault();
            endDrag?.();
            const pointerId = event.pointerId;
            item.dataset.kpDragging = '';
            /** @param {PointerEvent} move */
            const onMove = (move) => {
                if (move.pointerId !== pointerId) return;
                for (const sibling of list.children) {
                    if (sibling === item) continue;
                    const box = sibling.getBoundingClientRect();
                    if (move.clientY >= box.top && move.clientY <= box.bottom) {
                        const children = [...list.children];
                        moveTo(item, children.indexOf(sibling));
                        break;
                    }
                }
            };
            /** @param {PointerEvent} [up] */
            const onUp = (up) => {
                if (up && up.pointerId !== pointerId) return;
                delete item.dataset.kpDragging;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                endDrag = null;
            };
            endDrag = onUp;
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        };

        list.addEventListener('keydown', onKey);
        list.addEventListener('pointerdown', onPointerDown);
        /** @type {ReorderHandle} */
        const handle = {
            element: list,
            order,
            setOrder: (ids) => {
                for (const id of ids) {
                    const item = /** @type {HTMLElement | null} */ (list.querySelector(`[data-kp-item="${CSS.escape(id)}"]`));
                    if (item) list.append(item);
                }
                list.dispatchEvent(new CustomEvent(REORDER_EVENT, { bubbles: true, detail: { order: order(), id: '', from: -1, to: -1 } }));
            },
        };
        handles.set(list, handle);
        created.push(handle);
        cleanups.push(() => {
            list.removeEventListener('keydown', onKey);
            list.removeEventListener('pointerdown', onPointerDown);
            endDrag?.();
            list.replaceChildren(...original);
            if (madeLive) live?.remove();
            handles.delete(list);
            delete list.dataset.kpReorderAttached;
        });
    }

    // --- Split pane [TH55] ---------------------------------------------
    for (const element of root.querySelectorAll(SPLIT)) {
        const split = /** @type {HTMLElement} */ (element);
        if (split.dataset.kpSplitAttached !== undefined) continue;
        split.dataset.kpSplitAttached = '';
        // Where the divider was left, when the pane asked to be remembered
        // [Kenny, 2026-09-16]. The painter writes aria-valuenow, which is
        // where the starting position is read from three lines below.
        const memory = paintRemembered(split, 'split');
        const separator = /** @type {HTMLElement | null} */ (split.querySelector('[role="separator"]'));
        if (separator === null) continue;
        // A separator between left and right is "vertical" in ARIA terms;
        // a top/bottom split says data-kp-orientation="horizontal".
        const horizontal = (split.dataset.kpOrientation ?? separator.getAttribute('aria-orientation') ?? 'vertical') === 'horizontal';
        const step = Number.parseInt(split.dataset.kpStep ?? '', 10) || splitStep;
        const largeStep = Number.parseInt(split.dataset.kpLargeStep ?? '', 10) || splitLargeStep;
        const collapses = split.dataset.kpCollapse !== undefined || collapseOnDoubleClick;

        const min = Number.parseInt(separator.getAttribute('aria-valuemin') ?? '10', 10);
        const max = Number.parseInt(separator.getAttribute('aria-valuemax') ?? '90', 10);
        const initial = Number.parseInt(separator.getAttribute('aria-valuenow') ?? '50', 10);
        let value = initial;
        let lastOpen = initial;
        const hadVar = split.style.getPropertyValue('--kp-split');

        /** @param {number} next */
        const setValue = (next) => {
            value = Math.max(min, Math.min(max, Math.round(next)));
            split.style.setProperty('--kp-split', `${value}%`);
            // The value lives in aria-valuenow, not only in the style: a
            // separator that moves silently is a separator only a mouse
            // can use.
            separator.setAttribute('aria-valuenow', String(value));
            memory?.write('value', value);
            split.dispatchEvent(new CustomEvent(SPLIT_EVENT, { bubbles: true, detail: { value } }));
        };
        setValue(value);

        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const delta = event.shiftKey ? largeStep : step;
            const less = horizontal ? 'ArrowUp' : 'ArrowLeft';
            const more = horizontal ? 'ArrowDown' : 'ArrowRight';
            if (event.key === less) setValue(value - delta);
            else if (event.key === more) setValue(value + delta);
            else if (event.key === 'Home') setValue(min);
            else if (event.key === 'End') setValue(max);
            else return;
            event.preventDefault();
        };

        /** @param {PointerEvent} event */
        const onPointerDown = (event) => {
            separator.setPointerCapture(event.pointerId);
            const move = (/** @type {PointerEvent} */ moved) => {
                const box = split.getBoundingClientRect();
                setValue(horizontal ? ((moved.clientY - box.top) / box.height) * 100 : ((moved.clientX - box.left) / box.width) * 100);
            };
            const up = () => {
                separator.removeEventListener('pointermove', move);
                separator.removeEventListener('pointerup', up);
                separator.removeEventListener('pointercancel', up);
            };
            separator.addEventListener('pointermove', move);
            separator.addEventListener('pointerup', up);
            // A cancelled drag leaked its listeners in the first version.
            separator.addEventListener('pointercancel', up);
        };
        const onDoubleClick = () => {
            if (!collapses) return;
            // Double-click folds the first pane away and back again.
            if (value > min) {
                lastOpen = value;
                setValue(min);
            } else setValue(lastOpen);
        };

        separator.addEventListener('keydown', onKey);
        separator.addEventListener('pointerdown', onPointerDown);
        separator.addEventListener('dblclick', onDoubleClick);
        /** @type {SplitHandle} */
        const handle = { element: split, value: () => value, setValue };
        handles.set(split, handle);
        created.push(handle);
        cleanups.push(() => {
            separator.removeEventListener('keydown', onKey);
            separator.removeEventListener('pointerdown', onPointerDown);
            separator.removeEventListener('dblclick', onDoubleClick);
            separator.setAttribute('aria-valuenow', String(initial));
            if (hadVar === '') split.style.removeProperty('--kp-split');
            else split.style.setProperty('--kp-split', hadVar);
            handles.delete(split);
            delete split.dataset.kpSplitAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
