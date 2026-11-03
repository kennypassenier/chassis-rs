// post() (feat-offline-post-1): an action queued offline, replayed in order with
// the other writes, carrying one Idempotency-Key for its whole life.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const FREEZER = '/api/freezer/take';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('online, post goes straight through with a key and no If-Match', async () => {
    const svc = fakeService();
    const { data } = await makeClient(svc);
    const r = await data.post(FREEZER, { item: 'peas' });
    assert.deepEqual([r.queued, r.data], [false, { taken: 1 }]);
    const call = svc.calls.at(-1);
    assert.equal(call.method, 'POST');
    assert.ok(UUID.test(call.headers['idempotency-key']));
    assert.equal(call.headers['if-match'], undefined);
    assert.equal(call.credentials, 'same-origin');
});

test('offline posts queue in order with PUT and replay in that order', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', rev: 1 } });
    const { data } = await makeClient(svc);
    await data.keepAll(true); await data.get(D1);
    svc.up = false; svc.calls.length = 0;
    assert.equal((await data.post(FREEZER, { n: 1 })).queued, true);
    await data.put(D1, { id: 1, name: 'Stew' });
    await data.post(FREEZER, { n: 2 });
    assert.deepEqual(data.queue().map((e) => e.method), ['POST', 'PUT', 'POST']);
    assert.equal(data.queue()[0].ifMatch, null);
    svc.up = true; svc.calls.length = 0;
    await data.retry();
    assert.deepEqual(svc.calls.map((c) => c.method), ['POST', 'PUT', 'POST']);
    assert.equal(data.pending(), 0);
    assert.equal(svc.taken, 2);
});

test('the same key is sent on every replay, so a forced second replay applies once', async () => {
    const svc = fakeService();
    const { data, store } = await makeClient(svc);
    svc.up = false;
    await data.post(FREEZER, { n: 1 });
    await data.retry(); // still down: stays queued
    const key = data.queue()[0].key;
    assert.ok(UUID.test(key));
    svc.up = true;
    await data.retry();
    assert.equal(svc.taken, 1);
    // the answer was lost after the server applied it: the edit is queued again with its old key
    await store.putQueue({ method: 'POST', path: FREEZER, body: { n: 1 }, ifMatch: null, key, at: 1, state: 'queued' });
    const again = await makeClient(svc, { store });
    await again.data.retry();
    assert.equal(svc.taken, 1, 'the server answered the repeated key with the first result');
    const keys = svc.calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    assert.ok(keys.length >= 3 && keys.every((k) => k === key));
});

test('a refused POST replay goes to the failed list like any edit, the rest continues', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', rev: 1 } });
    const { data } = await makeClient(svc);
    await data.keepAll(true); await data.get(D1);
    svc.up = false;
    await data.post(FREEZER, { n: 1 });
    await data.put(D1, { id: 1, name: 'Stew' });
    svc.up = true; svc.refusePost = 409;
    await data.retry();
    assert.deepEqual(data.failed().map((e) => e.method), ['POST']);
    assert.equal(data.pending(), 0);
    assert.equal(svc.items[D1].name, 'Stew');
    svc.refusePost = null;
    const id = data.failed()[0].id;
    assert.equal(await data.resave(id), true);
    await data.retry();
    assert.equal(data.unsent(), 0);
    assert.equal(svc.taken, 1);
});

test('a POST does not amend the copy unless optimistic(copy) is given', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', qty: 3, rev: 1 } });
    const { data, store } = await makeClient(svc);
    await data.keepAll(true); await data.get(D1);
    svc.up = false;
    await data.post(D1, {});
    assert.equal((await store.getRead(D1)).data.qty, 3);
    await data.post(D1, {}, { optimistic: (c) => ({ ...c, qty: c.qty - 1 }) });
    assert.equal((await store.getRead(D1)).data.qty, 2);
    // The preview function never goes into the stored queue (IndexedDB cannot hold it);
    // since fix-habits-data-3 only a flag says the copies were amended.
    assert.ok(data.queue().every((e) => typeof e.optimistic !== 'function'));
});

test('post accepts rev, rejects custom headers', async () => {
    const svc = fakeService();
    const { data } = await makeClient(svc);
    await data.post(FREEZER, {}, { rev: 4 });
    assert.equal(svc.calls.at(-1).headers['if-match'], '"4"');
    await assert.rejects(data.post(FREEZER, {}, { headers: { x: 1 } }), /custom headers/);
});

test('rev "*" is sent as a bare If-Match, a real revision stays quoted (fix-habits-data-8)', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', rev: 3 } });
    const { data } = await makeClient(svc);
    await data.put(D1, { id: 1, name: 'A' }, { rev: '*' }).catch(() => {}); // the fake service has no wildcard: only the header is asserted
    assert.equal(svc.calls.at(-1).headers['if-match'], '*');
    await data.put(D1, { id: 1, name: 'B' }, { rev: '4' }).catch(() => {}); // rev 4 is stale here (the item is at 3): only the header is asserted
    assert.equal(svc.calls.at(-1).headers['if-match'], '"4"');
});
