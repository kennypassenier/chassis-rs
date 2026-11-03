// fix-db-habits-1..3: create through another route, a per-collection overlay function, opts.rev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFeed, makeDb } from './db_fake.mjs';
import { buildOverlay } from '../../static/chassis/db-overlay.js';
import { normalizeDb, parseManifest } from '../../static/chassis/db-config.js';
import { MANIFEST } from './db_fake.mjs';

const def = parseManifest(MANIFEST).collections.dishes;

test('create({ path }) POSTs to the other route and the body shows as a pending create', async () => {
    const svc = fakeFeed();
    const { db, dishes, data } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    const made = await dishes.create({ name: 'Quick', quick: 'buy milk' }, { path: '/data/quick-add' });
    assert.equal(made.queued, true);
    assert.equal(data.queue()[0].path, '/data/quick-add');
    assert.equal(data.queue()[0].collection, 'dishes');
    const shown = await dishes.get(made.key);
    assert.deepEqual([shown.name, shown.pending], ['Quick', true]);
    assert.deepEqual((await dishes.all()).map((d) => d.name), ['Quick']);
    svc.up = true;
    await data.retry();
    assert.ok(svc.calls.some((c) => c.method === 'POST' && c.path === '/data/quick-add'));
    assert.equal(data.queue().length, 0);
});

test('create({ path }) refuses a path that is not of this app', async () => {
    const { dishes } = await makeDb(fakeFeed());
    await assert.rejects(() => dishes.create({ name: 'x' }, { path: '//evil.test/x' }), /path of this app/);
    await assert.rejects(() => dishes.create({ name: 'x' }, { path: 'data/x' }), /path of this app/);
});

test('a POST to another route without the collection mark is not overlaid', async () => {
    const overlay = await buildOverlay([{ method: 'POST', path: '/data/quick-add', body: { id: 'q', name: 'N' } }], def, async () => null);
    assert.equal(overlay.size, 0);
});

test('db.overlay: the function lays a PATCH over the record, and a null record for a create', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup', done_at: null });
    const seen = [];
    const overlay = {
        dishes: (record, entry) => {
            seen.push([record === null, entry.method]);
            if (record === null) return { ...entry.body, done_at: null };
            return entry.method === 'PATCH' && entry.body.done ? { ...record, done_at: 'now' } : { ...record, ...entry.body };
        },
    };
    const { db, dishes } = await makeDb(svc, { overlay });
    await db.sync();
    svc.up = false;
    await dishes.patch('1', { done: true });
    const shown = await dishes.get('1');
    assert.equal(shown.done_at, 'now');
    assert.equal(shown.done, undefined, 'the default merge did not run');
    await dishes.create({ id: 'n', name: 'New' });
    assert.equal((await dishes.get('n')).done_at, null);
    assert.ok(seen.some(([isNull, method]) => isNull && method === 'POST'), 'a create is laid over null');
    assert.ok(seen.every(([isNull, method]) => isNull === (method === 'POST')));
});

test('db.overlay: null hides, a throw or a non-record falls back to the default merge, actions are untouched', async () => {
    const base = async () => ({ id: '1', name: 'A' });
    const patch = [{ method: 'PATCH', path: '/data/dishes/1', body: { name: 'B' } }];
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.equal((await buildOverlay(patch, def, base, new Map(), () => null)).get('1').deleted, true);
        assert.equal((await buildOverlay(patch, def, base, new Map(), () => { throw new Error('x'); })).get('1').data.name, 'B');
        assert.equal((await buildOverlay(patch, def, base, new Map(), () => 5)).get('1').data.name, 'B');
        const act = [{ method: 'POST', path: '/data/dishes/1/stock', body: {} }];
        const actions = new Map([['stock', (r) => ({ ...r, stock: 9 })]]);
        const out = await buildOverlay(act, def, base, actions, () => ({ id: '1', wrong: true }));
        assert.equal(out.get('1').data.stock, 9);
    } finally {
        console.warn = warn;
    }
});

test('db.overlay is validated', () => {
    assert.throws(() => normalizeDb({ overlay: { dishes: 'no' } }), /must be a function/);
    assert.throws(() => normalizeDb({ overlay: [] }), /object of functions/);
    assert.deepEqual(normalizeDb(true).overlay, {});
});

test('opts.rev overrides the stored rev for patch, put, delete and act', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' }); // stored rev 1
    const { db, dishes, data } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    await dishes.patch('1', { name: 'a' }, { rev: 7 });
    await dishes.put('1', { name: 'b' }, { rev: 8 });
    await dishes.delete('1', { rev: 9 });
    await dishes.act('1', 'stock', {}, { rev: 10 });
    await dishes.patch('1', { name: 'c' });
    assert.deepEqual(data.queue().map((e) => e.ifMatch), ['7', '8', '9', '10', '1']);
});

test('opts.rev: a write after a non-collection write does not 409 against its own change', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, dishes } = await makeDb(svc);
    await db.sync();
    svc.set('1', { name: 'Moved' }); // a route outside the collection changed it: rev 2, the store still has 1
    await assert.rejects(() => dishes.patch('1', { name: 'x' }), (err) => err.status === 409 || /stale|409/.test(String(err.message)));
    const ok = await dishes.patch('1', { name: 'x' }, { rev: 2 });
    assert.equal(ok.queued, false);
});
