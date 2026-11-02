// The offline client against a fake service (feat-offline-1): reads, the
// queue's order and replay, the 409 hold, purge, cap, and no tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeService, makeClient } from './data_fake.mjs';

const D1 = '/api/dishes/1';
const dish = (name, rev = 1) => ({ id: 1, name, rev });

test('a kept item is read offline from its copy; an unkept one is not', async () => {
    const svc = fakeService({ [D1]: dish('Soup'), '/api/dishes/2': dish('Stew') });
    const { data } = await makeClient(svc);
    data.keepItem(D1, true);
    assert.equal((await data.get(D1)).offline, false);
    await data.get('/api/dishes/2');
    svc.up = false;
    const off = await data.get(D1);
    assert.deepEqual([off.offline, off.data.name, off.rev, off.savedAt], [true, 'Soup', '1', 1000]);
    await assert.rejects(data.get('/api/dishes/2'), /no offline copy/);
});

test('"keep everything" copies every configured route and nothing else', async () => {
    const svc = fakeService({ [D1]: dish('Soup'), '/api/other': { x: 1 } });
    const { data, store } = await makeClient(svc);
    data.keepAll(true);
    await data.get(D1); await data.get('/api/other');
    assert.deepEqual((await store.allReads()).map((r) => r.path), [D1]);
});

test('a refusal on a read is an error with the kit sentence', async () => {
    const { data } = await makeClient(fakeService());
    await assert.rejects(data.get(D1), (e) => e.status === 404 && /none\. x/.test(e.message));
});

test('offline writes queue in order with their If-Match and replay in that order', async () => {
    const svc = fakeService({ [D1]: dish('Soup'), '/api/dishes/2': dish('Stew') });
    const { data, events } = await makeClient(svc);
    data.keepAll(true);
    await data.get(D1); await data.get('/api/dishes/2');
    svc.up = false;
    const a = await data.put(D1, { name: 'Soup 2' });
    await data.patch('/api/dishes/2', { name: 'Stew 2' });
    await data.put(D1, { name: 'Soup 3' });
    assert.equal(a.queued, true);
    assert.equal(data.pending(), 3);
    assert.deepEqual((await data.get(D1)).data.name, 'Soup 3', 'offline reads show the edit');
    svc.up = true; svc.calls.length = 0;
    const r = await data.retry();
    assert.deepEqual([r.sent, r.remaining, r.stopped], [3, 0, null]);
    const writes = svc.calls.map((c) => [c.method, c.path, c.headers['if-match']]);
    assert.deepEqual(writes, [['PUT', D1, '"1"'], ['PATCH', '/api/dishes/2', '"1"'], ['PUT', D1, '"2"']],
        'the follow-up edit is rebased onto the revision the first one made');
    assert.equal(svc.items[D1].name, 'Soup 3');
    assert.ok(events.some((e) => e.name === 'chassis-data-synced'));
    assert.equal(events.filter((e) => e.name === 'chassis-data-queue').at(-1).detail.pending, 0);
});

test('new writes join a non-empty queue even when the network is back', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    svc.up = false; await data.put(D1, { name: 'A' });
    svc.up = true; svc.calls.length = 0;
    const second = await data.put(D1, { name: 'B' });
    assert.equal(second.queued, true);
    await data.retry();
    assert.deepEqual(svc.calls.map((c) => JSON.parse(c.body).name), ['A', 'B']);
});

test('a write while online goes straight through and refreshes the copy', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    const r = await data.put(D1, { name: 'New' });
    assert.deepEqual([r.queued, r.rev], [false, '2']);
    svc.up = false;
    assert.equal((await data.get(D1)).rev, '2');
});

test('a live 409 is an error for the app, not queued', async () => {
    const svc = fakeService({ [D1]: dish('Soup', 5) });
    const { data } = await makeClient(svc);
    await assert.rejects(data.put(D1, { name: 'x' }, { rev: 1 }), (e) => e.status === 409 && e.body.rev === 5);
    assert.equal(data.pending(), 0);
});

const HOLD = { onConflict: () => 'hold' };

