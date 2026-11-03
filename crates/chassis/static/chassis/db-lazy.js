// Local database (feat-localdb-client-1): `chassisData.db` before the
// database is ready. The facade exists at once (the app's modules run before
// the manifest has arrived); every read and write waits for `ensure()`.
// `watch` needs no database: it hangs on the hub.

const COLLECTION_ASYNC = ['get', 'all', 'count', 'create', 'put', 'patch', 'delete', 'act', 'keep', 'isKept', 'sync', 'status'];
const QUERY_STEPS = ['sortBy', 'reverse', 'limit', 'skip'];
const QUERY_ENDS = ['toArray', 'first', 'count'];

/** A query that is built before its collection exists: `thunk()` resolves to the real one. */
function lazyQuery(thunk) {
    const query = {};
    for (const step of QUERY_STEPS) query[step] = (...args) => lazyQuery(() => thunk().then((q) => q[step](...args)));
    for (const end of QUERY_ENDS) query[end] = () => thunk().then((q) => q[end]());
    return query;
}

/** `ensure()` resolves to the database object (createDb's), or rejects with the reason. */
export function lazyDb({ ensure, hub }) {
    const real = (name) => ensure().then((db) => db.collection(name));
    function collection(name) {
        const col = { name };
        for (const m of COLLECTION_ASYNC) col[m] = (...args) => real(name).then((c) => c[m](...args));
        const query = () => lazyQuery(() => real(name).then((c) => c.query()));
        col.query = query;
        col.sortBy = (...a) => query().sortBy(...a);
        col.limit = (...a) => query().limit(...a);
        col.where = (index) => {
            const clause = {};
            for (const kind of ['equals', 'between', 'startsWith']) {
                clause[kind] = (a, b) => lazyQuery(() => real(name).then((c) => c.where(index)[kind](a, b)));
            }
            return clause;
        };
        col.watch = (fn) => hub.watch(name, fn);
        // An item action is registered before the database exists (Kitchen: the
        // facade had no `action`, so registering one threw and the data client
        // never started). It reaches the real collection first thing, before any
        // read queued after it, and a bad registration is reported, not thrown.
        col.action = (actionName, transform) => {
            real(name)
                .then((c) => c.action(actionName, transform))
                .catch((err) => console.warn(`chassisData.db: the action "${actionName}" of ${name} could not be registered.`, err));
            return col;
        };
        return col;
    }
    return {
        collection,
        /** Resolves to the names of the collections once the manifest is in; rejects while the service cannot be reached and nothing was synced. */
        ready: () => ensure().then((db) => db.names()),
        sync: (names = null) => ensure().then((db) => db.sync(names)),
        /** Empty the local stores; the queue and the keep choices stay. See createDb's `clear`. */
        clear: () => ensure().then((db) => db.clear()),
        usage: () => ensure().then((db) => ({ bytes: db.bytes() })),
    };
}
