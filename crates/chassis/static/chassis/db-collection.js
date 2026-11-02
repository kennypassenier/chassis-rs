// Local database (feat-localdb-client-1): `chassisData.db.collection(name)`.
// Reads come from the local store with the queued writes laid over them;
// writes go through the existing chassisData queue (its send-now-or-queue
// rule, If-Match, Idempotency-Key, failed list, band) to the routes the
// collection declares. The server is the master: after a sent write the
// collection is pulled, so the record is the server's answer.

import { fail } from './data-errors.js';
import { itemPath } from './db-config.js';
import { buildOverlay } from './db-overlay.js';
import { createQuery } from './db-query.js';

/** deps: { def, store, data (the chassisData client), hub, keeper, puller, settings, uuid }. */
export function createCollection(deps) {
    const { def, store, data, hub, keeper, puller, settings, uuid } = deps;
    const overlay = () => buildOverlay(data.queue(), def, async (key) => (await store.get(def.name, key))?.data ?? null);
    const source = { def, store, overlay, partial: () => !settings().all };
    const root = createQuery(source);
    const checkKey = (key) => {
        if (typeof key !== 'string' || key === '') throw fail(`${def.name}: the key must be a non-empty string.`);
        return key;
    };

    /** The server's word wins: pull after a sent write; a queued one only moves the overlay. */
    async function done(result) {
        if (!result.queued) await puller.pull(def.name);
        hub.notify(def.name, 'edit');
        return result;
    }

    async function revOf(key) {
        return (await store.get(def.name, key))?.rev ?? undefined;
    }

    const clause = (index, kind) => (a, b) => createQuery(source, { index, kind, a, b });
    const whereOf = (index) => ({ equals: clause(index, 'equals'), between: clause(index, 'between'), startsWith: clause(index, 'startsWith') });

    return {
        name: def.name,
        async get(key) {
            checkKey(key);
            const queued = (await overlay()).get(key);
            if (queued) return queued.deleted ? null : { ...queued.data, pending: true };
            const record = await store.get(def.name, key);
            return record ? { ...record.data } : null;
        },
        all: () => root.toArray(),
        where: whereOf,
        sortBy: root.sortBy,
        limit: root.limit,
        count: root.count,
        query: () => root,
        async create(item) {
            const key = item?.[def.key] === undefined ? uuid() : checkKey(item[def.key]);
            if (!def.routes) itemPath(def, key); // throws the "declares no routes" sentence
            const result = await done(await data.post(def.routes.list, { ...item, [def.key]: key }));
            return { ...result, key };
        },
        async put(key, item) {
            checkKey(key);
            const rev = await revOf(key);
            return done(await data.put(itemPath(def, key), { ...item, [def.key]: key }, rev === undefined ? {} : { rev }));
        },
        async patch(key, fields) {
            checkKey(key);
            const rev = await revOf(key);
            return done(await data.patch(itemPath(def, key), fields, rev === undefined ? {} : { rev }));
        },
        async delete(key) {
            checkKey(key);
            const rev = await revOf(key);
            return done(await data.delete(itemPath(def, key), rev === undefined ? {} : { rev }));
        },
        keep: (key, on = true) => keeper.set(def, checkKey(key), on),
        isKept: (key) => keeper.isKept(def.name, checkKey(key)),
        sync: () => puller.pull(def.name),
        watch: (fn) => hub.watch(def.name, fn),
        async status() {
            const meta = await store.getMeta(def.name);
            return { partial: source.partial(), stale: meta.stale === true, lastPull: meta.lastPull ?? null, bytes: meta.bytes ?? 0 };
        },
    };
}
