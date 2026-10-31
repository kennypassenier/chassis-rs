// The tree [TH45]: arrows walk and open, Home/End jump, typeahead finds; one tab stop, selection, remembered branches.

import { Controller } from '../controller.js';
import { glideGroup, leavesState } from '../motion.js';
import { paintRemembered, treeItemId } from '../remember.js';
import { DEFAULTS, TREE_EXPAND_EVENT, TREE_SELECT_EVENT, visibleItems } from './shared.js';

/** @typedef {import('../structure.js').TreeHandle} TreeHandle */

/** @param {HTMLElement} item */
const idOf = (item) => item.dataset.kpItem ?? item.id ?? (item.textContent ?? '').trim();
/** @param {EventTarget | null} target */
const itemAt = (target) => /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (target).closest('[role="treeitem"]'));

/** The children of a branch, inside it or just after it. @param {HTMLElement} item @returns {HTMLElement | null} */
function groupOf(item) {
    const inside = item.querySelector(':scope > [role="group"]');
    if (inside instanceof HTMLElement) return inside;
    const next = item.nextElementSibling;
    return next instanceof HTMLElement && next.getAttribute('role') === 'group' ? next : null;
}

export class TreeControl extends Controller {
    /** Whether the element is already wired: it carries the mark connect() stamps. @param {HTMLElement} element */
    static isAttached(element) {
        return element.dataset.kpTreeAttached !== undefined;
    }

    /** @param {HTMLElement} tree @param {import('./shared.js').StructureOptions} [options] */
    constructor(tree, options = DEFAULTS) {
        super(tree, options);
        this.o = options;
        /** What attach found on each item, so detach can put it back. @type {{ item: HTMLElement, tabindex: string | null, selected: string | null }[]} */
        this.before = [];
        /** @type {ReturnType<typeof paintRemembered>} */
        this.memory = null;
        /** A bulk change (expand all) is applied at once: its groups would measure each other half-grown. */
        this.quiet = false;
        /** The letters typed so far, and the timer that clears them. */
        this.buffer = '';
        this.bufferTimer = 0;
        /** Whether typeahead is on, what a click does, and whether items are selected; set at attach. */
        this.finds = true;
        this.clickMode = 'toggle';
        this.selects = false;
        /** @type {TreeHandle} */
        this.handle = this.makeHandle();
    }

