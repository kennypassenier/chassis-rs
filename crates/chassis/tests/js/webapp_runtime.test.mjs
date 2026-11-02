// The web-app runtime attaches once per page, however often it is loaded
// (node --test). The kp-themes calls are counted through the injectable deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A page that already carries the runtime: importing the module is a no-op,
// so no real DOM is needed to load it. There is deliberately no `document`:
// kp-themes' bundle boots itself on import when one exists (saved theme,
// auto-attach), and without one it only defines its exports.
globalThis.window = { chassisRuntime: { marker: true } };

const { installRuntime } = await import('../../static/chassis/webapp-runtime.js');
delete globalThis.window;

function deps() {
    const calls = { attach: 0, remember: [], refresh: 0 };
    return {
        calls,
        deps: {
            attachKitEffects: () => { calls.attach += 1; return { current: () => 'fx' }; },
            configureRemember: (o) => calls.remember.push(o),
            installRefresh: () => { calls.refresh += 1; },
        },
    };
}

test('a second install on the same page does nothing', () => {
    const win = {};
    const { calls, deps: d } = deps();
    const first = installRuntime(win, {}, d);
    const second = installRuntime(win, {}, d);
    assert.equal(calls.attach, 1);
    assert.equal(calls.refresh, 1);
    assert.equal(first, second);
    assert.equal(win.chassisRuntime.effects, 'fx');
});

test('remembered choices go through the database store only when it exists', () => {
    const none = deps();
    installRuntime({}, {}, none.deps);
    assert.deepEqual(none.calls.remember, []);
    const storage = {};
    const some = deps();
    installRuntime({ chassisPrefs: { storage } }, {}, some.deps);
    assert.deepEqual(some.calls.remember, [{ storage }]);
});

test('a page that already has the runtime is not attached again', () => {
    const { calls, deps: d } = deps();
    const existing = { effects: 'mine' };
    assert.equal(installRuntime({ chassisRuntime: existing }, {}, d), existing);
    assert.equal(calls.attach, 0);
});

test('the core wires remember and refresh with the functions it is given', async () => {
    const { installRuntimeWith } = await import('../../static/chassis/webapp-runtime-core.js');
    const seen = { remember: [], refreshKp: null, effects: 0 };
    const kp = {
        configureRemember: (o) => seen.remember.push(o),
        attachAgo() {}, attachRefresh() {}, refreshOf() {}, setAgo() {},
    };
    const d = {
        installRefresh: (_w, _d) => { seen.refreshKp = 'called'; },
        registerPwa() {}, followThemeColor() {}, installPush() {},
    };
    const storage = {};
    const win = { chassisPrefs: { storage } };
    const rt = installRuntimeWith(kp, win, {}, d);
    assert.deepEqual(seen.remember, [{ storage }]);
    assert.equal(seen.refreshKp, 'called');
    assert.equal(rt.effects, null, 'no attachEffects given: the effects are left to the app');
});

test('the core hands the caller\'s kp functions to the refresh control', async () => {
    const { installRuntimeWith } = await import('../../static/chassis/webapp-runtime-core.js');
    const kp = { configureRemember() {}, attachAgo() {}, attachRefresh() {}, refreshOf() {}, setAgo() {} };
    // A bare document: no slot, so installRefresh only builds the API from kp.
    const doc = { querySelector: () => null, documentElement: null, addEventListener() {} };
    const win = {};
    installRuntimeWith(kp, win, doc, { registerPwa() {}, followThemeColor() {}, installPush() {} });
    assert.equal(typeof win.chassisRefresh.onTick, 'function');
});

test('with attachEffects the core attaches the effects once', async () => {
    const { installRuntimeWith } = await import('../../static/chassis/webapp-runtime-core.js');
    let n = 0;
    const kp = { configureRemember() {}, attachEffects: () => { n += 1; return 'h'; } };
    const doc = { documentElement: {}, addEventListener() {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    const rt = installRuntimeWith(kp, {}, doc, {
        installRefresh() {}, registerPwa() {}, followThemeColor() {}, installPush() {},
    });
    delete globalThis.getComputedStyle;
    assert.equal(n, 1);
    assert.equal(rt.effects, 'h');
});
