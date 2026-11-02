// `createData` (feat-offline-1): the app JSON client. GET answers are copied
// for offline use (when the settings say so); writes that cannot reach the
// service are queued with their If-Match and replayed in order. Everything
// that touches the world is injected: `fetch`, the opened store, the settings
// storage, `emit` (events) and timers, so node drives it with fakes.

import { checkPath, matchRoute } from './data-config.js';
import { createCache } from './data-cache.js';
import { classify } from './data-policy.js';
import { revOf } from './data-rev.js';
import { loadSettings, saveSettings, shouldKeep, withAll, withItem } from './data-keep.js';
import { createQueue } from './data-queue.js';
import { send } from './data-send.js';

const fail = (message, extra = {}) => Object.assign(new Error(`chassisData: ${message}`), extra);

function checkOptions(options) {
    if (options.headers) {
        throw fail('custom headers are not accepted. The session cookie authenticates; nothing else is sent or stored.');
    }
}

/** What a failed answer becomes for the caller (the kit's `{error, remedy}` sentence). */
function refusal(outcome) {
    const b = outcome.body;
    const text = b?.error ? `${b.error}.${b.remedy ? ` ${b.remedy}` : ''}` : `The service answered ${outcome.status}.`;
    return fail(text, { status: outcome.status, body: b ?? null });
}

export async function createData({ config, fetch, store, storage, emit = () => {}, setTimer, clearTimer, now }) {
    let settings = loadSettings(storage, config.name);
    let queue = null;
    let timer = null;
    const cache = await createCache({
        store, config, now,
        extraBytes: () => queue?.bytes() ?? 0,
        onLevel: (detail) => emit('chassis-data-storage', detail),
    });
    const hooks = {
        onChange: (entries) => {
            emit('chassis-data-queue', { pending: entries.length, held: entries.filter((e) => e.state === 'held').length });
            schedule();
        },
        onSent: (entry, rev, outcome) => afterWrite(entry, rev, outcome.body),
        onHeld: (entry) => emit('chassis-data-conflict', { entry }),
        onSyncing: (on) => emit('chassis-data-syncing', { syncing: on }),
        onSynced: (summary) => emit('chassis-data-synced', summary),
    };
    queue = createQueue({ store, send: (e) => send(fetch, e), field: config.rev, policy: config.onConflict, hooks });
    await queue.load();

    /** Replay in the background; a failure is reported, never swallowed. */
    function kick() {
        queue.replay().catch((err) => console.warn('chassisData: replaying the queued edits failed.', err));
    }

    /** A timer runs only while edits wait (one retry cadence: `retryMs`). */
    function schedule() {
        if (queue.pending() > 0 && timer === null) {
            timer = setTimer(() => {
                timer = null;
                kick();
            }, config.retryMs);
        } else if (queue.pending() === 0 && timer !== null) {
            clearTimer(timer);
            timer = null;
        }
    }

    async function afterWrite(entry, rev, body) {
        const route = matchRoute(config, entry.path);
        if (!route) return;
        if (entry.method === 'DELETE') return cache.forget(entry.path);
        if (shouldKeep(settings, route, entry.path) && body && typeof body === 'object') {
            await cache.remember(entry.path, body, rev);
        }
    }

    /** What a queued edit does to the copy, so offline reads show it. */
    function optimistic(method, path, body) {
        if (method === 'DELETE') return cache.amend(path, () => undefined);
        const merge = method === 'PATCH' ? (old) => ({ ...old, ...body }) : () => body;
        return cache.amend(path, merge);
    }

    async function write(method, path, body, options = {}) {
        checkOptions(options);
        checkPath(path);
        const held = await cache.read(path);
        const ifMatch = options.rev !== undefined ? String(options.rev) : (held?.rev ?? null);
        const entry = { method, path, body, ifMatch, at: now() };
        if (queue.pending() === 0) {
            const outcome = await send(fetch, entry);
            const kind = classify(outcome.status);
            if (kind === 'ok') return finish(entry, outcome);
            if (kind !== 'unreachable') throw refusal(outcome);
        }
        await queue.add(entry);
        await optimistic(method, path, body);
        kick();
        return { ok: true, queued: true, status: 0, data: null, rev: null };
    }

    async function finish(entry, outcome) {
        const rev = revOf(outcome.body, outcome.etag, config.rev);
        await afterWrite(entry, rev, outcome.body);
        return { ok: true, queued: false, status: outcome.status, data: outcome.body, rev };
    }

    async function get(path) {
        checkPath(path);
        const outcome = await send(fetch, { method: 'GET', path });
        const route = matchRoute(config, path);
        if (classify(outcome.status) === 'ok') {
            const rev = revOf(outcome.body, outcome.etag, config.rev);
            if (shouldKeep(settings, route, path)) await cache.remember(path, outcome.body, rev);
            return { data: outcome.body, rev, offline: false, savedAt: null };
        }
        if (classify(outcome.status) !== 'unreachable') throw refusal(outcome);
        const copy = route ? await cache.read(path) : null;
        if (!copy) throw fail('the service cannot be reached and there is no offline copy of this page.', { status: 0, offline: true });
        return { data: copy.data, rev: copy.rev, offline: true, savedAt: copy.savedAt };
    }

    const persistSettings = (next) => {
        settings = next;
        saveSettings(storage, config.name, settings);
        return settings;
    };

    const api = {
        get,
        put: (path, body, options) => write('PUT', path, body, options),
        patch: (path, body, options) => write('PATCH', path, body, options),
        delete: (path, options) => write('DELETE', path, undefined, options),
        queue: () => queue.list(),
        pending: () => queue.pending(),
        retry: () => queue.replay(),
        drop: (id) => queue.drop(id),
        resave: async (id, options = {}) => {
            const ok = await queue.resave(id, options.rev);
            if (ok) kick();
            return ok;
        },
        settings: () => ({ all: settings.all, items: [...settings.items] }),
        keepAll: (on) => persistSettings(withAll(settings, on)).all,
        keepItem(path, on) {
            const route = matchRoute(config, path);
            if (route?.kind !== 'item') throw fail(`${path} is not an item route of this app. Add "…/:id" to routes.`);
            persistSettings(withItem(settings, path, on));
            return on === true && settings.items.includes(path);
        },
        isKept: (path) => shouldKeep(settings, matchRoute(config, path), path),
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
    schedule();
    return api;
}
