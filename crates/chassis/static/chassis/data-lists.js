// The stored list copies that hold an item (fix-habits-data-3). A write to an
// item path (`PATCH /data/tasks/7`) must show in every stored list route that
// contains the item (`/data/snapshot`), or an offline reload draws the list
// as it was before the edit. Entries are found through `config.itemKey`, the
// same mapping trimmed keeping uses. A queued create is added to the lists
// that would hold it (fix-overlay-5); a composite answer (`config.composites`,
// data-composite.js) is amended under its mapped field (fix-overlay-4).

import { matchRoute } from './data-config.js';
import { entriesOf, entryPath } from './data-trim.js';

/**
 * `entries` with `change` applied to the one at `path` (`undefined` removes it); `data` itself when it is not there.
 * `seen({ index, entry })` hears the entry as it was, so a caller can put it back (`restoreEntry`).
 */
function amendEntries(config, child, path, data, change, seen = null) {
    const entries = entriesOf(data);
    if (!entries || !entries.some((e) => entryPath(config, child, e) === path)) return data;
    const next = entries.flatMap((e, index) => {
        if (entryPath(config, child, e) !== path) return [e];
        seen?.({ index, entry: e });
        return [change(e)];
    }).filter((e) => e !== undefined);
    return Array.isArray(data) ? next : { ...data, items: next };
}

/** `entries` with the entry of `path` replaced by `hit.entry`, or put back at `hit.index` when it is gone. */
function putBack(config, child, path, data, hit) {
    const entries = entriesOf(data);
    if (!entries) return data;
    const at = entries.findIndex((e) => entryPath(config, child, e) === path);
    const next = at >= 0 ? entries.map((e, i) => (i === at ? hit.entry : e)) : [...entries.slice(0, hit.index), hit.entry, ...entries.slice(hit.index)];
    return Array.isArray(data) ? next : { ...data, items: next };
}

/** `entries` with `entry` appended unless its item is already there. */
function appendEntry(config, child, data, entry) {
    const entries = entriesOf(data);
    const path = entryPath(config, child, entry);
    if (!entries || path === null || entries.some((e) => entryPath(config, child, e) === path)) return data;
    return Array.isArray(data) ? [...entries, entry] : { ...data, items: [...entries, entry] };
}

/** Run `fn(data, where) -> data` on every stored copy of composite `path` for the fields mapped to item route `child`; `where` = { stored, field }. */
async function amendComposites({ config, cache }, child, fn) {
    for (const composite of config.composites) {
        for (const { field, item } of composite.fields) {
            if (item !== child) continue;
            for (const stored of cache.paths().filter((p) => p.split('?')[0] === composite.path)) {
                await cache.amend(stored, (data) => (data && typeof data === 'object' && field in data ? { ...data, [field]: fn(data[field], { stored, field }) } : data));
            }
        }
    }
}

/**
 * Apply `change(entry)` to the entry of item `path` in every stored list that
 * belongs to item route `child`, and in every composite answer that maps a
 * field to it. `change` returns the new entry, or `undefined` to remove it. A
 * list whose shape is unknown, or that does not hold the item, is left as it is.
 * `record({ stored, field, index, entry })` hears each entry as it was (field = null for a plain list), for `restoreEntries`.
 */
export async function amendLists(ctx, child, path, change, record = null) {
    const { config, cache } = ctx;
    for (const stored of cache.paths()) {
        const route = matchRoute(config, stored);
        if (route?.kind !== 'list' || route.child !== child) continue;
        await cache.amend(stored, (data) => amendEntries(config, child, path, data, change, record && ((hit) => record({ stored, field: null, ...hit }))));
    }
    await amendComposites(ctx, child, (value, where) => amendEntries(config, child, path, value, change, record && ((hit) => record({ ...where, ...hit }))));
}

/** Put the entries `amendLists` reported back where they were (a list that is gone is left alone). */
export async function restoreEntries({ config, cache }, child, path, hits) {
    for (const hit of hits) {
        if (!cache.paths().includes(hit.stored)) continue;
        await cache.amend(hit.stored, (data) => {
            if (hit.field === null) return putBack(config, child, path, data, hit);
            return data && typeof data === 'object' && hit.field in data ? { ...data, [hit.field]: putBack(config, child, path, data[hit.field], hit) } : data;
        });
    }
}

/**
 * A queued create: `entry` joins the stored copies of list route `list` that
 * hold the whole collection (no query string) and the composite fields that
 * map to its item route. Returns the entry's item path, or null when it has
 * no usable key (nothing was added).
 */
export async function addToLists(ctx, list, entry) {
    const { config, cache } = ctx;
    const child = list.child;
    const path = child ? entryPath(config, child, entry) : null;
    if (path === null) return null;
    for (const stored of cache.paths()) {
        if (stored.includes('?') || matchRoute(config, stored) !== list) continue;
        await cache.amend(stored, (data) => appendEntry(config, child, data, entry));
    }
    await amendComposites(ctx, child, (value) => appendEntry(config, child, value, entry));
    return path;
}

/** The item route of a written path, or null when the path is not an item (a list, an action, a foreign path). */
export function itemRouteOf(config, path) {
    const route = matchRoute(config, path);
    return route?.kind === 'item' ? route : null;
}
