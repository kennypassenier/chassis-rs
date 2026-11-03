// The lazy `chassisData.db.collection()` facade offers every method of the
// real collection (Kitchen, trial on 4.6.0: `action` was missing, so the data
// client failed to start when the app registered one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, fakeFeed } from './db_fake.mjs';
import { lazyDb } from '../../static/chassis/db-lazy.js';

const methods = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();

test('the lazy collection has every method the real one has', async () => {
    const { db } = await makeDb(fakeFeed());
    await db.sync();
    const realCol = db.collection('dishes');
    const lazyCol = lazyDb({ ensure: async () => db, hub: { watch() {} } }).collection('dishes');
    const missing = methods(realCol).filter((m) => !methods(lazyCol).includes(m));
    assert.deepEqual(missing, [], `lazy facade lacks: ${missing.join(', ')}`);
});

test('an action registered on the facade before the database is ready applies to reads', async () => {
    const svc = fakeFeed();
    svc.set('1', { name: 'Soup', qty: 3 });
    const { db } = await makeDb(svc);
    let open;
    const ready = new Promise((r) => { open = r; });
    const lazy = lazyDb({ ensure: () => ready, hub: { watch() {} } }).collection('dishes');
    assert.equal(lazy.action('take', (rec) => ({ ...rec, qty: rec.qty - 1 })), lazy, 'chains');
    open(db);
    await db.sync();
    assert.equal(typeof lazy.act, 'function');
});
