// Local database (feat-localdb-client-1): the store in memory. The fallback
// when IndexedDB is unusable (the data then lasts until the page closes) and
// the store the node tests use. Same interface as db-store.js:
//
//   manifest, getMeta(c), setMeta(c, patch), get(c, key), all(c), query(c, index, spec),
//   applyPage(c, { upserts, deletes, meta, room }) -> { stored, delta },
//   putOne(c, record), removeOne(c, key), prune(c, shouldRemove), reset(c),
//   bytes(), destroy(), close()

import { compareKeys, getPath, indexable, matcher } from './db-order.js';
import { planPage } from './db-plan.js';

export function memoryDb(manifest) {
    const tables = new Map(Object.keys(manifest.collections).map((n) => [n, new Map()]));
    const metas = new Map();
    const table = (c) => tables.get(c) ?? (() => { throw new Error(`chassisData.db: no collection ${c}`); })();
    const meta = (c) => metas.get(c) ?? { bytes: 0 };
    const clone = (v) => (v === undefined ? v : structuredClone(v));
    const sorted = (list, by) => list.sort((a, b) => compareKeys(by(a), by(b)) || compareKeys(a.key, b.key));

    function change(c, delta, patch = {}) {
        metas.set(c, { ...meta(c), ...patch, bytes: Math.max(0, (meta(c).bytes ?? 0) + delta) });
    }

    return {
        manifest,
        getMeta: async (c) => clone(meta(c)),
        async setMeta(c, patch) {
            metas.set(c, { ...meta(c), ...patch });
            return clone(meta(c));
        },
        get: async (c, key) => clone(table(c).get(key)) ?? null,
        all: async (c) => clone(sorted([...table(c).values()], (r) => r.key)),
        async query(c, index, spec) {
            const test = matcher(spec);
            const def = manifest.collections[c];
            const at = (r) => (index === def.key ? r.key : getPath(r.data, index));
            const hits = [...table(c).values()].filter((r) => indexable(at(r)) && test(at(r)));
            return clone(sorted(hits, at));
        },
        async applyPage(c, { upserts, deletes, meta: patch = {}, room }) {
            const t = table(c);
            const olds = new Map([...upserts.map((r) => r.key), ...deletes].map((k) => [k, t.get(k)]));
            const plan = planPage({ upserts, deletes, olds, room });
            for (const key of plan.deletes) t.delete(key);
            for (const rec of plan.upserts) t.set(rec.key, clone(rec));
            change(c, plan.delta, plan.stored ? patch : {});
            return { stored: plan.stored, delta: plan.delta };
        },
        async putOne(c, record) {
            const delta = record.size - (table(c).get(record.key)?.size ?? 0);
            table(c).set(record.key, clone(record));
            change(c, delta);
        },
        async removeOne(c, key) {
            const old = table(c).get(key);
            table(c).delete(key);
            if (old) change(c, -old.size);
        },
        async prune(c, shouldRemove) {
            let removed = 0;
            for (const [key, rec] of table(c)) {
                if (!shouldRemove(rec)) continue;
                table(c).delete(key);
                change(c, -rec.size);
                removed += 1;
            }
            return removed;
        },
        async reset(c) {
            table(c).clear();
            metas.set(c, { bytes: 0 });
        },
        bytes: () => [...tables.keys()].reduce((n, c) => n + (meta(c).bytes ?? 0), 0),
        async destroy() {
            tables.forEach((t) => t.clear());
            metas.clear();
        },
        close() {},
    };
}
