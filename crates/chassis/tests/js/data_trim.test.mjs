// Trimmed keeping (feat-offline-keep-1): with "keep everything" off, a stored
// list holds only the entries of kept items; the transitions of both switches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const LIST = '/api/dishes';
const P = (n) => `/api/dishes/${n}`;
const dish = (id) => ({ id, name: `Dish ${id}`, rev: 1 });

function five() {
    const items = { [LIST]: [1, 2, 3, 4, 5].map(dish) };
    for (const n of [1, 2, 3, 4, 5]) items[P(n)] = dish(n);
    return fakeService(items);
}
const ids = (data) => data.map((d) => d.id);

test('with keepAll off, a stored list keeps only the entries of kept items', async () => {
    const svc = five();
    const { data, store } = await makeClient(svc);
    await data.keepItem(P(2), true); await data.keepItem(P(4), true);
    assert.equal(ids((await data.get(LIST)).data).length, 5, 'online the caller sees the whole answer');
    const rec = await store.getRead(LIST);
    assert.deepEqual([ids(rec.data), rec.partial], [[2, 4], true]);
    svc.up = false;
    const off = await data.get(LIST);
    assert.deepEqual([off.offline, off.partial, ids(off.data)], [true, true, [2, 4]]);
});

test('item routes are stored only for kept items', async () => {
    const svc = five();
    const { data, store } = await makeClient(svc);
    await data.keepItem(P(2), true);
    for (const n of [1, 2, 3]) await data.get(P(n));
    assert.deepEqual((await store.allReads()).map((r) => r.path), [P(2)]);
});

test('turning an item off removes its copy and its entry from stored lists', async () => {
    const svc = five();
    const { data, store } = await makeClient(svc);
    await data.keepItem(P(2), true); await data.keepItem(P(4), true);
    await data.get(LIST); await data.get(P(2)); await data.get(P(4));
    await data.keepItem(P(2), false);
    assert.equal(await store.getRead(P(2)), null);
    assert.deepEqual(ids((await store.getRead(LIST)).data), [4]);
    await data.keepItem(P(4), false);
    assert.deepEqual((await store.allReads()).map((r) => r.path), [], 'no kept item left: the list goes too');
});

test('turning keepAll off trims everything not kept; turning it on stores full answers on the next GET', async () => {
    const svc = five();
    const { data, store } = await makeClient(svc);
    await data.keepAll(true);
    await data.get(LIST); for (const n of [1, 2, 3]) await data.get(P(n));
    assert.equal((await store.getRead(LIST)).partial, false);
    await data.keepItem(P(2), true);
    await data.keepAll(false);
    assert.deepEqual((await store.allReads()).map((r) => r.path).sort(), [LIST, P(2)]);
    assert.deepEqual(ids((await store.getRead(LIST)).data), [2]);
    assert.equal((await store.getRead(LIST)).partial, true);
    await data.keepAll(true);
    await data.get(LIST);
    const rec = await store.getRead(LIST);
    assert.deepEqual([ids(rec.data).length, rec.partial], [5, false]);
    svc.up = false;
    assert.equal((await data.get(LIST)).partial, false);
});

test('a queued write is never dropped by trimming', async () => {
    const svc = five();
    const { data } = await makeClient(svc);
    await data.keepItem(P(2), true); await data.keepItem(P(3), true);
    await data.get(P(3));
    svc.up = false;
    await data.put(P(3), { id: 3, name: 'Changed' });
    await data.keepItem(P(3), false);
    await data.keepAll(false);
    assert.equal(data.pending(), 1);
    assert.equal(data.queue()[0].path, P(3));
});

test('a list without an item route, or of unknown shape, is not stored while keepAll is off', async () => {
    const svc = fakeService({ [LIST]: { weird: true }, [P(1)]: dish(1) });
    const { data, store } = await makeClient(svc);
    await data.keepItem(P(1), true);
    await data.get(LIST);
    assert.equal(await store.getRead(LIST), null);
});

test('itemKey may be a function and the list may be wrapped in {items}', async () => {
    const svc = fakeService({ [LIST]: { total: 2, items: [{ slug: 'a' }, { slug: 'b' }] } });
    const { data, store } = await makeClient(svc, { config: { itemKey: (e) => e.slug } });
    await data.keepItem(P('b'), true);
    await data.get(LIST);
    assert.deepEqual((await store.getRead(LIST)).data, { total: 2, items: [{ slug: 'b' }] });
});
