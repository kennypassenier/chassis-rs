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
