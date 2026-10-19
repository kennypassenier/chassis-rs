// Live options: an attribute option that is read again when the attribute changes [live-options-1019].
//
// DEMO_RULES ch. 2: a variant that could be a setting is a component option with a default, switchable at runtime.
// A module that read its options once, at attach, calls watchOptions() with the attributes it reads and the function
// that draws again; the page changes the attribute (or a script does) and the component follows.
//
//   const stop = watchOptions(host, ['data-kp-look', 'data-kp-stale-after'], (names) => redraw());
//   …
//   stop();
//
// The callback hears each change once per batch, with the names that really differ from before: an attribute written
// to the value it already had, or changed and changed back inside one batch, is not a change. It is called with the
// element's own attributes only (never a subtree's). Returns a stop; nothing runs on import.

/**
 * Call `onChange` when one of `attributes` of `element` gets a different value.
 *
 * @param {Element} element
 * @param {readonly string[]} attributes  the attribute names the module reads (`data-kp-…`)
 * @param {(names: string[]) => void} onChange  the names whose value differs from before, in the order they changed
 * @returns {() => void} stop
 */
export function watchOptions(element, attributes, onChange) {
    const view = element.ownerDocument.defaultView;
    if (view === null || typeof view.MutationObserver !== 'function') return () => undefined;
    const watcher = new view.MutationObserver((records) => {
        /** The value each attribute had before this batch. @type {Map<string, string | null>} */
        const before = new Map();
        for (const record of records) {
            const name = record.attributeName;
            if (name !== null && !before.has(name)) before.set(name, record.oldValue);
        }
        const changed = [...before].filter(([name, was]) => element.getAttribute(name) !== was).map(([name]) => name);
        if (changed.length > 0) onChange(changed);
    });
    watcher.observe(element, { attributes: true, attributeOldValue: true, attributeFilter: [...attributes] });
    return () => watcher.disconnect();
}
