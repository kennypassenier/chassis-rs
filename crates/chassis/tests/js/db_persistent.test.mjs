// fix-mc-data-h: chassisData.db.persistent says whether the IndexedDB store is in use; the memory fallback warns once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFeed, makeDb, MANIFEST } from './db_fake.mjs';
import { bootDb } from '../../static/chassis/db-boot.js';
import { createHub } from '../../static/chassis/db-hub.js';
import { lazyDb } from '../../static/chassis/db-lazy.js';
import { memoryDb } from '../../static/chassis/db-store-mem.js';
import { parseManifest } from '../../static/chassis/db-config.js';

test('the database object reports its store: memory is not persistent', async () => {
    const { db } = await makeDb(fakeFeed());
    assert.equal(db.persistent, false, 'the in-memory store');
    assert.equal(memoryDb(parseManifest(MANIFEST)).persistent, false);
});

test('the lazy facade answers with a promise that settles once the database is open', async () => {
    let open;
    const ensure = () => new Promise((r) => (open = r));
    const lazy = lazyDb({ ensure, hub: createHub() });
    const answer = lazy.persistent;
    assert.ok(answer instanceof Promise);
    open({ persistent: true });
    assert.equal(await answer, true);
});

function boot(openDbStore) {
    const svc = fakeFeed();
    const win = { indexedDB: {}, IDBKeyRange: {}, addEventListener() {}, removeEventListener() {}, navigator: {} };
    const doc = { addEventListener() {}, removeEventListener() {}, hidden: false, visibilityState: 'visible' };
    const data = { pending: () => 0, settings: () => ({ all: true }), usage: () => ({ max: 1e9, used: 0 }), settle() {}, queue: () => [] };
    return bootDb({
        win, doc, app: 'kitchen', options: { syncUrl: '/api/sync', pullMs: 1e9, live: null, pageLimit: null }, data, hub: createHub(), events: { on: () => () => {} },
        emit() {}, storage: null, fetch: (...a) => svc.fetch(...a), setTimer: () => 1, clearTimer() {}, now: () => 1, uuid: () => 'u', deps: { openDbStore },
    });
}

test('without IndexedDB the db falls back to memory, says so once, and persistent is false', async () => {
    const warned = [];
    const was = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
        const local = boot(async () => { throw new Error('no idb'); });
        const db = await local.ensure();
        await local.ensure();
        assert.equal(db.persistent, false);
    } finally {
        console.warn = was;
    }
    assert.equal(warned.filter((w) => /IndexedDB is not usable/.test(w)).length, 1);
});

test('a store that opened is persistent', async () => {
    const local = boot(async (_idb, _app, manifest) => ({ ...memoryDb(manifest), persistent: true }));
    assert.equal((await local.ensure()).persistent, true);
});
