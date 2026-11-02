// fix-habits-data-6: copies per query string are bounded per route, LRU by last use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const W = '/data/worklog';
const q = (n) => `${W}?from=${n}`;
const routes = [{ path: W, keep: 3 }, '/data/other'];

function service() {
    const items = { [W]: [], '/data/other': [] };
    for (let n = 1; n <= 6; n++) items[q(n)] = [{ n }];
    items['/data/other?x=1'] = [];
    items['/data/other?x=2'] = [];
    return fakeService(items);
}
const stored = async (store) => (await store.allReads()).map((r) => r.path).sort();

test('only the newest `keep` query copies of a route stay; the plain path is not counted', async () => {
    const { data, store } = await makeClient(service(), { config: { routes, queryCopies: 1 } });
    await data.keepAll(true);
    await data.get(W);
    for (let n = 1; n <= 5; n++) await data.get(q(n));
    assert.deepEqual(await stored(store), [W, q(3), q(4), q(5)].sort());
});

test('an offline read counts as use, so the copy read last survives', async () => {
    const svc = service();
    const { data, store } = await makeClient(svc, { config: { routes } });
    await data.keepAll(true);
    for (let n = 1; n <= 3; n++) await data.get(q(n));
    svc.up = false;
    await data.get(q(1)); // 1 is now the newest use
    svc.up = true;
    await data.get(q(4));
    assert.deepEqual(await stored(store), [q(1), q(3), q(4)].sort());
});

test('a route without keep uses the configured default; routes do not evict each other', async () => {
    const svc = service();
    const { data, store } = await makeClient(svc, { config: { routes, queryCopies: 1 } });
    await data.keepAll(true);
    await data.get('/data/other?x=1'); await data.get('/data/other?x=2'); await data.get(q(1));
    assert.deepEqual(await stored(store), ['/data/other?x=2', q(1)].sort());
});

test('keep and queryCopies must be positive numbers', async () => {
    const { normalize } = await import('../../static/chassis/data-config.js');
    assert.throws(() => normalize({ routes: [{ path: W, keep: 0 }] }), /keep/);
    assert.throws(() => normalize({ routes: [W], queryCopies: -1 }), /queryCopies/);
});
