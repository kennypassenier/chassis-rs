// The server is the master (fix-server-wins-1): a refused queued edit never
// lingers in the offline copy, `overwrite` is gone, optimistic copies roll
// back on refusal and give way to the server's answer on success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const FREEZER = '/api/dishes/9';
const dish = (name, rev = 1, extra = {}) => ({ id: 1, name, rev, ...extra });

/** A service whose PUT/POST answers 409 with the server's `current` item. */
function withCurrent(svc, current) {
    const real = svc.fetch;
    svc.fetch = async (path, init = {}) => {
        if (svc.up && current && (init.method === 'PUT' || init.method === 'POST')) {
            svc.calls.push({ path, method: init.method, headers: {} });
            return { status: 409, ok: false, headers: new Headers(), json: async () => ({ error: 'stale', remedy: 'reload', code: 'stale', rev: current.rev, current }) };
        }
        return real(path, init);
    };
}

async function offlineEdit(svc, config) {
    const c = await makeClient(svc, { config });
    c.data.keepAll(true); await c.data.get(D1);
    svc.up = false;
    await c.data.put(D1, { name: 'Mine', local: 'only-here' });
    return c;
}

test('a refused replay replaces the copy with `current` from the 409 body, no refetch', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    assert.equal((await store.getRead(D1)).data.name, 'Mine', 'the optimistic copy shows the edit');
    const theirs = dish('Theirs', 4, { extra: 1 });
    svc.items[D1] = theirs; withCurrent(svc, theirs); svc.up = true; svc.calls.length = 0;
    await data.retry();
    const copy = await store.getRead(D1);
    assert.deepEqual([copy.data, copy.rev], [theirs, '4']);
    assert.ok(!('local' in copy.data));
    assert.deepEqual(svc.calls.map((c) => c.method), ['PUT'], 'current was enough');
    assert.equal(data.failed()[0].body.name, 'Mine', 'the refused edit stays on record');
});

test('without `current` the path is refetched and stored', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    svc.items[D1] = dish('Theirs', 4); svc.up = true; svc.calls.length = 0;
    await data.retry();
    assert.deepEqual(svc.calls.map((c) => c.method), ['PUT', 'GET']);
    const copy = await store.getRead(D1);
    assert.deepEqual([copy.data.name, copy.rev, 'local' in copy.data], ['Theirs', '4', false]);
});

test('a refused edit on an item the server deleted removes the copy', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    svc.items[D1] = dish('Theirs', 4); svc.up = true;
    const real = svc.fetch;
    svc.fetch = async (p, i) => (i.method === 'GET' ? { status: 404, ok: false, headers: new Headers(), json: async () => ({ error: 'none' }) } : real(p, i));
    await data.retry();
    assert.ok(!(await store.getRead(D1)));
});

test('onConflict answering overwrite is treated as skip, with a warning', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data } = await offlineEdit(svc, { onConflict: () => 'overwrite' });
    svc.items[D1] = dish('Theirs', 4); svc.up = true;
    const warnings = []; const warn = console.warn; console.warn = (...a) => warnings.push(a.join(' '));
    let r;
    try { r = await data.retry(); } finally { console.warn = warn; }
    assert.equal(svc.items[D1].name, 'Theirs', 'the client never forces its version');
    assert.deepEqual([r.remaining, r.stopped, data.failed().length], [0, null, 1]);
    assert.ok(warnings.some((w) => /overwrite/.test(w)));
});

test('a refused POST rolls its optimistic amendment back to the server version', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', qty: 3, rev: 1 } });
    const { data, store } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    svc.up = false;
    await data.post(D1, {}, { optimistic: (c) => ({ ...c, qty: c.qty - 1 }) });
    assert.equal((await store.getRead(D1)).data.qty, 2);
    svc.up = true; svc.refusePost = 409;
    await data.retry();
    assert.equal((await store.getRead(D1)).data.qty, 3);
});

test('a successful replay replaces the optimistic copy with the server answer', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    svc.up = true;
    await data.retry();
    const copy = await store.getRead(D1);
    assert.deepEqual(copy.data, svc.items[D1]);
    assert.equal(copy.rev, '2');
});

