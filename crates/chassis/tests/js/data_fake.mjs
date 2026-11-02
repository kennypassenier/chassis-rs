// Fakes for the offline client tests: a service with revisions, and the page
// environment. Not a test file (no `.test.`), imported by the data_*.test.mjs.
import { memoryStore } from '../../static/chassis/data-store.js';
import { normalize } from '../../static/chassis/data-config.js';
import { createData } from '../../static/chassis/data-client.js';

/** A JSON service: items by path with `rev`, If-Match honoured, switchable network. */
export function fakeService(items = {}) {
    const svc = { items: { ...items }, up: true, calls: [], status: null, posted: new Map(), taken: 0, refusePost: null };
    svc.fetch = async (path, init = {}) => {
        const headers = new Headers(init.headers);
        svc.calls.push({ path, method: init.method, headers: Object.fromEntries(headers), body: init.body, credentials: init.credentials });
        if (!svc.up) throw new TypeError('Failed to fetch');
        if (svc.status) return reply(svc.status, { error: 'forced', remedy: 'x' });
        const cur = svc.items[path];
        if (init.method === 'GET') return cur ? reply(200, cur, cur.rev) : reply(404, { error: 'none', remedy: 'x' });
        if (init.method === 'POST') { // an action: applied once per Idempotency-Key, a repeat answers the first result
            const key = headers.get('idempotency-key');
            if (svc.refusePost) return reply(svc.refusePost, { error: 'no', remedy: 'x' });
            if (key && svc.posted.has(key)) return reply(200, svc.posted.get(key));
            const result = { taken: ++svc.taken };
            if (key) svc.posted.set(key, result);
            return reply(200, result);
        }
        const want = headers.get('if-match')?.replace(/"/g, '');
        if (want !== undefined && cur && String(cur.rev) !== want) return reply(409, { error: 'stale', remedy: 'reload', code: 'stale', rev: cur.rev });
        if (init.method === 'DELETE') { delete svc.items[path]; return reply(200, {}); }
        const body = JSON.parse(init.body);
        const next = { ...(init.method === 'PATCH' ? cur : {}), ...body, rev: (cur?.rev ?? 0) + 1 };
        svc.items[path] = next;
        return reply(200, next, next.rev);
    };
    return svc;
}

function reply(status, body, rev) {
    const headers = new Headers(rev === undefined ? {} : { etag: `"${rev}"` });
    return { status, ok: status < 300, headers, json: async () => body };
}

export function fakeStorage() {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), dump: () => [...m.entries()] };
}

export const ROUTES = ['/api/dishes', '/api/dishes/:id'];

/** A client over a fake service; `events` collects what it emitted. */
export async function makeClient(svc, options = {}) {
    const events = [];
    const timers = [];
    const store = options.store ?? memoryStore();
    const storage = options.storage ?? fakeStorage();
    const config = normalize({ name: 'kitchen', routes: ROUTES, ...options.config });
    const data = await createData({
        config, store, storage, fetch: (...a) => svc.fetch(...a), // late-bound: a test may wrap svc.fetch
        emit: (name, detail) => events.push({ name, detail }),
        setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
        clearTimer: () => {},
        now: () => 1000,
    });
    return { data, events, timers, store, storage, svc };
}

/**
 * A fake IndexedDB for the origin-wide scan: `dbs` maps a database name to
 * its queue entries (or `null` for a database whose open fails). Records
 * which names were opened, deleted, and whether any open passed a version.
 */
export function fakeIndexedDb(dbs) {
    const log = { opened: [], deleted: [], versions: [] };
    const request = (run) => {
        const req = {};
        queueMicrotask(() => { try { req.result = run(); req.onsuccess?.(); } catch (e) { req.error = e; req.onerror?.(); } });
        return req;
    };
    return {
        log,
        databases: async () => Object.keys(dbs).map((name) => ({ name, version: 1 })),
        open(name, version) {
            log.opened.push(name); log.versions.push(version);
            return request(() => {
                if (dbs[name] === null) throw new Error('open failed');
                const entries = dbs[name];
                return {
                    close() { log.closed = (log.closed ?? 0) + 1; },
                    objectStoreNames: { contains: (n) => n === 'queue' && !entries.noQueue },
                    transaction: () => ({ objectStore: () => ({ count: () => request(() => entries.length) }) }),
                };
            });
        },
        deleteDatabase(name) { log.deleted.push(name); return request(() => delete dbs[name]); },
    };
}
