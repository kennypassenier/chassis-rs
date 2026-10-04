// The attention band, kept worst first [scope-143].
//
// `.kp-attention` holds one `.kp-attention__item` per problem, each with the
// action that fixes it, and takes no room at all when it holds none (the
// stylesheet does that). The items are ranked by `data-kp-severity`
// (critical, warning, info); this module keeps that order in the DOM itself,
// so a screen reader meets the problems in the order the eye does, and a
// problem added later lands in its place rather than at the bottom. Nothing
// runs on import; attachAttention(root) returns a detach.

/** The band, and the severities it orders by, worst first. */
export const ATTENTION = '.kp-attention';
export const SEVERITIES = /** @type {const} */ (['critical', 'warning', 'info']);

/**
 * Put a band's items in severity order in the DOM (a stable sort: two
 * problems of one severity keep the order the page gave them).
 * @param {Element} band
 */
export function sortAttention(band) {
    const items = /** @type {HTMLElement[]} */ ([...band.children]).filter((el) => el.classList.contains('kp-attention__item'));
    const rank = (/** @type {HTMLElement} */ el) => {
        const at = SEVERITIES.indexOf(/** @type {any} */ (el.dataset.kpSeverity));
        return at < 0 ? SEVERITIES.length : at;
    };
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    if (sorted.every((el, at) => el === items[at])) return;
    for (const el of sorted) band.append(el);
}

/**
 * Keep every attention band under `root` worst first, now and whenever an
 * item arrives or changes severity. The band hides itself in CSS when it
 * holds nothing.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachAttention(root = document) {
    const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
    const view = doc.defaultView;
    const bands = [...root.querySelectorAll(ATTENTION)];
    for (const band of bands) sortAttention(band);
    if (!view) return () => {};
    const watchers = bands.map((band) => {
        const watch = new view.MutationObserver(() => {
            watch.disconnect();
            sortAttention(band);
            watch.observe(band, options);
        });
        const options = { childList: true, subtree: true, attributes: true, attributeFilter: ['data-kp-severity'] };
        watch.observe(band, options);
        return watch;
    });
    return () => watchers.forEach((w) => w.disconnect());
}
