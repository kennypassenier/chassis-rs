// The page side of the service worker (feat-webapp-4): when a page registers
// and when it reloads. A reload per release at most, so no loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReload, linksManifest, registerPwa, reloadMode } from '../../static/chassis/pwa-register.js';

const msg = (version) => ({ type: 'chassis-sw-activated', version });

test('only an update of a controlled page reloads, once per release', () => {
    assert.equal(shouldReload({ hadController: false, message: msg('v1'), lastReloaded: null }), false, 'first install');
    assert.equal(shouldReload({ hadController: true, message: msg('v2'), lastReloaded: null }), true);
    assert.equal(shouldReload({ hadController: true, message: msg('v2'), lastReloaded: 'v2' }), false, 'already reloaded');
    assert.equal(shouldReload({ hadController: true, message: msg('v3'), lastReloaded: 'v2' }), true);
    assert.equal(shouldReload({ hadController: true, message: { type: 'other' }, lastReloaded: null }), false);
    assert.equal(shouldReload({ hadController: true, message: undefined, lastReloaded: null }), false);
});

const docWith = (found) => ({ querySelector: () => (found ? {} : null) });

test('a page registers only when it links the kit manifest', () => {
    assert.equal(linksManifest(docWith(true)), true);
    const calls = [];
    const nav = { serviceWorker: { controller: null, addEventListener() {}, register: (...a) => (calls.push(a), Promise.resolve()) } };
    assert.equal(registerPwa({}, docWith(false), nav), null);
    assert.deepEqual(calls, []);
    registerPwa({ sessionStorage: {} }, docWith(true), nav);
    assert.deepEqual(calls, [['/sw.js', { scope: '/' }]]);
    assert.equal(registerPwa({}, docWith(true), {}), null, 'a browser without service workers');
});

test('the message reloads once and a repeated one does not', () => {
    let handler;
    const nav = { serviceWorker: { controller: {}, addEventListener: (_, f) => (handler = f), register: () => Promise.resolve() } };
    const data = new Map();
    let reloads = 0;
    const win = {
        sessionStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
        location: { reload: () => (reloads += 1) },
    };
    registerPwa(win, docWith(true), nav);
    handler({ data: msg('v2') });
    handler({ data: msg('v2') });
    assert.equal(reloads, 1);
    handler({ data: msg('v3') });
    assert.equal(reloads, 2);
});

test('the reload mode is read from the manifest link, auto by default', () => {
    const link = (attr) => ({ getAttribute: (n) => (n === 'data-chassis-reload' ? attr : null) });
    assert.equal(reloadMode({ querySelector: () => link('ask') }), 'ask');
    assert.equal(reloadMode({ querySelector: () => link(null) }), 'auto');
    assert.equal(reloadMode({ querySelector: () => link('whatever') }), 'auto');
    assert.equal(reloadMode({ querySelector: () => ({}) }), 'auto');
    assert.equal(reloadMode({ querySelector: () => null }), 'auto');
});

test('with reload=ask the page is told, not reloaded, and apply() reloads once', () => {
    let handler;
    const nav = { serviceWorker: { controller: {}, addEventListener: (_, f) => (handler = f), register: () => Promise.resolve() } };
    const data = new Map();
    const events = [];
    let reloads = 0;
    const win = {
        sessionStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
        location: { reload: () => (reloads += 1) },
        dispatchEvent: (e) => events.push(e),
    };
    const doc = { querySelector: () => ({ getAttribute: () => 'ask' }) };
    registerPwa(win, doc, nav);
    handler({ data: msg('v2') });
    handler({ data: msg('v2') });
    assert.equal(reloads, 0, 'asking never reloads');
    assert.equal(events.length, 1, 'one event per release');
    assert.equal(events[0].type, 'chassis-pwa-update');
    assert.equal(events[0].detail.version, 'v2');
    events[0].detail.apply();
    events[0].detail.apply();
    assert.equal(reloads, 1);
    assert.equal(data.get('chassis-sw-reloaded'), 'v2', 'recorded under the automatic reload key');
    handler({ data: msg('v2') });
    assert.equal(events.length, 1, 'an applied release is not offered again');
    handler({ data: msg('v3') });
    assert.equal(events.length, 2);
});

test('a first install in ask mode fires nothing', () => {
    let handler;
    const nav = { serviceWorker: { controller: null, addEventListener: (_, f) => (handler = f), register: () => Promise.resolve() } };
    const events = [];
    const win = { sessionStorage: { getItem: () => null, setItem() {} }, dispatchEvent: (e) => events.push(e) };
    registerPwa(win, { querySelector: () => ({ getAttribute: () => 'ask' }) }, nav);
    handler({ data: msg('v1') });
    assert.deepEqual(events, []);
});
