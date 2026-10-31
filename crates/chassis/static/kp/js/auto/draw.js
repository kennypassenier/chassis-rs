// What the loader asks of the document: does a root carry a selector, and which elements did an attach draw.

/** @param {ParentNode} root @param {string} selector */
export const carries = (root, selector) => (root instanceof Element && root.matches(selector)) || root.querySelector(selector) !== null;

/** @param {ParentNode} root @returns {Element[]} `root` itself when it is an element, and everything under it */
export const everyUnder = (root) => [...(root instanceof Element ? [root] : []), ...root.querySelectorAll('*')];

/**
 * Run `attach`, and add to `drawn` every element it put under `root` while it
 * ran. The records are taken before the observer could deliver them, so what
 * counts is exactly what the attach itself drew, never what a framework
 * rendered while the module was on its way.
 *
 * @template T
 * @param {ParentNode} root
 * @param {WeakSet<Element>} drawn
 * @param {() => T} attach
 * @returns {T}
 */
export const drawing = (root, drawn, attach) => {
    if (typeof MutationObserver !== 'function') return attach();
    const watch = new MutationObserver(() => undefined);
    watch.observe(root, { childList: true, subtree: true });
    try {
        return attach();
    } finally {
        for (const record of watch.takeRecords()) {
            for (const node of record.addedNodes) if (node instanceof Element) for (const element of everyUnder(node)) drawn.add(element);
        }
        watch.disconnect();
    }
};
