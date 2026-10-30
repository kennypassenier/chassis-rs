// The page side of the service worker (feat-webapp-4): when a page registers
// and when it reloads. A reload per release at most, so no loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReload, linksManifest, registerPwa } from '../../static/chassis/pwa-register.js';

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
