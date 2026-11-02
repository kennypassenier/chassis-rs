// fix-habits-data-5: the facade exists synchronously at install, with a ready promise and event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installData } from '../../static/chassis/data.js';

test('installData sets window.chassisData and chassisDataReady at once and announces it', async () => {
    const events = [];
    const win = { dispatchEvent: (e) => events.push(e.type), CustomEvent: class { constructor(type) { this.type = type; } }, addEventListener() {}, removeEventListener() {} };
    const doc = { addEventListener() {}, removeEventListener() {} };
    const facade = installData(win, doc);
    assert.equal(win.chassisData, facade, 'available in the same tick');
    assert.equal(await win.chassisDataReady, facade);
    assert.deepEqual(events, ['chassis-data-ready']);
});
