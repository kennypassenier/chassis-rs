// fix-overlay-1..3: server-assigned keys, a PUT merged for display, item actions in the overlay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST, fakeFeed, makeDb } from './db_fake.mjs';
import { buildOverlay } from '../../static/chassis/db-overlay.js';
import { parseManifest } from '../../static/chassis/db-config.js';
import { memoryDb } from '../../static/chassis/db-store-mem.js';

const serverKeyed = { ...MANIFEST, collections: [{ ...MANIFEST.collections[0], keys: 'server' }] };

/** The fake feed plus a server that assigns integer ids on POST /data/dishes and applies POST .../stock. */
function serverIds() {
    const svc = fakeFeed();
    svc.manifest = serverKeyed;
    let next = 7;
    const inner = svc.fetch;
    svc.fetch = async (path, init = {}) => {
        if (init.method === 'POST' && path === '/data/dishes') {
            svc.calls.push({ path, method: 'POST', headers: Object.fromEntries(new Headers(init.headers)) });
            if (!svc.up) throw new TypeError('Failed to fetch');
            const id = String(next++);
            svc.set(id, JSON.parse(init.body));
            return { status: 201, ok: true, headers: new Headers(), json: async () => ({ ...svc.items.get(id).data, rev: 1 }) };
        }
        if (init.method === 'POST' && path.endsWith('/stock')) {
            if (!svc.up) throw new TypeError('Failed to fetch');
            const id = path.split('/')[3];
            svc.set(id, { stock: (svc.items.get(id).data.stock ?? 0) + JSON.parse(init.body).delta });
            return { status: 200, ok: true, headers: new Headers(), json: async () => ({}) };
        }
        return inner(path, init);
    };
    return svc;
}
const keyedDb = (svc) => makeDb(svc, { stored: memoryDb(parseManifest(serverKeyed)) });

test('server keys: a queued create shows under a local key, then the real record replaces it', async () => {
    const svc = serverIds();
    const { db, dishes, data } = await keyedDb(svc);
    await db.sync();
    svc.up = false;
    const made = await dishes.create({ name: 'Tea' });
    assert.equal(made.queued, true);
    assert.match(made.key, /^local:/);
    assert.equal(data.queue()[0].body.id, undefined, 'the body carries no key');
    const shown = await dishes.get(made.key);
    assert.deepEqual([shown.name, shown.id, shown.pending], ['Tea', made.key, true]);
    assert.deepEqual((await dishes.all()).map((d) => d.name), ['Tea']);
    await assert.rejects(() => dishes.patch(made.key, { name: 'x' }), /not accepted yet/);
    svc.up = true;
    await data.retry();
    await db.sync();
    const post = svc.calls.find((c) => c.method === 'POST');
    assert.ok(post.headers['idempotency-key'], 'the create carries its Idempotency-Key');
    assert.equal(post.headers['idempotency-key'], made.key.slice('local:'.length));
    const all = await dishes.all();
    assert.deepEqual(all.map((d) => [d.id, d.name]), [['7', 'Tea']]);
    assert.equal(await dishes.get(made.key), null);
});

test('server keys: an online create answers the real key', async () => {
    const svc = serverIds();
    const { dishes } = await keyedDb(svc);
    const made = await dishes.create({ name: 'Soup' });
    assert.equal(made.queued, false);
    assert.equal(made.key, '7');
    assert.equal((await dishes.get('7')).name, 'Soup');
});

test('a queued PUT is merged into the stored record for display', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup', category: 'x' });
    const { db, dishes } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    await dishes.put('1', { name: 'Broth' });
    const shown = await dishes.get('1');
    assert.deepEqual([shown.name, shown.category, shown.pending], ['Broth', 'x', true]);
    assert.equal((await dishes.where('category').equals('x').toArray()).length, 1);
});

test('buildOverlay: a PUT after a delete starts from the body alone', async () => {
    const def = parseManifest(MANIFEST).collections.dishes;
    const entries = [{ method: 'DELETE', path: '/data/dishes/1' }, { method: 'PUT', path: '/data/dishes/1', body: { name: 'N' } }];
    const overlay = await buildOverlay(entries, def, async () => ({ id: '1', old: true }));
    assert.deepEqual(overlay.get('1').data, { name: 'N', id: '1' });
});

test('item actions: the registered transform shows from the queued entry, the queue holds only the name', async () => {
    const svc = serverIds();
    svc.set('1', { name: 'Soup', stock: 1 });
    const { db, dishes, data } = await makeDb(svc);
    await db.sync();
    assert.equal(dishes.action('stock', (record, body) => ({ ...record, stock: record.stock + body.delta })), dishes);
    dishes.action('hide', () => null);
    svc.up = false;
    await dishes.act('1', 'stock', { delta: 2 });
    await dishes.act('1', 'stock', { delta: 4 });
    assert.equal((await dishes.get('1')).stock, 7);
    const queued = data.queue();
    assert.deepEqual(queued.map((e) => [e.method, e.path, e.body]), [['POST', '/data/dishes/1/stock', { delta: 2 }], ['POST', '/data/dishes/1/stock', { delta: 4 }]]);
    assert.doesNotThrow(() => JSON.stringify(queued));
    await dishes.act('1', 'hide');
    assert.equal(await dishes.get('1'), null);
    assert.equal((await dishes.all()).length, 0);
    svc.up = true;
    await data.retry();
    await db.sync();
    assert.equal(data.pending(), 0);
    assert.equal(svc.items.get('1').data.stock, 7, 'the server applied both');
});

test('an action nobody registered, or a throwing transform, leaves the record as stored', async () => {
    const svc = serverIds();
    svc.set('1', { name: 'Soup', stock: 1 });
    const { db, dishes } = await makeDb(svc);
    await db.sync();
    dishes.action('boom', () => { throw new Error('bug'); });
    const warn = console.warn;
    console.warn = () => {};
    svc.up = false;
    await dishes.act('1', 'boom');
    await dishes.act('1', 'other');
    const shown = await dishes.get('1');
    console.warn = warn;
    assert.equal(shown.stock, 1);
    assert.throws(() => dishes.action('bad name', () => {}), /action name/);
    await assert.rejects(() => dishes.act('1', 'bad/name'), /action name/);
});