    connect() {
        const tree = this.host;
        tree.dataset.kpTreeAttached = '';
        // Which branches were open, when the tree asked to be remembered [Kenny, 2026-09-16]. Painted before the first read
        // below, so the starting state is the markup either way.
        this.memory = paintRemembered(tree, 'tree');
        // The options are read once, at attach, as they always were.
        this.finds = tree.dataset.kpTypeahead === undefined ? this.o.typeahead : tree.dataset.kpTypeahead !== 'false';
        this.clickMode = tree.dataset.kpClick ?? (this.o.clickToggles ? 'toggle' : 'select');
        this.selects = tree.dataset.kpSelectable !== undefined || this.o.selectable;
        this.before = this.all().map((item) => ({ item, tabindex: item.getAttribute('tabindex'), selected: item.getAttribute('aria-selected') }));
        const items = visibleItems(tree);
        if (items[0] !== undefined) {
            for (const item of this.all()) item.setAttribute('tabindex', '-1');
            items[0].setAttribute('tabindex', '0');
        }
        this.own(() => this.restore());
        this.listen(tree, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(tree, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
    }

    /** Put back what attach stamped on every item. */
    restore() {
        clearTimeout(this.bufferTimer);
        for (const b of this.before) {
            if (b.tabindex === null) b.item.removeAttribute('tabindex');
            else b.item.setAttribute('tabindex', b.tabindex);
            if (b.selected === null) b.item.removeAttribute('aria-selected');
            else b.item.setAttribute('aria-selected', b.selected);
        }
        delete this.host.dataset.kpTreeAttached;
    }

    all() {
        return /** @type {HTMLElement[]} */ ([...this.host.querySelectorAll('[role="treeitem"]')]);
    }
    /** @param {string} id */
    byId(id) {
        return this.all().find((item) => idOf(item) === id) ?? null;
    }

    /** One tab stop for the whole tree, arrows inside it — the ARIA practice. @param {HTMLElement} item */
    setStop(item) {
        for (const other of this.all()) other.setAttribute('tabindex', '-1');
        item.setAttribute('tabindex', '0');
        item.focus();
    }

    /** @param {HTMLElement} item @param {boolean} expanded */
    setExpanded(item, expanded) {
        if (!item.hasAttribute('aria-expanded')) return;
        if ((item.getAttribute('aria-expanded') === 'true') === expanded) return;
        const flip = () => item.setAttribute('aria-expanded', String(expanded));
        // A theme that lets states leave first (leavesState()) glides the branch's children open and shut, on the growth curve.
        const group = this.quiet || !leavesState(this.host) ? null : groupOf(item);
        if (group !== null) glideGroup(group, expanded, flip);
        else flip();
        this.remember();
        this.host.dispatchEvent(new CustomEvent(TREE_EXPAND_EVENT, { bubbles: true, detail: { item, id: idOf(item), expanded } }));
    }

    /** Write which branches are open, when the tree asked to be remembered. */
    remember() {
        if (this.memory === null) return;
        /** @type {Record<string, boolean>} */
        const branches = {};
        for (const branch of this.host.querySelectorAll('[role="treeitem"][aria-expanded]')) branches[treeItemId(branch)] = branch.getAttribute('aria-expanded') === 'true';
        this.memory.write('branches', branches);
    }

    /** @param {HTMLElement | null} item */
    setSelected(item) {
        for (const other of this.all()) {
            if (other === item) other.setAttribute('aria-selected', 'true');
            else if (other.getAttribute('aria-selected') === 'true') other.setAttribute('aria-selected', 'false');
        }
        if (item !== null) this.host.dispatchEvent(new CustomEvent(TREE_SELECT_EVENT, { bubbles: true, detail: { item, id: idOf(item) } }));
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const item = itemAt(event.target);
        if (item === null) return;
        const list = visibleItems(this.host);
        const at = list.indexOf(item);
        const expandable = item.hasAttribute('aria-expanded');
        const open = item.getAttribute('aria-expanded') === 'true';
        /** @type {Record<string, () => void>} */
        const keys = {
            ArrowDown: () => list[at + 1] && this.setStop(list[at + 1]),
            ArrowUp: () => list[at - 1] && this.setStop(list[at - 1]),
            // Right opens a closed branch and steps into an open one — two jobs for one key, which is what makes a tree
            // navigable without a mouse.
            ArrowRight: () => (expandable && !open ? this.setExpanded(item, true) : list[at + 1] && this.setStop(list[at + 1])),
            ArrowLeft: () => (expandable && open ? this.setExpanded(item, false) : this.toParent(item)),
            Home: () => list[0] && this.setStop(list[0]),
            End: () => list[list.length - 1] && this.setStop(list[list.length - 1]),
            Enter: () => (this.selects ? this.setSelected(item) : expandable && this.setExpanded(item, !open)),
        };
        keys[' '] = keys.Enter;
        const run = keys[event.key];
        if (run) {
            event.preventDefault();
            run();
        } else this.typeahead(event, list, at);
    }

    /** @param {HTMLElement} item */
    toParent(item) {
        const parent = /** @type {HTMLElement | null} */ (item.parentElement?.closest('[role="treeitem"]') ?? null);
        if (parent !== null) this.setStop(parent);
    }

    /**
     * Typeahead: letters jump to the next item that starts with them, and keep accumulating for half a second so "do" finds
     * Documents rather than Downloads. In a tree of forty folders this is the difference between usable and theoretical.
     * @param {KeyboardEvent} event @param {HTMLElement[]} list @param {number} at
     */
    typeahead(event, list, at) {
        if (!this.finds || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        clearTimeout(this.bufferTimer);
        this.buffer += event.key.toLowerCase();
        this.bufferTimer = window.setTimeout(() => (this.buffer = ''), this.o.typeaheadMs);
        const after = this.buffer.length > 1 ? list : [...list.slice(at + 1), ...list.slice(0, at + 1)];
        const found = after.find((candidate) => (candidate.textContent ?? '').trim().toLowerCase().startsWith(this.buffer));
        if (found === undefined) return;
        event.preventDefault();
        this.setStop(found);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const item = itemAt(event.target);
        if (item === null) return;
        const onChevron = /** @type {HTMLElement} */ (event.target).closest('[data-kp-tree-toggle]') !== null;
        if ((this.clickMode === 'toggle' || onChevron) && item.hasAttribute('aria-expanded')) this.setExpanded(item, item.getAttribute('aria-expanded') !== 'true');
        if (this.selects && (this.clickMode === 'select' || !onChevron)) this.setSelected(item);
        this.setStop(item);
    }

    /** @param {boolean} expanded */
    setAll(expanded) {
        this.quiet = true;
        for (const item of this.all()) this.setExpanded(item, expanded);
        this.quiet = false;
    }

    /** @returns {TreeHandle} */
    makeHandle() {
        return {
            element: this.host,
            expand: (id, expanded = true) => {
                const item = this.byId(id);
                if (item) this.setExpanded(item, expanded);
            },
            expandAll: () => this.setAll(true),
            collapseAll: () => this.setAll(false),
            focusItem: (id) => {
                const item = this.byId(id);
                if (item) this.setStop(item);
            },
            select: (id) => this.setSelected(id === null ? null : this.byId(id)),
            selected: () => {
                const item = this.all().find((i) => i.getAttribute('aria-selected') === 'true');
                return item ? idOf(item) : null;
            },
        };
    }
}
