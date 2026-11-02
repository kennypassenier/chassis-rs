// `createData` (feat-offline-1): the app JSON client. GET answers are copied
// for offline use (when the settings say so); writes that cannot reach the
// service are queued with their If-Match and replayed in order. Everything
// that touches the world is injected: `fetch`, the opened store, the settings
// storage, `emit` (events) and timers, so node drives it with fakes.
//
// This file only wires the parts: reads (data-reads.js), writes
// (data-writes.js), settings (data-settings.js), the cache and the queue.

import { createCache } from './data-cache.js';
import { createQueue } from './data-queue.js';
import { createReads } from './data-reads.js';
import { createSettings } from './data-settings.js';
import { createWrites } from './data-writes.js';
import { send } from './data-send.js';

/** The queue's hooks: each replay event becomes a window event. */
function queueHooks(emit, schedule, writes) {
    return {
        onChange: (entries) => {
            emit('chassis-data-queue', { pending: entries.filter((e) => e.state !== 'failed').length, held: entries.filter((e) => e.state === 'held').length,
                failed: entries.filter((e) => e.state === 'failed').length });
            schedule();
        },
        onSent: (entry, rev, outcome) => writes().afterWrite(entry, rev, outcome.body),
        onHeld: (entry) => emit('chassis-data-conflict', { entry }),
        onSyncing: (on) => emit('chassis-data-syncing', { syncing: on }),
        onSynced: (summary) => emit('chassis-data-synced', summary),
    };
}

/** Replay in the background, and a retry timer that runs only while edits wait. */
function createReplayer({ getQueue, config, setTimer, clearTimer }) {
    let timer = null;
    /** A failure is reported, never swallowed. */
    function kick() {
        getQueue().replay().catch((err) => console.warn('chassisData: replaying the queued edits failed.', err));
    }
    function schedule() {
        const pending = getQueue().pending();
        if (pending > 0 && timer === null) {
            timer = setTimer(() => {
                timer = null;
                kick();
            }, config.retryMs);
        } else if (pending === 0 && timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    }
    return { kick, schedule };
}

export async function createData({ config, fetch, store, storage, emit = () => {}, setTimer, clearTimer, now }) {
    let queue = null;
    let writes = null;
    const replayer = createReplayer({ getQueue: () => queue, config, setTimer, clearTimer });
    const cache = await createCache({
        store, config, now,
        extraBytes: () => queue?.bytes() ?? 0,
        onLevel: (detail) => emit('chassis-data-storage', detail),
    });
    const { current, api: settingsApi } = createSettings({ storage, config, cache });
    queue = createQueue({
        store, send: (e) => send(fetch, e), field: config.rev, policy: config.onConflict,
        hooks: queueHooks(emit, replayer.schedule, () => writes),
    });
    await queue.load();
    const ctx = { config, cache, fetch, now, settings: current, queue: () => queue, kick: replayer.kick };
    writes = createWrites(ctx);
    const { afterWrite: _ignored, ...writeApi } = writes;
    replayer.schedule();
    return {
        get: createReads(ctx).get,
        ...writeApi,
        ...settingsApi,
        queue: () => queue.list(),
        pending: () => queue.pending(),
        failed: () => queue.failed(),
        unsent: () => queue.unsent(),
        retry: () => queue.replay(),
        async drop(id) {
            const ok = await queue.drop(id);
            if (ok) replayer.kick(); // a dropped hold lets the edits behind it go
            return ok;
        },
        resave: async (id, options = {}) => {
            const ok = await queue.resave(id, options.rev);
            if (ok) replayer.kick();
            return ok;
        },
        usage: () => cache.usage(),
        async clearCopy() {
            await cache.clear();
        },
        /** Logout: the copy and the queue go; the settings (a flag and paths) stay. */
        async purge() {
            await cache.clear();
            await queue.clear();
        },
    };
}
