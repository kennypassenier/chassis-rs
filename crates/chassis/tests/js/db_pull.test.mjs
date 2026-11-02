// The local database against a fake changes feed (feat-localdb-client-1):
// applying pages, tombstones, the 410 resync, the cap, keep on and off, and
// the overlay of queued writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFeed, makeDb } from './db_fake.mjs';

const names = async (col) => (await col.all()).map((d) => d.name);

test('pages are applied in order, tombstones remove, and the cursor survives', async () => {
    const svc = fakeFeed();
    ['a', 'b', 'c', 'd', 'e'].forEach((n, i) => svc.set(`k${i}`, { name: n }));
    const { db, dishes, store } = await makeDb(svc, { pageLimit: 2 });
    await db.sync(['dishes']);
    assert.deepEqual(await names(dishes), ['a', 'b', 'c', 'd', 'e']);
    assert.equal(svc.calls.filter((c) => c.path.startsWith('/api/sync/dishes')).length, 3, 'three pages of at most two');
    svc.remove('k1');
    svc.set('k0', { name: 'A' });
    await db.sync();
    assert.deepEqual(await names(dishes), ['A', 'c', 'd', 'e']);
    assert.ok(svc.calls.at(-1).path.includes('since='), 'only the changes travel');
    assert.equal((await store.getMeta('dishes')).cursor, String(svc.seq));
});

test('a 410 resyncs the whole collection and drops what the master no longer has', async () => {
    const svc = fakeFeed();
    svc.set('k0', { name: 'keep' });
    svc.set('k1', { name: 'gone' });
    const { db, dishes } = await makeDb(svc);
    await db.sync();
    svc.remove('k1'); // the tombstone is lost to this device
    svc.set('k2', { name: 'new' });
    svc.floor = svc.seq + 1;
    await db.sync();
    assert.deepEqual((await names(dishes)).sort(), ['keep', 'new']);
    assert.equal((await db.collection('dishes').status()).stale, false);
});

test('index queries, ordering and the partial flag', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup', category: 'x' });
    svc.set('2', { name: 'Stew', category: 'y' });
    svc.set('3', { name: 'Salad', category: 'x' });
    const { db, dishes } = await makeDb(svc);
    await db.sync();
    assert.deepEqual((await dishes.where('name').startsWith('S').toArray()).map((d) => d.name), ['Salad', 'Soup', 'Stew']);
    assert.deepEqual((await dishes.where('category').equals('x').sortBy('name', true).toArray()).map((d) => d.name), ['Soup', 'Salad']);
    assert.deepEqual((await dishes.where('name').between('Sa', 'So').limit(1).toArray()).map((d) => d.name), ['Salad']);
    assert.equal(await dishes.where('category').equals('y').count(), 1);
    assert.equal((await dishes.all()).partial, false);
});

test('queued writes are an overlay marked pending; the record stays the server\'s word', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, dishes, store } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    const made = await dishes.create({ name: 'Pie' });
    assert.match(made.key, /^uuid-\d+$/, 'the id is made on the device');
    await dishes.patch('1', { name: 'Broth' });
    const all = await dishes.all();
    assert.deepEqual(all.map((d) => [d.id, d.name, d.pending === true]), [['1', 'Broth', true], [made.key, 'Pie', true]]);
    assert.equal((await store.get('dishes', '1')).data.name, 'Soup', 'the stored record is untouched');
    assert.equal((await dishes.where('name').equals('Pie').toArray()).length, 1, 'a pending create matches local queries');
    await dishes.delete('1');
    assert.deepEqual(await names(dishes), ['Pie']);
    svc.up = true;
    await db.sync();
});

test('after the replay the records are the server\'s answer and nothing is pending', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, dishes, data } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    await dishes.create({ name: 'Pie' });
    await dishes.patch('1', { name: 'Broth' });
    svc.up = true;
    const summary = await data.retry();
    assert.equal(summary.sent, 2);
    await db.sync();
    const all = await dishes.all();
    assert.deepEqual(all.map((d) => [d.name, d.pending === true]), [['Broth', false], ['Pie', false]]);
    const post = svc.calls.find((c) => c.method === 'POST' && c.path === '/data/dishes');
    assert.ok(post.headers['idempotency-key'], 'a create carries its Idempotency-Key');
    assert.equal(svc.calls.find((c) => c.method === 'PATCH').headers['if-match'], '"1"', 'If-Match is the rev the record had');
});

test('a refused edit goes to the failed list and disappears from the view', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, dishes, data } = await makeDb(svc);
    await db.sync();
    svc.up = false;
    await dishes.patch('1', { name: 'Broth' });
    assert.equal((await dishes.get('1')).name, 'Broth');
    svc.up = true;
    svc.refuse = 422;
    await data.retry();
    assert.equal(data.failed().length, 1);
    const back = await dishes.get('1');
    assert.deepEqual([back.name, back.pending], ['Soup', undefined]);
});

test('the cap: a page that would not fit is not stored, the cursor stays, deletes still apply', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'a'.repeat(300) });
    const { db, dishes, store, events } = await makeDb(svc, { maxBytes: 2000 });
    await db.sync();
    const cursor = (await store.getMeta('dishes')).cursor;
    for (let i = 2; i < 20; i += 1) svc.set(String(i), { name: 'b'.repeat(300) });
    svc.remove('1');
    await db.sync();
    const meta = await store.getMeta('dishes');
    assert.equal(meta.stale, true);
    assert.equal(meta.cursor, cursor, 'nothing is lost once there is room');
    assert.equal((await dishes.all()).length, 0, 'the delete was applied although the new items were not stored');
    assert.ok(events.some((e) => e.name === 'chassis-data-storage' && e.detail.level === 'full'));
});

test('keep off stores only chosen items; keeping fetches once through the item route', async () => {
    const svc = fakeFeed();
    ['1', '2', '3'].forEach((id) => svc.set(id, { name: `n${id}` }));
    const { db, dishes, storage } = await makeDb(svc, { keepAll: false });
    await dishes.keep('2', true);
    await db.sync();
    assert.deepEqual(await names(dishes), ['n2']);
    assert.equal((await dishes.all()).partial, true);
    assert.equal(await dishes.isKept('2'), true);
    await dishes.keep('3', true);
    assert.deepEqual(await names(dishes), ['n2', 'n3']);
    assert.ok(svc.calls.some((c) => c.method === 'GET' && c.path === '/data/dishes/3'));
    await dishes.keep('2', false);
    assert.deepEqual(await names(dishes), ['n3']);
    assert.match(storage.getItem('chassis-db:kitchen:keep'), /"dishes":\["3"\]/);
    svc.remove('3');
    await db.sync();
    assert.deepEqual(await names(dishes), [], 'deletes are always applied');
});

test('a 401 stops the pull and reports the expired session through the band event', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, events } = await makeDb(svc);
    svc.auth = true;
    await db.sync();
    assert.ok(events.some((e) => e.name === 'chassis-data-synced' && e.detail.stopped === 'auth'));
});

test('two pulls at once share one run; unreachable is a stop, not an error', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, dishes } = await makeDb(svc);
    await Promise.all([db.sync(), db.sync(), dishes.sync()]);
    svc.up = false;
    const [summary] = await db.sync();
    assert.equal(summary.stopped, 'unreachable');
    assert.equal((await dishes.all()).length, 1, 'the local data is still readable offline');
});

test('purge deletes the database and stops listening', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup' });
    const { db, store } = await makeDb(svc);
    await db.sync();
    await db.purge();
    assert.equal(store.bytes(), 0);
});
