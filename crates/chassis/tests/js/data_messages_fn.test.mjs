// fix-habits-data-7: `messages` may be a function, read at show time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindBand } from '../../static/chassis/data-band.js';

test('toasts use the words of the moment when messages is a function', () => {
    const listeners = {};
    const toasts = [];
    const win = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener() {}, dispatchEvent() {}, CustomEvent: class {} };
    const doc = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] };
    const kp = { toast: (words) => { toasts.push(words); return { isConnected: false }; }, connectionOf: () => null };
    let lang = 'en';
    const messages = () => (lang === 'en' ? { full: 'Full' } : { full: 'Vol' });
    bindBand({ win, doc, kp, data: { pending: () => 0, queue: () => [], retry() {} }, messages });
    listeners['chassis-data-storage']({ detail: { level: 'full', used: 1, max: 1 } });
    lang = 'nl';
    listeners['chassis-data-storage']({ detail: { level: 'full', used: 1, max: 1 } });
    assert.deepEqual(toasts, ['Full', 'Vol']);
});
