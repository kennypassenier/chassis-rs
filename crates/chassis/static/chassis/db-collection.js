// Local database (feat-localdb-client-1): `chassisData.db.collection(name)`.
// Reads come from the local store with the queued writes laid over them;
// writes go through the existing chassisData queue (its send-now-or-queue
// rule, If-Match, Idempotency-Key, failed list, band) to the routes the
// collection declares. The server is the master: after a sent write the
// collection is pulled, so the record is the server's answer.

import { fail } from './data-errors.js';
import { LOCAL_PREFIX, isLocalKey, itemPath } from './db-config.js';
import { buildOverlay } from './db-overlay.js';
import { createQuery } from './db-query.js';

/** deps: { def, store, data (the chassisData client), hub, keeper, puller, settings, uuid }. */
export function createCollection(deps) {
    const { def, store, data, hub, keeper, puller, settings, uuid, overlayFn = null } = deps;
    const actions = new Map(); // name -> optimistic transform (record, body) => record; never stored in the queue
    const overlay = () => buildOverlay(data.queue(), def, async (key) => (await store.get(def.name, key))?.data ?? null, actions, overlayFn);
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

    /** A write to the server's own route needs the server's key: a temporary one has none yet. */
    function onServer(key) {
        if (isLocalKey(key)) throw fail(`${def.name}: ${key} is a create the server has not accepted yet.`, { remedy: 'Wait until it is sent (the key then changes to the real one).' });
        return checkKey(key);
    }

    /** A create's route: the list route, or `opts.path` (another list route of the app; the body is still this collection's create). */
    function createRoute(opts) {
        if (opts.path === undefined) return { path: def.routes.list, options: {} };
        const path = opts.path;
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw fail(`${def.name}: create({ path }) needs a path of this app, starting with "/".`);
        return { path, options: { collection: def.name } };
    }

    async function createClientKeyed(item, opts) {
        const key = item?.[def.key] === undefined ? uuid() : checkKey(item[def.key]);
        const route = createRoute(opts);
        const result = await done(await data.post(route.path, { ...item, [def.key]: key }, route.options));
        return { ...result, key };
    }

    /** The server assigns the key: queued, the item shows under `local:<idempotency key>` until the answer or the next pull. */
    async function createServerKeyed(item, opts) {
        const route = createRoute(opts);
        const result = await done(await data.post(route.path, { ...item }, route.options));
        const key = result.queued ? `${LOCAL_PREFIX}${result.idempotencyKey}` : (result.data?.[def.key] ?? null);
        return { ...result, key };
    }

    /** If-Match options of a write: `opts.rev` wins over the stored rev (a write after a non-collection write of the same item). */
    async function matchOf(key, opts = {}) {
        const rev = opts.rev !== undefined ? opts.rev : (await store.get(def.name, key))?.rev;
        return rev === undefined || rev === null ? {} : { rev };
    }

    const checkAction = (name) => {
        if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw fail(`${def.name}: an action name is letters, digits, "_" or "-".`);
    };

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
        /** `opts.path`: POST to that list route instead of the collection's own; the body is still overlaid as a create. */
        async create(item, opts = {}) {
            if (!def.routes) itemPath(def, 'x'); // throws the "declares no routes" sentence
            return def.keys === 'server' ? createServerKeyed(item, opts) : createClientKeyed(item, opts);
        },
        async put(key, item, opts) {
            onServer(key);
            return done(await data.put(itemPath(def, key), { ...item, [def.key]: key }, await matchOf(key, opts)));
        },
        async patch(key, fields, opts) {
            onServer(key);
            return done(await data.patch(itemPath(def, key), fields, await matchOf(key, opts)));
        },
        async delete(key, opts) {
            onServer(key);
            return done(await data.delete(itemPath(def, key), await matchOf(key, opts)));
        },
        /** Register the optimistic look of item action `name`: `(record, body) => record` (`null` hides it). */
        action(name, transform) {
            checkAction(name);
            if (typeof transform !== 'function') throw fail(`${def.name}: the transform of action "${name}" must be a function.`);
            actions.set(name, transform);
            return this;
        },
        /** POST `<item route>/<name>` with `body`, queued like any write; the registered transform shows meanwhile. */
        async act(key, name, body = {}, opts) {
            onServer(key);
            checkAction(name);
            return done(await data.post(`${itemPath(def, key)}/${name}`, body, await matchOf(key, opts)));
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
