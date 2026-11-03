// Fakes for the local database tests (feat-localdb-client-1): a service with a
// changes feed and item routes, and a client wired over the in-memory stores.
// Not a test file (no `.test.`); imported by the db_*.test.mjs.
import { memoryStore } from '../../static/chassis/data-store.js';
import { normalize } from '../../static/chassis/data-config.js';
import { createData } from '../../static/chassis/data-client.js';
import { send } from '../../static/chassis/data-send.js';
import { createDb } from '../../static/chassis/db-client.js';
import { parseManifest } from '../../static/chassis/db-config.js';
import { createHub } from '../../static/chassis/db-hub.js';
import { memoryDb } from '../../static/chassis/db-store-mem.js';
import { fakeStorage } from './data_fake.mjs';

const reply = (status, body, rev) => ({
    status, ok: status < 300, headers: new Headers(rev === undefined ? {} : { etag: `"${rev}"` }), json: async () => body,
});

export const MANIFEST = {
    schema: 'h1',
    collections: [{ name: 'dishes', key: 'id', rev: 'rev', indexes: ['name', 'category'], routes: { list: '/data/dishes', item: '/data/dishes/:id' } }],
};

/** A service: `/api/sync` manifest, `/api/sync/dishes` feed, `/data/dishes` item routes. `up` switches the network. */
export function fakeFeed() {
    const s = { items: new Map(), log: [], seq: 0, floor: 0, up: true, refuse: null, calls: [], pageMax: 500, auth: false };
    const bump = (key, deleted) => s.log.push({ seq: ++s.seq, key, deleted });
    s.set = (id, fields) => {
        const old = s.items.get(id);
        s.items.set(id, { rev: (old?.rev ?? 0) + 1, data: { ...(old?.data ?? {}), ...fields, id } });
        bump(id, false);
    };
    s.remove = (id) => { s.items.delete(id); bump(id, true); };
    s.feed = (since, limit) => {
        const after = s.log.filter((e) => e.seq > (since ?? 0));
        const last = new Map(after.map((e) => [e.key, e]));
        const rows = [...last.values()].sort((a, b) => a.seq - b.seq);
        const take = rows.slice(0, Math.min(limit ?? s.pageMax, s.pageMax));
        const upserts = take.filter((e) => !e.deleted).map((e) => ({ key: e.key, rev: s.items.get(e.key).rev, data: s.items.get(e.key).data }));
        const deletes = take.filter((e) => e.deleted && since !== null).map((e) => ({ key: e.key, rev: e.seq }));
        return { upserts, deletes, cursor: String(take.at(-1)?.seq ?? since ?? s.seq), more: take.length < rows.length };
    };
    s.fetch = async (path, init = {}) => {
        const headers = new Headers(init.headers);
        s.calls.push({ path, method: init.method, headers: Object.fromEntries(headers) });
        if (!s.up) throw new TypeError('Failed to fetch');
        if (s.auth) return reply(401, { error: 'login', remedy: 'x' });
        const url = new URL(path, 'http://x');
        if (url.pathname === '/api/sync') return reply(200, s.manifest ?? MANIFEST);
        if (url.pathname === '/api/sync/dishes') {
            const since = url.searchParams.get('since');
            if (since !== null && Number(since) < s.floor) return reply(410, { error: 'old', remedy: 'x', code: 'resync' });
            const limit = url.searchParams.get('limit');
            return reply(200, s.feed(since === null ? null : Number(since), limit ? Number(limit) : undefined));
        }
        return s.item(url.pathname, init, headers);
    };
    s.item = (pathname, init, headers) => {
        if (init.method !== 'GET' && s.refuse) return reply(s.refuse, { error: 'no', remedy: 'x' });
        const id = decodeURIComponent(pathname.split('/')[3] ?? '');
        const cur = s.items.get(id);
        if (init.method === 'GET') return cur ? reply(200, { ...cur.data, rev: cur.rev }, cur.rev) : reply(404, { error: 'none', remedy: 'x' });
        const body = init.body ? JSON.parse(init.body) : {};
        if (init.method === 'POST') {
            if (s.items.has(body.id)) return reply(409, { error: 'exists', remedy: 'x', code: 'exists' });
            s.set(body.id, body);
            return reply(200, { ...s.items.get(body.id).data, rev: s.items.get(body.id).rev }, s.items.get(body.id).rev);
        }
        const want = headers.get('if-match')?.replace(/"/g, '');
        if (cur && want !== undefined && String(cur.rev) !== want) return reply(409, { error: 'stale', remedy: 'x', code: 'stale', rev: cur.rev });
        if (init.method === 'DELETE') { s.remove(id); return reply(200, {}); }
        s.set(id, init.method === 'PATCH' ? body : { ...body });
        return reply(200, { ...s.items.get(id).data, rev: s.items.get(id).rev }, s.items.get(id).rev);
    };
    return s;
}

/** A client over `svc`; `events` collects window events, `timers` the scheduled ones. */
export async function makeDb(svc, { maxBytes, keepAll = true, pageLimit = null, stored = null, overlay = null } = {}) {
    const events = [];
    const listeners = new Map();
    const timers = [];
    const storage = fakeStorage();
    if (keepAll) storage.setItem('chassis-data:kitchen:settings', JSON.stringify({ all: true, items: [] }));
    const config = normalize({ name: 'kitchen', db: { pageLimit, ...(overlay ? { overlay } : {}) }, ...(maxBytes ? { maxBytes } : {}) });
    const emit = (name, detail) => { events.push({ name, detail }); (listeners.get(name) ?? []).forEach((fn) => fn(detail)); };
    const on = (name, fn) => { listeners.set(name, [...(listeners.get(name) ?? []), fn]); return () => {}; };
    let bytes = () => 0;
    let n = 0;
    const uuid = () => `uuid-${++n}`;
    const fetch = (...a) => svc.fetch(...a);
    const data = await createData({
        config, store: memoryStore(), storage, fetch, emit, extraBytes: () => bytes(), uuid,
        setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimer: () => {}, now: () => 1000,
    });
    const store = stored ?? memoryDb(parseManifest(MANIFEST));
    bytes = () => store.bytes();
    const hub = createHub();
    const db = createDb({
        store, data, options: config.db, events: { on }, emit, send: (req) => send(fetch, req), storage, app: 'kitchen',
        now: () => 2000, uuid, hub,
    });
    return { db, dishes: db.collection('dishes'), data, store, events, timers, hub, storage };
}
