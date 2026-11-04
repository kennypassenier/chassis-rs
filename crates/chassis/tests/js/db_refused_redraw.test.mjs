// fix-mc-data-g: a queued write that is finally refused (kept in the failed list or dropped) makes the watchers redraw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFeed, makeDb } from './db_fake.mjs';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function refusedCreate(policy) {
    const svc = fakeFeed();
    const made = await makeDb(svc, { onConflict: policy });
    await made.db.sync();
    svc.up = false;
    await made.dishes.create({ id: 'a', name: 'Tea' });
    assert.deepEqual((await made.dishes.all()).map((d) => d.name), ['Tea'], 'the optimistic row shows');
    return { svc, ...made };
}

for (const [label, policy] of [['kept in the failed list', undefined], ['dropped', () => 'drop']]) {
    test(`a queued create that is refused (${label}) tells the watchers`, async () => {
        const { svc, dishes, data } = await refusedCreate(policy);
        const heard = [];
        dishes.watch((e) => heard.push(e.reason));
        await tick();
        heard.length = 0;
        svc.up = true;
        svc.refuse = 400;
        await data.retry();
        await tick();
        assert.ok(heard.length > 0, 'the list was told');
        assert.ok(heard.includes('refused'), `the reason names the refusal, got ${heard}`);
        assert.deepEqual((await dishes.all()).map((d) => d.name), [], 'the row is gone');
    });
}
