// fix-mc-data-e: the toast of a refused edit gives the reason that fits the status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindBand } from '../../static/chassis/data-band.js';

function page(messages) {
    const listeners = new Map();
    const win = { CustomEvent: class {}, dispatchEvent() {}, addEventListener: (n, f) => listeners.set(n, f), removeEventListener() {} };
    const doc = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
    const toasts = [];
    const kp = { connectionOf: () => null, toast: (text) => (toasts.push(text), { isConnected: false }) };
    bindBand({ win, doc, kp, data: { pending: () => 0, queue: () => [] }, messages });
    return { toasts, refuse: (status, body, state = 'failed') => listeners.get('chassis-data-conflict')({ detail: { entry: { state, conflict: { status, body } } } }) };
}

for (const status of [409, 412]) {
    test(`${status} says the item was changed elsewhere`, () => {
        const { toasts, refuse } = page();
        refuse(status, { error: 'stale', remedy: 'reload' });
        assert.match(toasts[0], /changed elsewhere/);
    });
}

for (const status of [400, 422]) {
    test(`${status} says the service refused it, in the service's own words`, () => {
        const { toasts, refuse } = page();
        refuse(status, { error: 'That name is already used', remedy: 'Pick another name' });
        assert.doesNotMatch(toasts[0], /changed elsewhere/);
        assert.match(toasts[0], /That name is already used\. Pick another name/);
        assert.match(toasts[0], /failed list/);
    });
}

test('another status gets its own plain sentence, and a held edit says later edits wait', () => {
    const { toasts, refuse } = page();
    refuse(404, null, 'held');
    assert.doesNotMatch(toasts[0], /changed elsewhere/);
    assert.match(toasts[0], /did not accept this edit/);
    assert.match(toasts[0], /Later edits wait/);
});

test("the app's refusedReason decides the reason line of the toast", () => {
    const { toasts, refuse } = page({ refusedReason: (status) => (status === 400 ? 'Dit naam bestaat al.' : '') });
    refuse(400, { error: 'x' });
    assert.match(toasts[0], /Dit naam bestaat al\./);
});
