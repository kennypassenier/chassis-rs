// fix-mc-data-d: the browser coming back `online` replays the queue at once, through the installed facade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installData } from '../../static/chassis/data.js';
import { memoryStore } from '../../static/chassis/data-store.js';
import { fakeService, fakeStorage } from './data_fake.mjs';

function pageWith(svc, store = memoryStore()) {
    const listeners = new Map();
    const win = {
        dispatchEvent() {}, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
        removeEventListener() {}, localStorage: fakeStorage(),
        fetch: (...a) => svc.fetch(...a), setTimeout: () => 1, clearTimeout() {},
    };
    const doc = { addEventListener() {}, removeEventListener() {} };
    const facade = installData(win, doc, { openStore: async () => store });
    return { facade, fire: (name) => (listeners.get(name) ?? []).forEach((fn) => fn()) };
}

test('online replays queued writes without waiting for the retry timer', async () => {
    const svc = fakeService({ '/api/dishes/1': { id: 1, name: 'Soup', rev: 1 } });
    const { facade, fire } = pageWith(svc);
    await facade.configure({ name: 'kitchen', routes: ['/api/dishes', '/api/dishes/:id'] });
    svc.up = false;
    await facade.patch('/api/dishes/1', { name: 'Stew' }, { rev: 1 });
    assert.equal(await facade.pending(), 1);
    svc.up = true;
    fire('online');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(await facade.pending(), 0, 'sent on `online`');
    assert.equal(svc.items['/api/dishes/1'].name, 'Stew');
});

test('a replay that fails on `online` is reported, not an unhandled rejection', async () => {
    const svc = fakeService();
    const store = memoryStore();
    const { facade, fire } = pageWith(svc, store);
    await facade.configure({ name: 'kitchen', routes: ['/api/dishes', '/api/dishes/:id'] });
    svc.up = false;
    await facade.post('/api/dishes', { name: 'x' });
    await new Promise((r) => setTimeout(r, 10)); // the replay the write itself started has ended
    svc.up = true;
    store.deleteQueue = async () => { throw new Error('disk gone'); };
    const warned = [];
    const was = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    const unhandled = [];
    const onUnhandled = (e) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
        fire('online');
        await new Promise((r) => setTimeout(r, 20));
    } finally {
        console.warn = was;
        process.off('unhandledRejection', onUnhandled);
    }
    assert.equal(unhandled.length, 0, 'no unhandled rejection');
    assert.ok(warned.some((w) => /replay/i.test(w)), `a warning names the replay, got ${warned}`);
});
