// fix-overlay-4..6: composite list answers, queued creates joining the lists, a PUT merged into a list entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient, ROUTES } from './data_fake.mjs';
import { normalize } from '../../static/chassis/data-config.js';

const SNAP = '/api/snapshot';
const LIST = '/api/dishes';
const D1 = '/api/dishes/1';
const config = { routes: [...ROUTES, SNAP], composites: [{ path: SNAP, lists: { dishes: '/api/dishes/:id' } }] };
const seed = () => fakeService({
    [D1]: { id: 1, name: 'Soup', kind: 'a', rev: 1 },
    [LIST]: [{ id: 1, name: 'Soup', kind: 'a', rev: 1 }],
    [SNAP]: { today: 'mon', dishes: [{ id: 1, name: 'Soup', kind: 'a', rev: 1 }], rev: 1 },
});
async function primed(svc) {
    const c = await makeClient(svc, { config });
    await c.data.keepAll(true);
    await c.data.get(LIST);
    await c.data.get(SNAP);
    return c;
}
const snap = async (store) => (await store.getRead(SNAP)).data;

test('composites are validated against the declared routes', () => {
    assert.throws(() => normalize({ routes: ROUTES, composites: [{ path: SNAP, lists: { d: '/api/dishes/:id' } }] }), /not a declared list route/);
    assert.throws(() => normalize({ routes: [...ROUTES, SNAP], composites: [{ path: SNAP, lists: { d: '/api/x/:id' } }] }), /not a declared item route/);
    assert.throws(() => normalize({ routes: [...ROUTES, SNAP], composites: [{ path: SNAP, lists: {} }] }), /maps no field/);
    assert.equal(normalize({ routes: ROUTES }).composites.length, 0);
});

test('an item write amends the mapped field of the composite answer', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    svc.up = false;
    await data.patch(D1, { name: 'Broth' });
    assert.deepEqual((await snap(store)).dishes.map((d) => d.name), ['Broth']);
    assert.equal((await snap(store)).today, 'mon', 'the rest of the answer stays');
    await data.delete(D1);
    assert.deepEqual((await snap(store)).dishes, []);
});

test('a queued create joins the list and the composite field, once', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    svc.up = false;
    await data.post(LIST, { id: 2, name: 'Stew' });
    assert.deepEqual((await store.getRead(LIST)).data.map((d) => d.name), ['Soup', 'Stew']);
    assert.deepEqual((await snap(store)).dishes.map((d) => d.name), ['Soup', 'Stew']);
    assert.equal(data.queue()[0].listed, '/api/dishes/2');
    await data.post(LIST, { id: 2, name: 'Stew again' });
    assert.equal((await store.getRead(LIST)).data.length, 2, 'an item already listed is not added twice');
});

test('a create without a usable key, and a list with a query string, are left alone', async () => {
    const svc = seed();
    svc.items[`${LIST}?q=s`] = { items: [] };
    const { data, store } = await primed(svc);
    await data.get(`${LIST}?q=s`);
    svc.up = false;
    await data.post(LIST, { name: 'No key' });
    await data.post(LIST, { id: 3, name: 'Salad' });
    assert.deepEqual((await store.getRead(LIST)).data.map((d) => d.name), ['Soup', 'Salad']);
    assert.deepEqual((await store.getRead(`${LIST}?q=s`)).data.items, []);
    assert.equal(data.queue()[0].listed, undefined);
});

test('the sent create settles to the server answer; a refused one leaves the lists again', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    svc.up = false;
    await data.post(LIST, { id: 2, name: 'Stew' });
    svc.up = true;
    svc.items[LIST] = [{ id: 1, name: 'Soup', rev: 1 }, { id: 2, name: 'Stew', rev: 1 }];
    await data.retry();
    assert.equal(data.pending(), 0);
    assert.equal((await store.getRead(LIST)).data.length, 2);
    // refused
    svc.up = false;
    await data.post(LIST, { id: 5, name: 'Bad' });
    assert.equal((await snap(store)).dishes.length, 2);
    svc.up = true;
    svc.refusePost = 422;
    await data.retry();
    assert.equal(data.failed().length, 1);
    assert.ok(!(await snap(store)).dishes.some((d) => d.id === 5));
    assert.ok(!(await store.getRead(LIST)).data.some((d) => d.id === 5));
});

test('an offline PUT merges into the stored list entry; the item copy takes the body', async () => {
    const svc = seed();
    const { data, store } = await primed(svc);
    await data.get(D1);
    svc.up = false;
    await data.put(D1, { id: 1, name: 'Chowder' });
    const entry = (await store.getRead(LIST)).data[0];
    assert.deepEqual([entry.name, entry.kind], ['Chowder', 'a'], 'the field the PUT leaves out is kept');
    assert.equal((await snap(store)).dishes[0].kind, 'a');
    assert.equal((await store.getRead(D1)).data.kind, undefined, 'the item copy is what a PUT says');
});
