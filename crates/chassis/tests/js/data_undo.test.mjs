// Dropping a queued edit undoes its optimistic effect on the copies, and post()
// can amend other read routes ([fix-kitchen-cycle-5], [fix-kitchen-cycle-7]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const LIST = '/api/dishes';
const KITCHEN = '/api/kitchen';
const TAKE = '/api/freezer/1/take';
const seed = () => fakeService({
    [D1]: { id: 1, name: 'Soup', rev: 1 },
    '/api/dishes/2': { id: 2, name: 'Stew', rev: 1 },
    [LIST]: [{ id: 1, name: 'Soup', rev: 1 }, { id: 2, name: 'Stew', rev: 1 }],
    [KITCHEN]: { stock: 5, dishes: [{ id: 1, name: 'Soup', rev: 1 }, { id: 2, name: 'Stew', rev: 1 }], rev: 1 },
});
const config = { routes: ['/api/dishes', '/api/dishes/:id', KITCHEN, '/api/freezer'], composites: [{ path: KITCHEN, lists: { dishes: '/api/dishes/:id' } }] };
const data = async (store, path) => (await store.getRead(path))?.data;

async function primed(svc) {
    const c = await makeClient(svc, { config });
    await c.data.keepAll(true);
    for (const p of [D1, LIST, KITCHEN]) await c.data.get(p);
    svc.up = false;
    return c;
}

test('dropping a queued DELETE puts back the item copy and its entries in the lists and the composite, in place', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.delete(D1);
    assert.equal(await data(store, D1), undefined, 'the optimistic delete removed the copy');
    assert.deepEqual((await data(store, LIST)).map((d) => d.id), [2]);
    assert.deepEqual((await data(store, KITCHEN)).dishes.map((d) => d.id), [2]);
    assert.equal(await client.drop(client.queue()[0].id), true);
    assert.deepEqual(await data(store, D1), { id: 1, name: 'Soup', rev: 1 });
    assert.deepEqual((await data(store, LIST)).map((d) => d.name), ['Soup', 'Stew'], 'back at its place');
    assert.deepEqual((await data(store, KITCHEN)).dishes.map((d) => d.id), [1, 2]);
    assert.equal(client.pending(), 0);
});

test('dropping a queued PATCH restores the item copy and the list entries', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.patch(D1, { name: 'Broth' });
    assert.equal((await data(store, D1)).name, 'Broth');
    await client.drop(client.queue()[0].id);
    assert.equal((await data(store, D1)).name, 'Soup');
    assert.deepEqual((await data(store, LIST)).map((d) => d.name), ['Soup', 'Stew']);
    assert.deepEqual((await data(store, KITCHEN)).dishes.map((d) => d.name), ['Soup', 'Stew']);
});

test('dropping an earlier edit keeps the effect of a later edit to the same item', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.patch(D1, { name: 'Broth' });
    await client.patch(D1, { note: 'hot' });
    await client.drop(client.queue()[0].id);
    assert.deepEqual(await data(store, D1), { id: 1, name: 'Soup', rev: 1, note: 'hot' });
    assert.equal((await data(store, LIST))[0].note, 'hot');
    // and the later edit can still be dropped cleanly
    await client.drop(client.queue()[0].id);
    assert.deepEqual(await data(store, D1), { id: 1, name: 'Soup', rev: 1 });
    assert.deepEqual((await data(store, LIST))[0], { id: 1, name: 'Soup', rev: 1 });
});

test('dropping a failed edit leaves the copies alone (they were reset when it was refused)', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.patch(D1, { name: 'Broth' });
    svc.items[D1] = { id: 1, name: 'Soup 2', rev: 2 }; // changed elsewhere
    svc.up = true;
    await client.retry();
    assert.equal(client.failed().length, 1);
    const before = await data(store, D1);
    svc.calls.length = 0;
    await client.drop(client.failed()[0].id);
    assert.deepEqual(await data(store, D1), before);
    assert.equal(svc.calls.length, 0, 'nothing was asked of the server');
});

test('a dropped create leaves the lists again', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.post(LIST, { id: 9, name: 'New' });
    assert.equal((await data(store, LIST)).length, 3);
    await client.drop(client.queue()[0].id);
    assert.deepEqual((await data(store, LIST)).map((d) => d.id), [1, 2]);
});

test('post amends: the named read routes change like optimistic, and the amendment is undone on drop', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    const take = (copy) => ({ ...copy, stock: copy.stock - 1 });
    const r = await client.post(TAKE, {}, { amends: { [KITCHEN]: take } });
    assert.equal(r.queued, true);
    assert.equal((await data(store, KITCHEN)).stock, 4);
    assert.deepEqual(client.queue()[0].amended, [KITCHEN]);
    assert.ok(client.queue().every((e) => !JSON.stringify(e).includes('=>')), 'functions never live in the queue');
    await client.drop(client.queue()[0].id);
    assert.equal((await data(store, KITCHEN)).stock, 5);
});

test('post amends and optimistic work together; both are undone on drop', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.post(D1, {}, { optimistic: (c) => ({ ...c, name: 'Taken' }), amends: { [KITCHEN]: (c) => ({ ...c, stock: 0 }) } });
    assert.equal((await data(store, D1)).name, 'Taken');
    assert.equal((await data(store, KITCHEN)).stock, 0);
    await client.drop(client.queue()[0].id);
    assert.equal((await data(store, D1)).name, 'Soup');
    assert.equal((await data(store, KITCHEN)).stock, 5);
});

test('post amends: a replayed POST reads the amended route again, and a refused one resets it to the server', async () => {
    const svc = seed();
    const { data: client, store } = await primed(svc);
    await client.post(TAKE, {}, { amends: { [KITCHEN]: (c) => ({ ...c, stock: c.stock - 1 }) } });
    svc.items[KITCHEN] = { ...svc.items[KITCHEN], stock: 3, rev: 2 }; // the server's own count after the take
    svc.up = true;
    await client.retry();
    assert.equal((await data(store, KITCHEN)).stock, 3, 'the server answer replaced the amendment');
    // refused
    svc.up = false;
    await client.post(TAKE, {}, { amends: { [KITCHEN]: (c) => ({ ...c, stock: c.stock - 1 }) } });
    assert.equal((await data(store, KITCHEN)).stock, 2);
    svc.up = true; svc.refusePost = 422;
    await client.retry();
    assert.equal(client.failed().length, 1);
    assert.equal((await data(store, KITCHEN)).stock, 3, 'back to the server version');
});

test('post amends is validated: an object of functions over declared routes', async () => {
    const { data: client } = await makeClient(seed(), { config });
    await assert.rejects(client.post(TAKE, {}, { amends: [] }), /amends must be an object/);
    await assert.rejects(client.post(TAKE, {}, { amends: { [KITCHEN]: 'no' } }), /must be a function/);
    await assert.rejects(client.post(TAKE, {}, { amends: { '/api/unknown': (c) => c } }), /not a declared route/);
    await assert.rejects(client.post(TAKE, {}, { amends: { 'https://x/api/kitchen': (c) => c } }), /not a path of this app/);
});

test('an online post with amends changes nothing locally (nothing is queued)', async () => {
    const svc = seed();
    const { data: client, store } = await makeClient(svc, { config });
    await client.keepAll(true);
    await client.get(KITCHEN);
    const r = await client.post(TAKE, {}, { amends: { [KITCHEN]: (c) => ({ ...c, stock: 0 }) } });
    assert.equal(r.queued, false);
    assert.equal((await data(store, KITCHEN)).stock, 5);
});
