// window.chassisPush (habits-push-1): the pure helpers, and the three calls
// driven with a fake browser (service worker registration, PushManager,
// Notification) and a fake JSON API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    installPush, pushEnabled, stateOf, keyBytes, subscriptionBody, KEY_URL, SUBSCRIBE_URL, UNSUBSCRIBE_URL,
} from '../../static/chassis/push.js';

const docWith = (on) => ({ querySelector: (sel) => (on && sel.includes('chassis-push') ? {} : null) });

test('the state words follow support, permission and the subscription', () => {
    const sub = {};
    assert.equal(stateOf({ ok: false, permission: 'default', subscription: null }), 'unsupported');
    assert.equal(stateOf({ ok: true, permission: 'denied', subscription: sub }), 'denied');
    assert.equal(stateOf({ ok: true, permission: 'default', subscription: null }), 'off');
    assert.equal(stateOf({ ok: true, permission: 'granted', subscription: null }), 'off');
    assert.equal(stateOf({ ok: true, permission: 'granted', subscription: sub }), 'on');
});

test('the key becomes bytes and a subscription becomes the body the server wants', () => {
    assert.deepEqual([...keyBytes('AQID')], [1, 2, 3]);
    assert.deepEqual([...keyBytes('-_8')], [0xfb, 0xff]);
    const s = { toJSON: () => ({ endpoint: 'https://p.example/1', keys: { p256dh: 'K', auth: 'A' }, expirationTime: null }) };
    assert.deepEqual(subscriptionBody(s), { endpoint: 'https://p.example/1', keys: { p256dh: 'K', auth: 'A' } });
});

test('nothing is installed without the server tag, and a second install is a no-op', () => {
    assert.equal(pushEnabled(docWith(false)), false);
    assert.equal(pushEnabled({}), false, 'a page without a DOM');
    const win = {};
    assert.equal(installPush(win, docWith(false)), null);
    assert.equal(win.chassisPush, undefined);
    const first = installPush(win, docWith(true), async () => ({}));
    assert.equal(installPush(win, docWith(true), async () => ({})), first);
});

function browser({ permission = 'default', ask = 'granted', existing = null, subscribeError = null } = {}) {
    const calls = [];
    let subscription = existing;
    const made = {
        endpoint: 'https://p.example/new',
        toJSON: () => ({ endpoint: 'https://p.example/new', keys: { p256dh: 'K', auth: 'A' } }),
        unsubscribe: async () => { calls.push('browser-unsubscribe'); subscription = null; return true; },
    };
    const reg = {
        pushManager: {
            getSubscription: async () => subscription,
            subscribe: async (o) => {
                calls.push(['subscribe', o.userVisibleOnly, [...o.applicationServerKey]]);
                if (subscribeError) { const e = subscribeError; subscribeError = null; throw e; }
                subscription = made;
                return made;
            },
        },
    };
    const win = {
        navigator: { serviceWorker: { ready: Promise.resolve(reg) } },
        PushManager: {},
        Notification: { permission, requestPermission: async () => { calls.push('ask'); return ask; } },
    };
    const api = [];
    const post = async (path, body) => {
        api.push([path, body]);
        return path === KEY_URL ? { public_key: 'AQID' } : { ok: true };
    };
    return { win, calls, api, post };
}

test('subscribe asks first, subscribes with the server key and tells the server', async () => {
    const b = browser();
    installPush(b.win, docWith(true), b.post);
    assert.equal(await b.win.chassisPush.state(), 'off');
    assert.equal(await b.win.chassisPush.subscribe(), 'on');
    assert.equal(b.calls[0], 'ask', 'permission is the first thing, inside the click');
    assert.deepEqual(b.calls[1], ['subscribe', true, [1, 2, 3]]);
    assert.deepEqual(b.api.map((a) => a[0]), [KEY_URL, SUBSCRIBE_URL]);
    assert.deepEqual(b.api[1][1], { endpoint: 'https://p.example/new', keys: { p256dh: 'K', auth: 'A' } });
});

test('a refused permission subscribes nothing', async () => {
    const b = browser({ ask: 'denied' });
    installPush(b.win, docWith(true), b.post);
    assert.equal(await b.win.chassisPush.subscribe(), 'denied');
    assert.deepEqual(b.api, []);
});

test('when the server refuses, the browser subscription is undone too', async () => {
    const b = browser();
    const post = async (path) => { if (path === SUBSCRIBE_URL) throw new Error('refused'); return { public_key: 'AQID' }; };
    installPush(b.win, docWith(true), post);
    await assert.rejects(b.win.chassisPush.subscribe(), /refused/);
    assert.ok(b.calls.includes('browser-unsubscribe'));
});

test('a subscription made with an older key is replaced', async () => {
    const stale = { unsubscribe: async () => {} };
    const b = browser({ existing: stale, subscribeError: Object.assign(new Error('x'), { name: 'InvalidStateError' }) });
    installPush(b.win, docWith(true), b.post);
    assert.equal(await b.win.chassisPush.subscribe(), 'on');
    assert.equal(b.calls.filter((c) => Array.isArray(c)).length, 2, 'subscribed twice: refused, then accepted');
});

test('unsubscribe tells the server, then the browser, and ends off', async () => {
    const existing = { endpoint: 'https://p.example/old', unsubscribe: async () => {} };
    const b = browser({ permission: 'granted', existing });
    installPush(b.win, docWith(true), b.post);
    assert.equal(await b.win.chassisPush.state(), 'on');
    assert.equal(await b.win.chassisPush.unsubscribe(), 'off');
    assert.deepEqual(b.api, [[UNSUBSCRIBE_URL, { endpoint: 'https://p.example/old' }]]);
});

test('a browser without push is unsupported and says so', async () => {
    const win = { navigator: {} };
    installPush(win, docWith(true), async () => ({}));
    assert.equal(await win.chassisPush.state(), 'unsupported');
    assert.equal(await win.chassisPush.unsubscribe(), 'unsupported');
    await assert.rejects(win.chassisPush.subscribe(), /does not support/);
});
