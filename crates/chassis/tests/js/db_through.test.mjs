// Read-through for a collection that is not kept, and db.clear() ([fix-kitchen-cycle-3], [fix-kitchen-cycle-4]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFeed, makeDb } from './db_fake.mjs';

const names = async (q) => (await (q.toArray ? q.toArray() : q)).map((d) => d.name);
const seeded = () => {
    const svc = fakeFeed();
    svc.list = true;
    ['1', '2', '3'].forEach((id) => svc.set(id, { name: `n${id}`, category: id === '3' ? 'b' : 'a' }));
    return svc;
};
const stored = async (store) => (await store.all('dishes')).map((r) => r.key);

test('keep off: reads fall through to the list route; only kept items are stored', async () => {
    const svc = seeded();
    const { db, dishes, store } = await makeDb(svc, { keepAll: false });
    await dishes.keep('2', true);
    await db.sync();
    assert.deepEqual(await stored(store), ['2']);
    const all = await dishes.all();
    assert.deepEqual(all.map((d) => d.name), ['n1', 'n2', 'n3'], 'the not-kept items are read through');
    assert.equal(all.partial, true);
    assert.deepEqual(await stored(store), ['2'], 'a read-through item is shown, not stored');
    assert.deepEqual(await names(dishes.where('category').equals('b')), ['n3'], 'queries filter the server rows');
    assert.deepEqual(await names(dishes.sortBy('name', true)), ['n3', 'n2', 'n1']);
    assert.equal(await dishes.query().count(), 3);
});

test('keep off: a kept item the read brings in newer is stored; a new one is stored when kept', async () => {
    const svc = seeded();
    const { db, dishes, store } = await makeDb(svc, { keepAll: false });
    await dishes.keep('2', true);
    await db.sync();
    svc.set('2', { name: 'changed' }); // the feed has not been pulled yet
    assert.equal((await dishes.all()).find((d) => d.id === '2').name, 'changed');
    assert.equal((await store.get('dishes', '2')).data.name, 'changed', 'a kept item follows the answer');
});

test('keep off: get() of an item not on the device asks the item route and stores nothing', async () => {
    const svc = seeded();
    const { dishes, store } = await makeDb(svc, { keepAll: false });
    assert.equal((await dishes.get('1')).name, 'n1');
    assert.ok(svc.calls.some((c) => c.method === 'GET' && c.path === '/data/dishes/1'));
    assert.deepEqual(await stored(store), []);
    assert.equal(await dishes.get('nope'), null, 'a 404 is no item');
});

test('keep off and offline: the stored records are shown; keep all on: no list request at all', async () => {
    const svc = seeded();
    const off = await makeDb(svc, { keepAll: false });
    await off.dishes.keep('2', true);
    await off.db.sync();
    svc.up = false;
    assert.deepEqual(await names(off.dishes.all()), ['n2']);
    svc.up = true;
    const on = await makeDb(svc, { keepAll: true });
    await on.db.sync();
    svc.calls.length = 0;
    await on.dishes.all();
    assert.ok(!svc.calls.some((c) => c.path === '/data/dishes'), 'everything is on the device');
});

test('keep off: an error answer is reported and the stored records are shown', async () => {
    const svc = seeded();
    const warnings = [];
    const warn = console.warn;
    console.warn = (...a) => warnings.push(a.join(' '));
    try {
        const { db, dishes } = await makeDb(svc, { keepAll: false });
        await dishes.keep('2', true);
        await db.sync();
        svc.listStatus = 500;
        assert.deepEqual(await names(dishes.all()), ['n2']);
    } finally {
        console.warn = warn;
    }
    assert.ok(warnings.some((w) => /through the service answered 500/.test(w)), warnings.join('|'));
});

test('the overlay still lays queued edits over read-through rows', async () => {
    const svc = seeded();
    const db0 = await makeDb(svc, { keepAll: false });
    const { dishes } = db0;
    await dishes.create({ id: 'x', name: 'new' }); // online: sent at once
    svc.up = false;
    await dishes.patch('1', { name: 'edited' }); // offline: queued
    assert.equal(db0.data.pending(), 1);
    svc.up = true; // the read goes through while the edit waits
    svc.calls.length = 0;
    const list = await dishes.all();
    assert.ok(list.find((d) => d.name === 'edited' && d.pending));
});

test('db.clear() empties the stores and forgets the cursors; the queue and the keep choices stay', async () => {
    const svc = seeded();
    const { db, dishes, data, store, storage } = await makeDb(svc, { keepAll: false });
    await dishes.keep('2', true);
    await db.sync();
    svc.up = false;
    await dishes.patch('2', { name: 'edited' });
    assert.ok(db.bytes() > 0);
    const summary = await db.clear();
    assert.deepEqual(summary, { collections: ['dishes'], waiting: 1 });
    assert.deepEqual(await stored(store), []);
    assert.equal(db.bytes(), 0, 'usage is back to 0');
    assert.equal((await store.getMeta('dishes')).cursor, undefined);
    assert.equal(data.queue().length, 1, 'the waiting edit stays');
    assert.match(storage.getItem('chassis-db:kitchen:keep'), /"dishes":\["2"\]/, 'the keep choice stays');
    assert.equal(await dishes.isKept('2'), true);
    svc.up = true;
    await db.sync();
    assert.ok((await stored(store)).includes('2'), 'the next pull brings the kept item back');
});

test('the facade clear() waits for the database and empties it', async () => {
    const { lazyDb } = await import('../../static/chassis/db-lazy.js');
    const svc = seeded();
    const { db } = await makeDb(svc);
    await db.sync();
    const lazy = lazyDb({ ensure: async () => db, hub: { watch() {} } });
    assert.equal((await lazy.clear()).waiting, 0);
    assert.equal(db.bytes(), 0);
});
