// IndexedDB behind the flat store interface the rest of the offline client
// uses (feat-offline-1). The only file that touches IndexedDB; the tests give
// the client an in-memory store with the same methods.
//
//   getRead(path) putRead(record) deleteRead(path) allReads() clearReads()
//   allQueue() putQueue(entry) -> entry (with its id) deleteQueue(id) clearQueue()
//   close()
//
// Two object stores: `reads` (keyPath `path`) and `queue` (autoIncrement `id`,
// so the key order is the order the edits were made in).

export const DB_PREFIX = 'chassis-data:';
const VERSION = 1;

const wrap = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });

function upgrade(db) {
    db.createObjectStore('reads', { keyPath: 'path' });
    db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
}

function open(idb, name) {
    return new Promise((resolve, reject) => {
        const request = idb.open(DB_PREFIX + name, VERSION);
        request.onupgradeneeded = () => upgrade(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
        request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
}

/** Open (or create) the database of app `name` and return the store. */
export async function openStore(idb, name) {
    if (!idb) throw new Error('IndexedDB is not available in this browser');
    const db = await open(idb, name);
    const run = (store, mode, fn) => wrap(fn(db.transaction(store, mode).objectStore(store)));
    return {
        getRead: (path) => run('reads', 'readonly', (s) => s.get(path)).then((r) => r ?? null),
        putRead: (record) => run('reads', 'readwrite', (s) => s.put(record)),
        deleteRead: (path) => run('reads', 'readwrite', (s) => s.delete(path)),
        allReads: () => run('reads', 'readonly', (s) => s.getAll()),
        clearReads: () => run('reads', 'readwrite', (s) => s.clear()),
        allQueue: () => run('queue', 'readonly', (s) => s.getAll()),
        async putQueue(entry) {
            const id = await run('queue', 'readwrite', (s) => s.put(entry));
            return { ...entry, id };
        },
        deleteQueue: (id) => run('queue', 'readwrite', (s) => s.delete(id)),
        clearQueue: () => run('queue', 'readwrite', (s) => s.clear()),
        close: () => db.close(),
    };
}

/**
 * The same interface in memory: the fallback when IndexedDB is unavailable
 * (private windows of some browsers), where the copy and the queue last only
 * until the page closes, and the store the node tests use.
 */
export function memoryStore() {
    const reads = new Map();
    let queue = [];
    let next = 1;
    return {
        getRead: async (path) => reads.get(path) ?? null,
        putRead: async (record) => void reads.set(record.path, structuredClone(record)),
        deleteRead: async (path) => void reads.delete(path),
        allReads: async () => [...reads.values()].map((r) => structuredClone(r)),
        clearReads: async () => reads.clear(),
        allQueue: async () => structuredClone(queue),
        async putQueue(entry) {
            const saved = structuredClone({ ...entry, id: entry.id ?? next++ });
            queue = queue.some((e) => e.id === saved.id) ? queue.map((e) => (e.id === saved.id ? saved : e)) : [...queue, saved];
            return structuredClone(saved);
        },
        deleteQueue: async (id) => void (queue = queue.filter((e) => e.id !== id)),
        clearQueue: async () => void (queue = []),
        close: () => {},
    };
}
