// The kit's refresh bus, control wiring and section opt-in (node --test) [ux-chassis-10].
// The kp-themes control is replaced by a fake that fires the same events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshBus } from '../../static/chassis/refresh-bus.js';
import { mountRefresh, prepareSlot, REFRESH_DEFAULTS } from '../../static/chassis/refresh-control.js';
import { rereadSections } from '../../static/chassis/refresh-sections.js';

// A slot with just enough of an element: attributes, class list, events.
function fakeSlot(attrs = {}) {
  const slot = new EventTarget();
  const map = new Map(Object.entries(attrs));
  slot.hasAttribute = (n) => map.has(n);
  slot.getAttribute = (n) => (map.has(n) ? map.get(n) : null);
  slot.setAttribute = (n, v) => map.set(n, String(v));
  slot.classList = { add: () => {} };
  slot.querySelector = () => ago;
  return slot;
}
const ago = { datetime: null };

// The fake kp control: remembers its interval and fires kp-refresh like the real one.
function fakeKp(slot, { start = 30 } = {}) {
  const state = { interval: start, agoSet: [], done: [] };
  const handle = {
    interval: () => state.interval,
    setInterval(seconds, by) {
      state.interval = seconds;
      slot.dispatchEvent(new CustomEvent('kp-refresh-interval', { detail: { seconds, by } }));
    },
    now: (reason) => slot.dispatchEvent(new CustomEvent('kp-refresh', { detail: { reason, interval: state.interval, done: (ok) => state.done.push(ok) } })),
  };
  return { state, kp: { attachRefresh: () => () => {}, attachAgo: () => {}, refreshOf: () => handle, setAgo: (_el, ms) => state.agoSet.push(ms) } };
}
const settled = () => new Promise((r) => setTimeout(r, 0));

test('the tick event fires with the chosen interval and handlers can fail it', async () => {
  const target = new EventTarget();
  const { api, internals } = createRefreshBus({ target });
  const seen = [];
  target.addEventListener('chassis:refresh', (e) => seen.push(e.detail.interval));
  const got = [];
  const off = api.onTick(({ interval, reason }) => got.push([interval, reason]));
  assert.deepEqual(await internals.tick({ reason: 'now', interval: 60 }), { ok: true, freshAt: null });
  assert.deepEqual(got, [[60, 'now']]);
  assert.deepEqual(seen, [60]);
  off();
  api.onTick(() => false);
  assert.equal((await internals.tick({ interval: 60 })).ok, false);
});

test('a throwing handler is reported and fails the tick; the others still run', async () => {
  const errors = [];
  const { api, internals } = createRefreshBus({ report: (e) => errors.push(e.message) });
  let ran = false;
  api.onTick(() => { throw new Error('boom'); });
  api.onTick(async () => { ran = true; });
  assert.equal((await internals.tick()).ok, false);
  assert.deepEqual(errors, ['boom']);
  assert.ok(ran);
});

test('markFresh during a tick reaches the control after the answer', async () => {
  const slot = fakeSlot();
  const { state, kp } = fakeKp(slot);
  const { api, internals } = createRefreshBus({ target: slot });
  mountRefresh(slot, internals, kp);
  api.onTick(() => api.markFresh(new Date(1_000)));
  api.now();
  await settled();
  assert.deepEqual(state.done, [true]);
  assert.deepEqual(state.agoSet, [1_000, 1_000]); // once live, once after the answer
});

test('the interval the control reports reaches onInterval and interval()', () => {
  const slot = fakeSlot();
  const { kp } = fakeKp(slot, { start: 30 });
  const { api, internals } = createRefreshBus();
  mountRefresh(slot, internals, kp);
  assert.equal(api.interval(), 30);
  const heard = [];
  api.onInterval((s) => heard.push(s));
  api.setInterval(60);
  assert.deepEqual(heard, [60]);
  assert.equal(api.interval(), 60);
});

test('every page gets the same options and one remembered key; a page default only seeds', () => {
  const plain = fakeSlot();
  prepareSlot(plain);
  assert.equal(plain.getAttribute('data-kp-remember'), REFRESH_DEFAULTS.remember);
  assert.equal(plain.getAttribute('data-kp-refresh'), '30');
  assert.equal(plain.getAttribute('data-kp-look'), 'menu');
  const storage = fakeSlot({ 'data-chassis-refresh-default': '300' });
  prepareSlot(storage);
  assert.equal(storage.getAttribute('data-kp-refresh'), '300');
  assert.equal(storage.getAttribute('data-kp-remember'), plain.getAttribute('data-kp-remember'));
});

test('without a control the page is told so and now() reads nothing', () => {
  const { api } = createRefreshBus();
  assert.equal(api.now(), false);
  assert.equal(api.interval(), null);
});

test('an opted-in section is re-read on the tick and kept when unchanged', async () => {
  const doc = { createElement: () => ({ set innerHTML(v) { this._v = v; }, get innerHTML() { return this._v; } }) };
  const section = { ownerDocument: doc, innerHTML: '<b>1</b>', getAttribute: () => '/f' };
  const root = { querySelectorAll: () => [section] };
  let answer = '<b>1</b>';
  let writes = 0;
  Object.defineProperty(section, 'innerHTML', { get: () => section._h ?? '<b>1</b>', set: (v) => { writes += 1; section._h = v; } });
  assert.equal(await rereadSections(root, async () => answer), true);
  assert.equal(writes, 0);
  answer = '<b>2</b>';
  assert.equal(await rereadSections(root, async () => answer), true);
  assert.equal(writes, 1);
  assert.equal(await rereadSections(root, async () => { throw new Error('down'); }), false);
  assert.equal(section.innerHTML, '<b>2</b>'); // the last good read stays
});

test('the freshness line never falls back to "not updated yet" once the page was drawn', async () => {
  const slot = fakeSlot();
  const { state, kp } = fakeKp(slot);
  const { api, internals } = createRefreshBus({ target: slot });
  mountRefresh(slot, internals, kp);
  api.markFresh(new Date(5_000)); // the page was just drawn
  state.agoSet.length = 0;
  api.setInterval(60); // the kp control repaints from its own (empty) record ...
  assert.deepEqual(state.agoSet, [5_000]); // ... and the kit puts the known moment back
  api.onTick(() => false);
  api.now();
  await settled();
  assert.deepEqual(state.done, [false]);
  assert.equal(state.agoSet.at(-1), 5_000); // a failed first read keeps it too
});

// An app hands over what its server said: an ISO string or epoch milliseconds,
// not only a Date. A string used to be dropped silently (Number(iso) is NaN)
// and null counted as 1970, so "56 years ago" stood on the page.
test('markFresh takes an ISO string and milliseconds, and ignores null and nonsense', () => {
  const { api } = createRefreshBus({ clock: () => 9_000 });
  api.markFresh('2026-11-02T08:00:00Z');
  assert.equal(api.freshAt(), Date.parse('2026-11-02T08:00:00Z'));
  api.markFresh(12_345);
  assert.equal(api.freshAt(), 12_345);
  api.markFresh(null);
  api.markFresh('not a time');
  api.markFresh('');
  assert.equal(api.freshAt(), 12_345, 'a value that is no moment changes nothing');
});
