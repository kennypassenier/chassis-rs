// The stored list copies that hold an item (fix-habits-data-3). A write to an
// item path (`PATCH /data/tasks/7`) must show in every stored list route that
// contains the item (`/data/snapshot`), or an offline reload draws the list
// as it was before the edit. Entries are found through `config.itemKey`, the
// same mapping trimmed keeping uses. Only entries already in a list change:
// a write never adds an entry to a list (the server's next answer does).

import { matchRoute } from './data-config.js';
import { entriesOf, entryPath } from './data-trim.js';

/**
 * Apply `change(entry)` to the entry of item `path` in every stored list that
 * belongs to item route `child`. `change` returns the new entry, or `undefined`
 * to remove it. A list whose shape is unknown, or that does not hold the item,
 * is left as it is.
 */
export async function amendLists({ config, cache }, child, path, change) {
    for (const stored of cache.paths()) {
        const route = matchRoute(config, stored);
        if (route?.kind !== 'list' || route.child !== child) continue;
        await cache.amend(stored, (data) => {
            const entries = entriesOf(data);
            if (!entries || !entries.some((e) => entryPath(config, child, e) === path)) return data;
            const next = entries.flatMap((e) => (entryPath(config, child, e) === path ? [change(e)] : [e])).filter((e) => e !== undefined);
            return Array.isArray(data) ? next : { ...data, items: next };
        });
    }
}

/** The item route of a written path, or null when the path is not an item (a list, an action, a foreign path). */
export function itemRouteOf(config, path) {
    const route = matchRoute(config, path);
    return route?.kind === 'item' ? route : null;
}
