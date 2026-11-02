// fix-habits-data-3: a write to an item path reaches the stored lists that hold it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const LIST = '/api/dishes';
const seed = () => fakeService({
    [D1]: { id: 1, name: 'Soup', rev: 1 },
    '/api/dishes/2': { id: 2, name: 'Stew', rev: 1 },
    [LIST]: [{ id: 1, name: 'Soup', rev: 1 }, { id: 2, name: 'Stew', rev: 1 }],
    [`${LIST}?q=s`]: { items: [{ id: 1, name: 'Soup', rev: 1 }] },
});
const names = async (store, path) => {
    const d = (await store.getRead(path)).data;
    return (Array.isArray(d) ? d : d.items).map((e) => e.name);
};

async function primed(svc) {
    const c = await makeClient(svc);
    await c.data.keepAll(true);
    for (const p of [LIST, `${LIST}?q=s`]) await c.data.get(p);
    return c;
}

test('an offline patch shows in every stored list that holds the item, a put replaces, a delete removes', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    svc.up = false;
    await data.patch(D1, { name: 'Broth' }); // the item itself was never read: only the lists change
    assert.deepEqual(await names(store, LIST), ['Broth', 'Stew']);
    assert.deepEqual(await names(store, `${LIST}?q=s`), ['Broth']);
    await data.put(D1, { id: 1, name: 'Chowder' });
    assert.deepEqual(await names(store, LIST), ['Chowder', 'Stew']);
    await data.delete(D1);
    assert.deepEqual(await names(store, LIST), ['Stew']);
    assert.deepEqual(await names(store, `${LIST}?q=s`), []);
});

test('an online write puts the server answer into the lists', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    await data.patch(D1, { name: 'Broth' });
    const entry = (await store.getRead(LIST)).data[0];
    assert.deepEqual([entry.name, entry.rev], ['Broth', 2]);
});

test('a refused replay gives the lists the server version, not the optimistic one', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    await data.get(D1); // the copy's revision goes out as If-Match
    svc.up = false;
    await data.put(D1, { id: 1, name: 'Mine' });
    assert.deepEqual(await names(store, LIST), ['Mine', 'Stew']);
    svc.items[D1] = { id: 1, name: 'Theirs', rev: 5 };
    svc.up = true;
    await data.retry();
    assert.equal(data.failed().length, 1);
    assert.deepEqual(await names(store, LIST), ['Theirs', 'Stew']);
});

test('post with optimistic amends the list entries of an item path and rolls back on refusal', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    svc.up = false;
    await data.post(D1, { n: 1 }, { optimistic: (c) => ({ ...c, name: 'Maybe' }) });
    assert.deepEqual(await names(store, LIST), ['Maybe', 'Stew']);
    svc.up = true; svc.refusePost = 422;
    await data.retry();
    assert.deepEqual(await names(store, LIST), ['Soup', 'Stew']);
});
