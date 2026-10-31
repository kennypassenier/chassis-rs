// Keeping the count of every tab under a root drawn: now, and whenever an attribute of a count changes or a tab comes (TabCountRoot,
// one controller per attach).

import { Controller } from '../controller.js';
import { COUNT_ATTRIBUTES, TAB, drawTabCount } from './count.js';

/** The tabs that ask for a count: they carry a count or a count state. */
const ASKED = `${TAB}[data-kp-tab-count], ${TAB}[data-kp-tab-count-state]`;

/** @param {ParentNode} root @returns {Element[]} the tabs under `root` (and `root` itself) that ask for a count */
function askingTabs(root) {
    const found = /** @type {Element[]} */ ([]);
    if (root instanceof Element && root.matches(ASKED)) found.push(root);
    for (const tab of root.querySelectorAll(ASKED)) found.push(tab);
    return found;
}

/**
 * The tabs a batch of mutations changed or brought.
 * @param {MutationRecord[]} records @param {Window & typeof globalThis} view
 * @returns {Set<Element>}
 */
function changedTabs(records, view) {
    /** @type {Set<Element>} */
    const todo = new Set();
    for (const record of records) {
        if (record.type === 'attributes') {
            if (record.target instanceof view.Element && record.target.matches(TAB)) todo.add(record.target);
        } else
            for (const node of record.addedNodes)
                if (node instanceof view.Element) {
                    if (node.matches(ASKED)) todo.add(node);
                    for (const tab of node.querySelectorAll(ASKED)) todo.add(tab);
                }
    }
    return todo;
}

/** The tab counts of one `attachTabCounts` call, now and as they change. The "host" is the root the page passed, which may be the document. */
class TabCountRoot extends Controller {
    /** @param {ParentNode} root */
    constructor(root) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
        this.root = root;
    }

    connect() {
        const { root } = this;
        const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
        const view = doc.defaultView;
        for (const tab of askingTabs(root)) drawTabCount(tab);
        if (!view || typeof view.MutationObserver !== 'function') return;
        const watch = this.observe(
            new view.MutationObserver((records) => {
                for (const tab of changedTabs(records, view)) drawTabCount(tab);
            }),
        );
        watch.observe(root instanceof Document ? root.documentElement : /** @type {Node} */ (root), {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: COUNT_ATTRIBUTES,
        });
    }
}

/**
 * Keep the count of every tab under `root` drawn from its attributes: now, and whenever an attribute of the count changes or a
 * tab comes. Idempotent.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTabCounts(root = document) {
    // Every call watches its root on its own, as before: the root is not keyed, so a second call is a second watcher.
    const control = new TabCountRoot(root);
    control.connect();
    return () => control.destroy();
}
