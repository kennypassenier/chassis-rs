// A late module, attached to the page as it stood when it was asked for
// [scope-115, scope-117].
//
// js/auto.js used to attach every module at load, and js/effects.js ran every
// hook inside attachEffects(). A React component mounts after both and wires
// its own markup (docs/USER_GUIDE.md, the side navigation's `autoAttach`, the
// Marquee). Since the split, a module or a hook arrives after React has
// mounted, and its attach would wire React's markup a second time — measured
// 2026-09-17: the combobox's React tag input appending every tag twice, 33
// more tests of the same shape, and the React marquee's items moved into a
// track the component does not own.
//
// So while a late module attaches, `querySelector` and `querySelectorAll` on
// the root answer with the elements that were there when it was asked for,
// and nothing rendered since. It is synchronous and put back at once: a query
// the module makes later, on a click or a scroll, sees the page as it is,
// which is what it saw when it was attached eagerly too.

/**
 * The elements under `root` now, to attach against later.
 * @param {ParentNode} root
 * @returns {WeakSet<Element>}
 */
export const presentUnder = (root) => new WeakSet([...(root instanceof Element ? [root] : []), ...root.querySelectorAll('*')]);

/**
 * Run `attach` against `root` as it stood when `present` was taken.
 *
 * @template T
 * @param {ParentNode} root
 * @param {WeakSet<Element>} present
 * @param {() => T} attach
 * @returns {T}
 */
export function asOf(root, present, attach) {
    const own = {
        querySelectorAll: Object.getOwnPropertyDescriptor(root, 'querySelectorAll'),
        querySelector: Object.getOwnPropertyDescriptor(root, 'querySelector'),
    };
    const all = root.querySelectorAll;
    /** @param {string} selector */
    const filtered = (selector) => [...all.call(root, selector)].filter((element) => present.has(element));
    Object.defineProperty(root, 'querySelectorAll', { configurable: true, value: filtered });
    Object.defineProperty(root, 'querySelector', { configurable: true, value: (/** @type {string} */ selector) => filtered(selector)[0] ?? null });
    try {
        return attach();
    } finally {
        for (const name of /** @type {const} */ (['querySelectorAll', 'querySelector'])) {
            const before = own[name];
            if (before) Object.defineProperty(root, name, before);
            else delete (/** @type {any} */ (root)[name]);
        }
    }
}