async function conflicted(config = {}) {
    const svc = fakeService({ [D1]: dish('Soup'), '/api/dishes/2': dish('Stew') });
    const c = await makeClient(svc, { config });
    c.data.keepAll(true); await c.data.get(D1);
    svc.up = false;
    await c.data.put(D1, { name: 'Mine' });
    await c.data.put('/api/dishes/2', { name: 'Later' });
    svc.items[D1] = dish('Theirs', 4); // someone else saved meanwhile
    svc.up = true;
    return c;
}

test('with the hold policy, 409 on replay: the queue stops, the edit is held and nothing behind it is sent', async () => {
    const { data, events, svc } = await conflicted(HOLD);
    svc.calls.length = 0;
    const r = await data.retry();
    assert.deepEqual([r.sent, r.remaining, r.stopped], [0, 2, 'held']);
    assert.equal(svc.calls.length, 1, 'the second edit was not tried');
    const [held, later] = data.queue();
    assert.deepEqual([held.state, held.conflict.status, later.state], ['held', 409, 'queued']);
    assert.equal(events.filter((e) => e.name === 'chassis-data-conflict').length, 1);
    svc.calls.length = 0;
    assert.equal((await data.retry()).stopped, 'held');
    assert.equal(svc.calls.length, 0, 'a hold stays until the person decides');
});

test('with the hold policy, dropping a held edit lets the rest through at once', async () => {
    const { data, svc } = await conflicted(HOLD);
    await data.retry();
    assert.equal(await data.drop(data.queue()[0].id), true);
    await data.retry(); // joins the replay drop() started
    assert.equal(data.pending(), 0);
    assert.equal(svc.items['/api/dishes/2'].name, 'Later');
    assert.equal(svc.items[D1].name, 'Theirs');
});

test('with the hold policy, re-saving a held edit sends it against the server revision', async () => {
    const { data, svc } = await conflicted(HOLD);
    await data.retry();
    assert.equal(await data.resave(data.queue()[0].id), true);
    await data.retry();
    assert.equal(data.pending(), 0);
    assert.equal(svc.items[D1].name, 'Mine');
    assert.equal(svc.items[D1].rev, 5);
    assert.equal(await data.resave(999), false);
});

test('another conflict policy is one function: drop and overwrite', async () => {
    for (const [answer, name] of [['drop', 'Theirs'], ['overwrite', 'Mine']]) {
        const svc = fakeService({ [D1]: dish('Soup') });
        const { data } = await makeClient(svc, { config: { onConflict: () => answer } });
        data.keepAll(true); await data.get(D1);
        svc.up = false; await data.put(D1, { name: 'Mine' });
        svc.items[D1] = dish('Theirs', 4); svc.up = true;
        const r = await data.retry();
        assert.deepEqual([r.remaining, r.stopped, svc.items[D1].name], [0, null, name], answer);
    }
});

test('an unreachable replay keeps the queue; a timer retries while edits wait', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, timers } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    svc.up = false;
    await data.put(D1, { name: 'A' });
    assert.equal((await data.retry()).stopped, 'unreachable');
    assert.equal(data.pending(), 1);
    assert.equal(timers.at(-1).ms, 30000);
    svc.up = true;
    await timers.at(-1).fn();
    await data.retry();
    assert.equal(data.pending(), 0);
});

test('purge empties the copy and the queue but not the settings', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    svc.up = false; await data.put(D1, { name: 'A' });
    await data.purge();
    assert.deepEqual([(await store.allReads()).length, (await store.allQueue()).length, data.pending()], [0, 0, 0]);
    assert.equal(data.settings().all, true);
    await assert.rejects(data.get(D1), /no offline copy/);
});

test('the cap warns near the limit and refuses new copies at it', async () => {
    const svc = fakeService({ '/api/dishes/1': { rev: 1, t: 'x'.repeat(100) }, '/api/dishes/2': { rev: 1, t: 'y'.repeat(100) }, '/api/dishes/3': { rev: 1, t: 'z'.repeat(100) } });
    const { data, events } = await makeClient(svc, { config: { maxBytes: 320, warnRatio: 0.5 } });
    data.keepAll(true);
    await data.get('/api/dishes/1');
    await data.get('/api/dishes/2');
    await data.get('/api/dishes/3'); // would pass 320
    const levels = events.filter((e) => e.name === 'chassis-data-storage').map((e) => e.detail.level);
    assert.deepEqual(levels, ['warn', 'full']);
    svc.up = false;
    assert.equal((await data.get('/api/dishes/2')).offline, true);
    await assert.rejects(data.get('/api/dishes/3'), /no offline copy/);
    await data.clearCopy();
    assert.equal(data.usage().used, 0);
});

