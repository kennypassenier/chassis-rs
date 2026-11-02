// Trimmed keeping (feat-offline-keep-1): with "keep everything" off, a stored
// list answer holds only the entries whose item is kept. Pure; the stored
// copies are changed by data-trimmer.js. A list route belongs to the item
// route one `/:param` below it (`/api/dishes` -> `/api/dishes/:id`); an entry
// of the list maps to an item path through `config.itemKey`.

const CHILD = /^\/:[A-Za-z_][A-Za-z0-9_]*$/;

/** The item route one parameter below list route `list`, or null. */
export function childRoute(compiled, list) {
    return compiled.find((r) => r.kind === 'item' && r.pattern.startsWith(`${list.pattern}/`)
        && CHILD.test(r.pattern.slice(list.pattern.length))) ?? null;
}

/** The item path of one list entry, or null when the entry has no usable key. */
export function entryPath(config, item, entry) {
    const key = typeof config.itemKey === 'function' ? config.itemKey(entry) : entry?.[config.itemKey];
    if (key === undefined || key === null || key === '') return null;
    return item.pattern.replace(/:[A-Za-z_][A-Za-z0-9_]*$/, encodeURIComponent(String(key)));
}

/** The array of a list answer: the answer itself or its `items` field; null for any other shape. */
export function entriesOf(data) {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : null;
}

/**
 * `data` of list route `route` cut to the entries of `kept` (a Set of item
 * paths); null when the answer cannot be trimmed (no item route, unknown shape).
 */
export function trimList(config, route, data, kept) {
    const entries = entriesOf(data);
    if (!route.child || !entries) return null;
    const left = entries.filter((e) => kept.has(entryPath(config, route.child, e)));
    return Array.isArray(data) ? left : { ...data, items: left };
}

/**
 * What to store of an answer: `{ data, partial }`, or null to store nothing.
 * Whole answers when "keep everything" is on; trimmed lists otherwise.
 */
export function storable(config, settings, route, path, body) {
    if (!route) return null;
    if (settings.all) return { data: body, partial: false };
    if (route.kind === 'item') return settings.items.includes(path.split('?')[0]) ? { data: body, partial: false } : null;
    const data = trimList(config, route, body, new Set(settings.items));
    return data === null || settings.items.length === 0 ? null : { data, partial: true };
}
