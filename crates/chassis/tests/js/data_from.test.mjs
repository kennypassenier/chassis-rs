// fix-habits-data-4: get(path, { from }) seeds the copy from an answer the app already has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const early = (body, extra = {}) => ({ status: 200, url: `http://app.test${D1}`, bodyUsed: false, headers: new Headers({ etag: '"7"' }), json: async () => body, ...extra });

test('a preloaded answer replaces the first request and is kept as the copy', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', rev: 1 } });
    const { data, store } = await makeClient(svc);
    await data.keepAll(true);
    svc.calls.length = 0;
    const r = await data.get(D1, { from: Promise.resolve(early({ id: 1, name: 'Early', rev: 7 })) });
    assert.deepEqual([r.data.name, r.rev, r.offline], ['Early', '7', false]);
    assert.equal(svc.calls.length, 0, 'no second download');
    assert.equal((await store.getRead(D1)).data.name, 'Early');
});

test('an answer for another URL, a refusal or a failed early fetch falls back to the service', async () => {
    const svc = fakeService({ [D1]: { id: 1, name: 'Soup', rev: 1 } });
    const { data } = await makeClient(svc);
    const warn = console.warn; console.warn = () => {};
    try {
        for (const from of [early({}, { url: 'http://app.test/api/dishes/2' }), early({}, { status: 500 }), Promise.reject(new Error('net'))]) {
            svc.calls.length = 0;
            assert.equal((await data.get(D1, { from })).data.name, 'Soup');
            assert.equal(svc.calls.length, 1);
        }
    } finally { console.warn = warn; }
});