test('no token or header is sent beyond the cookie, and none is stored', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const { data, store, storage } = await makeClient(svc);
    data.keepAll(true); await data.get(D1);
    await assert.rejects(async () => data.put(D1, {}, { headers: { authorization: 'Bearer SECRET' } }), /custom headers/);
    await assert.rejects(data.get('https://evil.example/x'), /not a path/);
    svc.up = false; await data.put(D1, { name: 'A' });
    for (const c of svc.calls) {
        assert.deepEqual(Object.keys(c.headers).filter((h) => !['accept', 'content-type', 'if-match'].includes(h)), []);
        assert.equal(c.credentials, 'same-origin');
    }
    const everything = JSON.stringify([await store.allReads(), await store.allQueue(), storage.dump()]);
    assert.ok(!/authorization|bearer|cookie|SECRET/i.test(everything));
});

test('settings persist per device and keepItem only accepts item routes', async () => {
    const svc = fakeService();
    const first = await makeClient(svc);
    first.data.keepItem(D1, true);
    assert.throws(() => first.data.keepItem('/api/dishes', true), /not an item route/);
    const again = await makeClient(svc, { storage: first.storage });
    assert.deepEqual(again.data.settings(), { all: false, items: [D1] });
    assert.equal(again.data.isKept(D1), true);
});

test('a queue left by an earlier page load is replayed', async () => {
    const svc = fakeService({ [D1]: dish('Soup') });
    const first = await makeClient(svc);
    first.data.keepAll(true); await first.data.get(D1);
    svc.up = false; await first.data.put(D1, { name: 'A' });
    const second = await makeClient(svc, { store: first.store, storage: first.storage });
    assert.equal(second.data.pending(), 1);
    svc.up = true;
    await second.data.retry();
    assert.equal(svc.items[D1].name, 'A');
});

test('by default a refused edit goes to the failed list and the rest of the queue continues', async () => {
    const { data, svc, events } = await conflicted();
    svc.calls.length = 0;
    const r = await data.retry();
    assert.deepEqual([r.sent, r.remaining, r.stopped], [1, 0, null], 'the second edit was sent');
    assert.deepEqual(svc.calls.map((c) => c.path), [D1, '/api/dishes/2'], 'order kept: refused first, then the next');
    assert.equal(svc.items['/api/dishes/2'].name, 'Later');
    assert.equal(svc.items[D1].name, 'Theirs');
    const failed = data.failed();
    assert.deepEqual([failed.length, failed[0].state, failed[0].conflict.status, data.pending(), data.unsent()], [1, 'failed', 409, 0, 1]);
    const conflict = events.filter((e) => e.name === 'chassis-data-conflict');
    assert.deepEqual([conflict.length, conflict[0].detail.entry.state], [1, 'failed']);
});

test('a failed edit can be dropped or re-saved, and a new write goes straight through', async () => {
    const { data, svc } = await conflicted();
    await data.retry();
    await data.put('/api/dishes/2', { name: 'Direct' });
    assert.equal(svc.items['/api/dishes/2'].name, 'Direct', 'a failed edit does not hold new writes');
    assert.equal(await data.resave(data.failed()[0].id), true);
    await data.retry();
    assert.deepEqual([data.unsent(), svc.items[D1].name], [0, 'Mine']);
    svc.up = false;
    await data.put(D1, { name: 'Again' });
    svc.items[D1] = dish('Other', 9); svc.up = true;
    await data.retry();
    assert.equal(await data.drop(data.failed()[0].id), true);
    assert.equal(data.unsent(), 0);
});

test('the failed list survives a reload', async () => {
    const { data, store, storage, svc } = await conflicted();
    await data.retry();
    const again = await makeClient(svc, { store, storage });
    assert.deepEqual(again.data.failed().map((e) => [e.state, e.path]), [['failed', D1]]);
    assert.deepEqual([again.data.pending(), again.data.unsent()], [0, 1]);
    assert.equal((await again.data.retry()).sent, 0, 'a failed edit is not sent again by itself');
});
