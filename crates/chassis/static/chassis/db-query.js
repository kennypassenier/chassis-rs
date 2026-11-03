// Local database (feat-localdb-client-1): a query over one collection. It
// reads the server's records through an index (db-store.js), lays the queued
// writes over them (db-overlay.js) and sorts. No joins, no full text: an app
// filters further in its own code. Immutable builder; nothing runs before
// `toArray()` / `count()` / `first()`.

import { compareKeys, getPath, indexable, matcher } from './db-order.js';

/**
 * `source` = { def, store, overlay: () => Map, partial: () => bool }.
 * `spec` = null (everything) or { index, kind, a, b }. Result items are the
 * data as the server sent it, plus `pending: true` while an edit waits.
 */
export function createQuery(source, spec = null, opts = { sort: null, desc: false, limit: null, skip: 0 }) {
    const { def, store } = source;
    const more = (change) => createQuery(source, spec, { ...opts, ...change });

    /** The server's records: through the service when the collection is not kept whole (see db-through.js), else the store. */
    async function base(fresh) {
        if (fresh === null) return spec ? store.query(def.name, spec.index, spec) : store.all(def.name);
        if (!spec) return fresh;
        const test = matcher(spec);
        const at = (r) => (spec.index === def.key ? r.key : getPath(r.data, spec.index));
        return fresh.filter((r) => indexable(at(r)) && test(at(r)));
    }

    async function rows() {
        const fresh = (await source.through?.()) ?? null;
        // The queued edits are laid over the rows that were read through too (an edit of an item that is not on the device).
        const [records, over] = await Promise.all([base(fresh), source.overlay(fresh && new Map(fresh.map((r) => [r.key, r.data])))]);
        const rows = records.filter((r) => !over.has(r.key)).map((r) => ({ key: r.key, data: r.data, pending: false }));
        const valueOf = (key, data) => (spec.index === def.key ? key : getPath(data, spec.index));
        const test = spec ? matcher(spec) : null;
        for (const [key, entry] of over) {
            if (entry.deleted) continue;
            if (test && !(indexable(valueOf(key, entry.data)) && test(valueOf(key, entry.data)))) continue;
            rows.push({ key, data: entry.data, pending: true });
        }
        return rows;
    }

    function order(list) {
        const by = opts.sort ?? spec?.index;
        const at = (r) => (by === undefined || by === null || by === def.key ? r.key : getPath(r.data, by));
        const sign = opts.desc ? -1 : 1;
        return [...list].sort((x, y) => sign * (compareKeys(at(x), at(y)) || compareKeys(x.key, y.key)));
    }

    async function toArray() {
        let list = order(await rows());
        list = list.slice(opts.skip, opts.limit === null ? undefined : opts.skip + opts.limit);
        const out = list.map((r) => (r.pending ? { ...r.data, pending: true } : { ...r.data }));
        out.partial = source.partial();
        return out;
    }

    return {
        sortBy: (path, desc = false) => more({ sort: path, desc }),
        reverse: () => more({ desc: !opts.desc }),
        limit: (n) => more({ limit: n }),
        skip: (n) => more({ skip: n }),
        toArray,
        first: async () => (await more({ limit: 1 }).toArray())[0] ?? null,
        count: async () => (await rows()).length,
    };
}

