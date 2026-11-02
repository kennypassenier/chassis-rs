// Local database (feat-localdb-client-1): the IndexedDB behind it. The only
// file that touches IndexedDB for the local database (the tests use
// db-store-mem.js, same interface). Database `chassis-db:<app>`: one object
// store per collection (keyPath `key`, one index per declared index on
// `data.<index>`) and `_meta` (per collection: cursor, bytes, lastPull ...;
// plus `__schema` and the last `__manifest`, so an offline start still knows
// the collections). A changed schema hash drops the database and builds it
// again; the write queue lives in `chassis-data:<app>` and is never touched.

import { fail } from './data-errors.js';
import { needsRebuild } from './db-config.js';
import { keyRange } from './db-order.js';
import { planPage } from './db-plan.js';

export const DB_PREFIX = 'chassis-db:';
const META = '_meta';
const SCHEMA = '__schema';
const MANIFEST = '__manifest';

const wrap = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });

const finished = (tx) =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });

function build(db, manifest) {
    db.createObjectStore(META, { keyPath: 'name' });
    for (const def of Object.values(manifest.collections)) {
        const store = db.createObjectStore(def.name, { keyPath: 'key' });
        for (const index of def.indexes) if (index !== def.key) store.createIndex(index, `data.${index}`);
    }
}

/** The existing database at its own version, or null when there is none (never creates one). */
function peek(idb, name) {
    return new Promise((resolve, reject) => {
        const request = idb.open(name);
        request.onupgradeneeded = () => request.transaction.abort();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => (request.error?.name === 'AbortError' ? resolve(null) : reject(request.error ?? new Error('IndexedDB could not be opened')));
    });
}

function create(idb, name, manifest) {
    return new Promise((resolve, reject) => {
        const request = idb.open(name, 1);
        request.onupgradeneeded = () => build(request.result, manifest);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be created'));
        request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
}

function remove(idb, name) {
    return new Promise((resolve, reject) => {
        const request = idb.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be dropped'));
        request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
}

async function readMeta(db, name) {
    if (!db.objectStoreNames.contains(META)) return null;
    return (await wrap(db.transaction(META).objectStore(META).get(name))) ?? null;
}

/** The database for `app`: kept when its schema hash matches, rebuilt when not; with `manifest` null, the last one stored. */
async function openDb(idb, name, manifest) {
    if (!idb) throw fail('IndexedDB is not available in this browser');
    let db = await peek(idb, name);
    const schema = db ? await readMeta(db, SCHEMA) : null;
    if (manifest === null) {
        const cached = db ? await readMeta(db, MANIFEST) : null;
        if (!cached) {
            db?.close();
            throw fail('the service cannot be reached and nothing was synced yet.', { offline: true });
        }
        return { db, manifest: cached.value };
    }
    if (!db || needsRebuild(schema?.value ?? null, manifest, [...db.objectStoreNames])) {
        db?.close();
        await remove(idb, name); // the schema changed: the copy is dropped and pulled again
        db = await create(idb, name, manifest);
    }
    const t = db.transaction(META, 'readwrite');
    t.objectStore(META).put({ name: SCHEMA, value: manifest.schema });
    t.objectStore(META).put({ name: MANIFEST, value: manifest });
    await finished(t);
    return { db, manifest };
}

/** Open the store of `app`; see db-store-mem.js for the interface. */
export async function openDbStore(idb, app, manifest = null, KeyRange = globalThis.IDBKeyRange) {
    const name = DB_PREFIX + app;
    const opened = await openDb(idb, name, manifest);
    const { db } = opened;
    const def = (c) => opened.manifest.collections[c] ?? (() => { throw fail(`no collection ${c} in the manifest`); })();
    db.onversionchange = () => db.close(); // another tab rebuilds the database: step aside
    const totals = new Map();
    for (const rec of await wrap(db.transaction(META).objectStore(META).getAll())) totals.set(rec.name, rec.bytes ?? 0);

    async function inTx(c, work) {
        const t = db.transaction([c, META], 'readwrite');
        const out = await work(t.objectStore(c), t.objectStore(META));
        await finished(t);
        return out;
    }
    const metaOf = async (m, c) => (await wrap(m.get(c))) ?? { name: c, bytes: 0 };
    const withBytes = (rec, delta, patch = {}) => ({ ...rec, ...patch, bytes: Math.max(0, (rec.bytes ?? 0) + delta) });
    const keep = (c, rec) => totals.set(c, rec.bytes);

    return {
        manifest: opened.manifest,
        async getMeta(c) {
            const { name: _n, ...rest } = await metaOf(db.transaction(META).objectStore(META), c);
            return rest;
        },
        async setMeta(c, patch) {
            return inTx(c, async (_s, m) => {
                const next = { ...(await metaOf(m, c)), ...patch, name: c };
                m.put(next);
                return next;
            });
        },
        get: async (c, key) => (await wrap(db.transaction(c).objectStore(c).get(key))) ?? null,
        all: (c) => wrap(db.transaction(c).objectStore(c).getAll()),
        query(c, index, spec) {
            const store = db.transaction(c).objectStore(c);
            if (index === def(c).key) return wrap(store.getAll(keyRange(KeyRange, spec)));
            if (!store.indexNames.contains(index)) throw fail(`collection ${c} has no index ${index}`, { remedy: 'Declare it with .index() on the server.' });
            return wrap(store.index(index).getAll(keyRange(KeyRange, spec)));
        },
        applyPage(c, { upserts, deletes, meta: patch = {}, room }) {
            return inTx(c, async (s, m) => {
                const keys = [...upserts.map((r) => r.key), ...deletes];
                const olds = new Map(await Promise.all(keys.map(async (k) => [k, await wrap(s.get(k))])));
                const plan = planPage({ upserts, deletes, olds, room });
                plan.deletes.forEach((k) => s.delete(k));
                plan.upserts.forEach((r) => s.put(r));
                const next = withBytes(await metaOf(m, c), plan.delta, plan.stored ? patch : {});
                m.put(next);
                keep(c, next);
                return { stored: plan.stored, delta: plan.delta };
            });
        },
        putOne: (c, record) => inTx(c, async (s, m) => {
            const old = await wrap(s.get(record.key));
            s.put(record);
            const next = withBytes(await metaOf(m, c), record.size - (old?.size ?? 0));
            m.put(next);
            keep(c, next);
        }),
        removeOne: (c, key) => inTx(c, async (s, m) => {
            const old = await wrap(s.get(key));
            if (!old) return;
            s.delete(key);
            const next = withBytes(await metaOf(m, c), -old.size);
            m.put(next);
            keep(c, next);
        }),
        prune: (c, shouldRemove) => inTx(c, async (s, m) => {
            const gone = (await wrap(s.getAll())).filter(shouldRemove);
            gone.forEach((r) => s.delete(r.key));
            const next = withBytes(await metaOf(m, c), -gone.reduce((n, r) => n + r.size, 0));
            m.put(next);
            keep(c, next);
            return gone.length;
        }),
        reset: (c) => inTx(c, async (s, m) => {
            s.clear();
            m.put({ name: c, bytes: 0 });
            totals.set(c, 0);
        }),
        bytes: () => [...totals.values()].reduce((a, b) => a + b, 0),
        async destroy() {
            db.close();
            await remove(idb, name);
        },
        close: () => db.close(),
    };
}
