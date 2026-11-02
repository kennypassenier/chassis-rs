// Logout on every page (fix-offline-logout-1): the origin-wide queue scan over
// a fake IndexedDB and the guard kit pages install without configure().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countStoredQueues, deleteStoredCopies } from '../../static/chassis/data-stored.js';
import { installLogoutGuard } from '../../static/chassis/logout-guard.js';
import { fakeIndexedDb } from './data_fake.mjs';

const E = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
const quiet = () => {};

test('the scan adds the queues of every chassis-data database, ignores others, never upgrades', async () => {
    const idb = fakeIndexedDb({ 'chassis-data:kitchen': E(2), 'chassis-data:other': E(1), 'unrelated': E(9) });
    assert.equal(await countStoredQueues(idb, quiet), 3);
    assert.deepEqual(idb.log.opened, ['chassis-data:kitchen', 'chassis-data:other']);
    assert.deepEqual(idb.log.versions, [undefined, undefined], 'opened at their current version');
    assert.equal(idb.log.closed, 2);
});

test('the scan reports what it cannot read, and a browser that cannot list', async () => {
    const warned = [];
    const idb = fakeIndexedDb({ 'chassis-data:a': E(1), 'chassis-data:broken': null, 'chassis-data:empty': Object.assign([], { noQueue: true }) });
    assert.equal(await countStoredQueues(idb, (m) => warned.push(m)), 1);
    assert.match(warned[0], /chassis-data:broken could not be read/);
    warned.length = 0;
    assert.equal(await countStoredQueues({ open() {} }, (m) => warned.push(m)), 0);
    assert.match(warned[0], /cannot list/);
});

test('deleting removes every offline database and nothing else', async () => {
    const idb = fakeIndexedDb({ 'chassis-data:a': E(1), 'chassis-data:b': E(1), keep: E(1) });
    await deleteStoredCopies(idb);
    assert.deepEqual(idb.log.deleted, ['chassis-data:a', 'chassis-data:b']);
});

function logoutPage(idb, answer) {
    const listeners = {};
    const order = [];
    const win = { location: { href: 'https://a.example/' }, indexedDB: idb, setTimeout: (f, ms) => setTimeout(f, ms) };
    const doc = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener() {} };
    const asked = [];
    const confirm = (trigger, o) => { asked.push(o); (answer ? o.onAccept : o.onCancel)(); };
    const form = { action: 'https://a.example/logout', dataset: {}, submit: () => order.push('submit') };
    const stops = [];
    const submit = async () => { listeners.submit({ target: form, preventDefault() {}, stopImmediatePropagation() { stops.push(1); } }); await new Promise((r) => setTimeout(r, 30)); };
    return { win, doc, confirm, asked, order, submit, stops };
}

test('a kit page with no configured client asks when any stored queue holds an edit; with none it logs out at once', async () => {
    const full = logoutPage(fakeIndexedDb({ 'chassis-data:kitchen': E(2) }), true);
    installLogoutGuard({ win: full.win, doc: full.doc, confirm: full.confirm, warn: quiet });
    await full.submit();
    assert.equal(full.asked.length, 1);
    assert.match(full.asked[0].description, /^2 changes have not been sent/);
    assert.deepEqual(full.order, ['submit']);
    const stay = logoutPage(fakeIndexedDb({ 'chassis-data:kitchen': E(1) }), false);
    installLogoutGuard({ win: stay.win, doc: stay.doc, confirm: stay.confirm, warn: quiet });
    await stay.submit();
    assert.deepEqual([stay.asked.length, stay.order], [1, []], 'Stay keeps the page');
    assert.equal(stay.stops.length, 1, "the page's own submit handlers (busy button) do not run");
    const none = logoutPage(fakeIndexedDb({ 'chassis-data:kitchen': [] }), true);
    installLogoutGuard({ win: none.win, doc: none.doc, confirm: none.confirm, warn: quiet });
    await none.submit();
    assert.deepEqual([none.asked.length, none.order], [0, ['submit']]);
    assert.equal(none.win.indexedDB.log.deleted.length, 1, 'the copy is deleted before the form is sent');
});

test('the guard installs once and counts a configured client\'s memory-only queue too', async () => {
    const page = logoutPage(fakeIndexedDb({}), true);
    const client = async () => ({ unsent: async () => 4, purge: async () => page.order.push('purge') });
    const first = installLogoutGuard({ win: page.win, doc: page.doc, confirm: page.confirm, client, warn: quiet, messages: () => ({ title: 'Sure?' }) });
    assert.equal(installLogoutGuard({ win: page.win, doc: page.doc, confirm: page.confirm }), first);
    await page.submit();
    assert.deepEqual([page.asked[0].phrase, page.order], ['Sure?', ['purge', 'submit']]);
});
