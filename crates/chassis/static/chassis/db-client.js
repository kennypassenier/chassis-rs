// Local database (feat-localdb-client-1): `createDb` wires the parts once the
// manifest and the store exist: the puller, the keeper and one collection
// object per declared collection. Everything that touches the world is
// injected (`send`, the store, `emit`, the clock), so node drives it with
// fakes. The write queue, failed list and cap are the chassisData client's
// (`data`); this file adds no second queue.

import { fail } from './data-errors.js';
import { createCollection } from './db-collection.js';
import { createKeeper } from './db-keep.js';
import { createPuller } from './db-pull.js';

/** deps: { store, data, options (db option), events { on }, emit, send, storage, app, now, uuid, hub, warn }. */
export function createDb(deps) {
    const { store, data, options, events, emit, hub, warn = console.warn } = deps;
    const defs = store.manifest.collections;
    const names = Object.keys(defs);
    const settings = () => data.settings();
    const keeper = createKeeper({ storage: deps.storage, app: deps.app, store, settings, send: deps.send, now: deps.now, warn });

    function report(summary) {
        if (summary.pages > 0 || summary.removed > 0) hub.notify(summary.collection, 'pull');
        data.settle(); // the cap level may have moved: the warning fires here
        if (summary.stopped === 'auth') emit('chassis-data-synced', { sent: 0, remaining: data.pending(), stopped: 'auth' });
        if (summary.stopped === 'full') emit('chassis-data-storage', { ...data.usage(), level: 'full' });
        emit('chassis-db-pulled', summary);
    }

    const puller = createPuller({
        store, send: deps.send, config: options, now: deps.now, uuid: deps.uuid, warn, report,
        room: () => Math.max(0, data.usage().max - data.usage().used),
        keeps: (name, key) => keeper.keeps(name, key),
    });
    const overlays = options.overlay ?? {};
    for (const name of Object.keys(overlays)) {
        if (!defs[name]) warn(`chassisData.db: db.overlay names collection ${JSON.stringify(name)}, which the manifest does not declare (${names.join(', ') || 'none'}); it is ignored.`);
    }
    const collections = new Map();
    const pullNames = (list) => puller.pullAll(list ?? names);

    // The queue moved: queued edits are laid over the records, so views redraw. A replay that sent edits: pull.
    const offs = [
        events.on('chassis-data-queue', () => hub.notifyAll('queue')),
        events.on('chassis-data-synced', (detail) => detail?.sent > 0 && pullNames(null)),
    ];

    return {
        names: () => [...names],
        collection(name) {
            const def = defs[name];
            if (!def) throw fail(`there is no collection ${JSON.stringify(name)} in the manifest.`, { remedy: `Declared: ${names.join(', ') || 'none'}.` });
            if (!collections.has(name)) {
                collections.set(name, createCollection({ def, store, data, hub, keeper, puller, settings, uuid: deps.uuid, now: deps.now, send: deps.send, warn, overlayFn: overlays[name] }));
            }
            return collections.get(name);
        },
        /** Pull the named collections, or every one. */
        sync: (list = null) => pullNames(list),
        bytes: () => store.bytes(),
        /** "Keep everything" changed: on = pull what the feed skipped, off = drop what nobody chose. */
        async keepAllChanged(on) {
            for (const name of names) {
                if (on) await puller.resync(name);
                else await keeper.trim(defs[name]);
                hub.notify(name, 'keep');
            }
        },
        /**
         * Empty every collection's local store and forget its cursor (the next
         * pull starts from the beginning). The write queue (waiting and failed
         * edits) and the per-device keep choices stay. Resolves to
         * `{ collections, waiting }`: `waiting` is how many edits still wait,
         * so an app may tell the person they stay.
         */
        async clear() {
            for (const name of names) {
                await puller.settled(name);
                await store.reset(name);
                hub.notify(name, 'clear');
            }
            data.settle(); // the cap level moved
            return { collections: [...names], waiting: data.pending() };
        },
        /** Logout: the database is deleted; this object is finished. */
        async purge() {
            offs.forEach((off) => off());
            await store.destroy();
        },
    };
}
