// The offline client on screen (feat-offline-1): the band, the toasts, the
// logout hook and the facade, with a fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindBand } from '../../static/chassis/data-band.js';
import { hookLogout } from '../../static/chassis/data-logout.js';
import { installData } from '../../static/chassis/data.js';
import { fakeService, fakeStorage } from './data_fake.mjs';

function fakePage() {
    const listeners = new Map();
    const target = () => ({
        addEventListener(n, f) { (listeners.get(n) ?? listeners.set(n, []).get(n)).push(f); },
        removeEventListener(n, f) { listeners.set(n, (listeners.get(n) ?? []).filter((x) => x !== f)); },
        fire(n, detail, extra = {}) { for (const f of listeners.get(n) ?? []) f({ detail, ...extra }); },
    });
    const attrs = {};
    const band = { setAttribute: (k, v) => (attrs[k] = v) };
    const sets = [];
    let shown = 'online';
    const handle = { state: () => shown, set: (s, o) => { shown = s; sets.push([s, o.pending]); } };
    const toasts = [];
    const kp = {
        connectionOf: () => handle,
        toast: (text, o) => { const el = { isConnected: true }; toasts.push({ text, o, el }); return el; },
    };
    const win = { ...target(), CustomEvent: class { constructor(n, i) { this.type = n; this.detail = i.detail; } },
        dispatchEvent(e) { win.fire(e.type, e.detail); }, location: { href: 'https://a.example/' } };
    const doc = { ...target(), querySelectorAll: () => [band] };
    return { win, doc, kp, attrs, sets, toasts };
}

test('the band gets the pending count, a syncing look while replaying, and its outcome', () => {
    const { win, doc, kp, attrs, sets } = fakePage();
    let pending = 2;
    const data = { pending: () => pending, queue: () => [], retry() { this.retried = true; } };
    bindBand({ win, doc, kp, data });
    win.fire('chassis-data-queue', { pending: 2 });
    assert.equal(attrs['data-kp-pending'], '2');
    win.fire('chassis-data-syncing', { syncing: true });
    assert.deepEqual(sets.at(-1), ['reconnecting', 2]);
    win.fire('chassis-data-synced', { stopped: 'unreachable' });
    assert.deepEqual(sets.at(-1), ['offline', 2]);
    pending = 0;
    win.fire('chassis-data-synced', { stopped: null });
    assert.deepEqual(sets.at(-1), ['online', 0]);
    doc.fire('kp-connection-retry', {});
    assert.equal(data.retried, true);
});

test('a held edit and a nearly full copy each show one kit toast', () => {
    const { win, doc, kp, toasts } = fakePage();
    bindBand({ win, doc, kp, data: { pending: () => 1, queue: () => [{ id: 1 }], retry() {} } });
    win.fire('chassis-data-conflict', { entry: {} });
    win.fire('chassis-data-conflict', { entry: {} });
    assert.equal(toasts.length, 1, 'shown once while it is on screen');
    assert.match(toasts[0].text, /refused/);
    let review;
    win.addEventListener('chassis-data-review', (e) => (review = e.detail));
    toasts[0].o.action.onClick();
    assert.deepEqual(review.queue, [{ id: 1 }]);
    toasts[0].el.isConnected = false;
    win.fire('chassis-data-storage', { level: 'warn', used: 85, max: 100 });
    assert.match(toasts[1].text, /85%/);
    toasts[1].el.isConnected = false;
    win.fire('chassis-data-storage', { level: 'full', used: 100, max: 100 });
    assert.match(toasts[2].text, /full/);
});

test('submitting the logout form purges first, then sends it; other forms are left alone', async () => {
    const { win, doc } = fakePage();
    win.setTimeout = setTimeout;
    const order = [];
    hookLogout({ win, doc, purge: async () => order.push('purge') });
    const other = { action: 'https://a.example/search', dataset: {}, submit: () => order.push('other') };
    let prevented = 0;
    doc.fire('submit', undefined, { target: other, preventDefault: () => prevented++ });
    assert.equal(prevented, 0);
    const form = { action: 'https://a.example/logout', dataset: {}, submit: () => order.push('submit') };
    doc.fire('submit', undefined, { target: form, preventDefault: () => prevented++ });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual([prevented, order], [1, ['purge', 'submit']]);
});

test('the facade waits for configure, configures once, and survives a missing IndexedDB', async () => {
    const { win, doc } = fakePage();
    win.setTimeout = setTimeout; win.clearTimeout = clearTimeout;
    const svc = fakeService({ '/api/dishes/1': { rev: 1 } });
    win.fetch = svc.fetch; win.localStorage = fakeStorage();
    const facade = installData(win, doc, { openStore: async () => { throw new Error('no idb'); } });
    assert.equal(installData(win, doc), facade, 'idempotent');
    await assert.rejects(facade.get('/api/dishes/1'), /call configure\(\) first/);
    const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a[0]);
    await facade.configure({ name: 'k', routes: ['/api/dishes/:id'] });
    console.warn = warn;
    assert.match(warned[0], /IndexedDB is not usable/);
    assert.throws(() => facade.configure({ name: 'k', routes: ['/a'] }), /already called/);
    assert.equal((await facade.get('/api/dishes/1')).data.rev, 1);
    await facade.keepAll(true);
    assert.equal((await facade.settings()).all, true);
});