test('a successful write without a usable answer body refetches instead of keeping the optimistic copy', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    svc.up = true;
    const real = svc.fetch;
    svc.fetch = async (p, i) => (i.method === 'PUT' ? (Object.assign(svc.items[D1], { name: 'Normalised', rev: 2 }), { status: 204, ok: true, headers: new Headers(), json: async () => { throw new Error('empty'); } }) : real(p, i));
    await data.retry();
    assert.equal((await store.getRead(D1)).data.name, 'Normalised');
});

test('a fresh server answer replaces the stored copy whole, local fields included', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await offlineEdit(svc);
    svc.up = true;
    const real = svc.fetch;
    svc.fetch = async (p, i) => (i.method === 'PUT' ? { status: 0 } && Promise.reject(new TypeError('down')) : real(p, i));
    const got = await data.get(D1);
    assert.equal(got.offline, false);
    const copy = await store.getRead(D1);
    assert.deepEqual(copy.data, svc.items[D1]);
    assert.ok(!('local' in copy.data));
});

// fix-server-wins-2: server deletions remove the local items.
const LIST = '/api/dishes';
const D2 = '/api/dishes/2';
const two = () => fakeService({ [LIST]: [dish('Soup'), { id: 2, name: 'Stew', rev: 1 }], [D1]: dish('Soup'), [D2]: { id: 2, name: 'Stew', rev: 1 } });

async function keptAll(svc) {
    const c = await makeClient(svc);
    c.data.keepAll(true);
    for (const p of [LIST, D1, D2]) await c.data.get(p);
    return c;
}

test('an item gone from a fresh list answer is dropped locally, also from every stored list', async () => {
    const svc = two();
    const { data, store } = await keptAll(svc);
    svc.items[LIST] = [dish('Soup')];
    delete svc.items[D2];
    await data.get(LIST);
    assert.ok(!(await store.getRead(D2)), 'the item copy is gone');
    assert.ok(await store.getRead(D1), 'the item still listed stays');
    assert.deepEqual((await store.getRead(LIST)).data.map((e) => e.id), [1]);
});

test('a list answer with a query string is a filter, not the whole collection: nothing is dropped', async () => {
    const svc = two();
    const { data, store } = await keptAll(svc);
    svc.items[`${LIST}?q=soup`] = [dish('Soup')];
    await data.get(`${LIST}?q=soup`);
    assert.ok(await store.getRead(D2));
});

test('a 404 on an item GET deletes its copy and its entry in stored lists', async () => {
    const svc = two();
    const { data, store } = await keptAll(svc);
    delete svc.items[D2];
    await assert.rejects(data.get(D2), (e) => e.status === 404);
    assert.ok(!(await store.getRead(D2)));
    assert.deepEqual((await store.getRead(LIST)).data.map((e) => e.id), [1]);
});

test('a pending write survives a server deletion; on replay the 404 sends it to the failed list', async () => {
    const svc = two();
    const { data, store } = await keptAll(svc);
    svc.up = false;
    await data.put(D2, { id: 2, name: 'Stew 2' });
    svc.up = true;
    svc.items[LIST] = [dish('Soup')];
    delete svc.items[D2];
    assert.equal(data.pending(), 1);
    await data.get(LIST);
    assert.ok(await store.getRead(D2), 'the copy with the pending edit is kept until replay');
    assert.equal(data.queue().length, 1);
    const real = svc.fetch; // the real service would answer a PUT on a deleted item with 404
    svc.fetch = async (p, i) => (i.method === 'PUT' && !svc.items[p] ? { status: 404, ok: false, headers: new Headers(), json: async () => ({ error: 'gone' }) } : real(p, i));
    await data.retry();
    assert.deepEqual(data.failed().map((e) => [e.path, e.conflict.status]), [[D2, 404]]);
    assert.ok(!(await store.getRead(D2)), 'after the refusal the server (gone) wins');
});

test('Save again sends the edit on top of the newest revision the client holds', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data } = await offlineEdit(svc);
    svc.items[D1] = dish('Theirs', 4); svc.up = true;
    await data.retry();
    assert.equal(data.failed().length, 1);
    svc.calls.length = 0;
    await data.resave(data.failed()[0].id);
    await data.retry();
    const put = svc.calls.find((c) => c.method === 'PUT');
    assert.equal(put.headers['if-match'], '"4"');
});
