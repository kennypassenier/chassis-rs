// Local database (feat-localdb-client-1): start-up of `chassisData.db` for an
// app that passed `db` to `configure()`. Asks `GET /api/sync` for the
// manifest (offline: the last one stored), opens `chassis-db:<app>` (rebuilt
// when the schema hash moved), creates the database object and binds the
// pull triggers. The first pull happens at once.

import { classify } from './data-policy.js';
import { refusal } from './data-errors.js';
import { send as httpSend } from './data-send.js';
import { createDb } from './db-client.js';
import { parseManifest } from './db-config.js';
import { memoryDb } from './db-store-mem.js';
import { openDbStore } from './db-store.js';
import { bindTriggers } from './db-triggers.js';

async function storeFor(win, app, manifest, deps) {
    try {
        return await (deps.openDbStore ?? openDbStore)(win.indexedDB, app, manifest, win.IDBKeyRange);
    } catch (err) {
        if (manifest === null) throw err;
        console.warn('chassisData.db: IndexedDB is not usable here; the local database lasts until the page closes.', err);
        return memoryDb(manifest);
    }
}

/** The manifest from the service, or null when it cannot be reached (then the stored one is used). */
async function fetchManifest(send, path, emit, pending) {
    const out = await send({ method: 'GET', path });
    const kind = classify(out.status);
    if (kind === 'ok') return parseManifest(out.body);
    if (kind === 'unreachable') return null;
    if (kind === 'auth') emit('chassis-data-synced', { sent: 0, remaining: pending(), stopped: 'auth' });
    throw refusal(out);
}

/**
 * `ctx` = { win, doc, app, options (normalized db option), data (createData's client), hub, events, emit, storage, fetch, setTimer, clearTimer, now, uuid, deps }.
 * Returns { ensure() (the database object, once the manifest and store are in), bytes(), keepAllChanged(on), purge() }.
 */
export function bootDb(ctx) {
    const { win, doc, app, options, data, emit, hub } = ctx;
    const send = (req) => httpSend(ctx.fetch, req);
    let starting = null;
    let opened = null;

    async function start() {
        const manifest = await fetchManifest(send, options.syncUrl, emit, () => data.pending());
        const store = await storeFor(win, app, manifest, ctx.deps ?? {});
        opened = createDb({ store, data, options, events: ctx.events, emit, send, storage: ctx.storage, app, now: ctx.now, uuid: ctx.uuid, hub });
        return opened;
    }
    // A failed start (offline with nothing synced yet) is tried again by the next trigger.
    const ensure = () => (starting ??= start().catch((err) => { starting = null; throw err; }));

    const fire = (names) => ensure().then((db) => db.sync(names)).catch((err) => {
        if (!err?.offline && err?.status !== 0) console.warn('chassisData.db: the local database could not be updated.', err);
    });
    const off = bindTriggers({ win, doc, fire, pullMs: options.pullMs, live: options.live, setTimer: ctx.setTimer, clearTimer: ctx.clearTimer });
    fire(null);

    return {
        ensure,
        bytes: () => opened?.bytes() ?? 0,
        keepAllChanged: async (on) => (await ensure()).keepAllChanged(on),
        /** Logout: stop pulling, delete the database. Nothing to do when it never opened. */
        async purge() {
            off();
            if (starting) await (await starting.catch(() => null))?.purge();
        },
    };
}

