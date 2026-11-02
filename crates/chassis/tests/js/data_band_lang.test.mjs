// The connection band follows a language change (fix-offline-band-lang-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindBand, redrawBand } from '../../static/chassis/data-band.js';

function band(initial) {
    const listeners = {};
    const sets = [];
    let shown = initial;
    const handle = { state: () => shown, set: (s, o) => { sets.push([s, o]); } };
    const el = { setAttribute() {} };
    const doc = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener() {}, querySelectorAll: () => [el] };
    return { doc, kp: { connectionOf: () => handle }, sets, listeners, win: { addEventListener() {}, removeEventListener() {} } };
}

test('a language change redraws a visible band with its pending count, and leaves online / back alone', () => {
    for (const [state, redraws] of [['offline', 1], ['reconnecting', 1], ['refused', 1], ['online', 0], ['back', 0]]) {
        const { doc, kp, sets, listeners, win } = band(state);
        bindBand({ win, doc, kp, data: { pending: () => 3, queue: () => [], retry() {} } });
        listeners['kp-strings-change']({});
        assert.equal(sets.length, redraws, state);
        if (redraws) assert.deepEqual(sets[0], [state, { pending: 3 }], 'no reason passed: the band keeps its own');
    }
    const { doc, kp, sets } = band('offline');
    redrawBand(doc, kp, 0);
    assert.equal(sets.length, 1);
});
