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

/**
 * The attribute a root wears while what attaches to it draws its first
 * render [fix-100]. js/auto.js puts it on the root of every attachAll()
 * (the `<html>` element for the document) and takes it off two painted
 * frames after the last module it fetched has attached; a consumer whose
 * framework renders a part of the page in several passes may wear it on
 * that part for as long. Nothing drawn under it is news: js/motion.js lets
 * no element arrive and no box glide there, it takes its first size at
 * once. Only what is added after the page settled (a new row, a new toast,
 * an opened group) arrives the theme's way.
 */
export const SETTLING_ATTRIBUTE = 'data-kp-settling';

/** How many attachAll() calls each root is settling for. @type {WeakMap<Element, number>} */
const holds = new WeakMap();

/**
 * Call `fn` once two frames have been painted: one frame lays out what was
 * drawn before it, the next is the first a reader sees settled, after the
 * resize observers of the first have run.
 * @param {() => void} fn
 */
export function afterPaint(fn) {
    if (typeof requestAnimationFrame !== 'function') {
        setTimeout(fn, 0);
        return;
    }
    requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Mark `root` settling until `done` settles and two frames have been
 * painted after it; two holds on one root keep it settling until both let
 * go. The returned function lets go at once (a detach before the end).
 * @param {Element} root
 * @param {Promise<unknown>} done
 * @returns {() => void}
 */
export function settleAfter(root, done) {
    holds.set(root, (holds.get(root) ?? 0) + 1);
    root.setAttribute(SETTLING_ATTRIBUTE, '');
    let held = true;
    const release = () => {
        if (!held) return;
        held = false;
        const left = (holds.get(root) ?? 1) - 1;
        holds.set(root, left);
        if (left <= 0) root.removeAttribute(SETTLING_ATTRIBUTE);
    };
    done.then(
        () => afterPaint(release),
        () => afterPaint(release),
    );
    return release;
}

/**
 * Whether `el` is part of a first render still being drawn: under a root
 * that wears SETTLING_ATTRIBUTE.
 * @param {Element} el
 */
export const settling = (el) => el.closest(`[${SETTLING_ATTRIBUTE}]`) !== null;
