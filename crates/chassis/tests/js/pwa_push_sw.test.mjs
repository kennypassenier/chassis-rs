// Web Push in the service worker (habits-push-1): the pure decisions of
// sw-push-logic.js as they are, and the push / notificationclick handlers of
// sw-push.js driven with a fake registration, fake clients and a fake fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../../src/shell/webapp/pwa/', import.meta.url);
const logicSrc = readFileSync(new URL('sw-push-logic.js', dir), 'utf8');
const coreSrc = readFileSync(new URL('sw-push.js', dir), 'utf8');
const origin = 'https://habits.example';
// Objects made inside the vm have another realm's prototypes; compare as JSON.
const J = (v) => JSON.parse(JSON.stringify(v));

const logic = (() => {
    const module = { exports: {} };
    vm.runInNewContext(logicSrc, { module, URL });
    return module.exports;
})();

test('a payload becomes a notification with the fixed icon, badge and the data to click on', () => {
    const text = JSON.stringify({
        title: 'Water drinken', body: 'Het is tijd', url: '/habits/water', tag: 'water',
        actions: [
            { action: 'done', title: 'Gedaan', url: '/api/habits/water/done' },
            { action: 'snooze', title: 'Over 1 uur', url: '/api/habits/water/snooze' },
        ],
    });
    const p = logic.parsePushPayload(text, origin);
    const o = logic.notificationOptions(p, 2);
    assert.equal(p.title, 'Water drinken');
    assert.equal(o.body, 'Het is tijd');
    assert.equal(o.icon, '/pwa/icon-192.png');
    assert.equal(o.badge, '/pwa/icon-monochrome-512.png');
    assert.equal(o.tag, 'water');
    assert.equal(o.renotify, true, 'a replacing message still alerts');
    assert.deepEqual(J(o.actions), [{ action: 'done', title: 'Gedaan' }, { action: 'snooze', title: 'Over 1 uur' }]);
    assert.deepEqual(J(o.data), {
        url: '/habits/water',
        actions: [{ action: 'done', url: '/api/habits/water/done' }, { action: 'snooze', url: '/api/habits/water/snooze' }],
    });
});

test('only as many buttons as the browser shows are kept, in the notification and in its data', () => {
    const p = logic.parsePushPayload(JSON.stringify({
        title: 't', actions: ['a', 'b', 'c'].map((x) => ({ action: x, title: x, url: `/x/${x}` })),
    }), origin);
    const o = logic.notificationOptions(p, 2);
    assert.deepEqual(J(o.actions).map((a) => a.action), ['a', 'b']);
    assert.deepEqual(J(o.data.actions).map((a) => a.action), ['a', 'b']);
    assert.equal(logic.notificationOptions(p, 0).actions.length, 0);
    assert.equal('tag' in o, false, 'no tag, no renotify');
    assert.equal('renotify' in o, false);
});

test('an empty, broken or hostile message still shows something safe', () => {
    assert.equal(logic.parsePushPayload('', origin).title, 'Notification');
    const text = logic.parsePushPayload('plain words', origin);
    assert.deepEqual([text.title, text.body], ['Notification', 'plain words']);
    const evil = logic.parsePushPayload(JSON.stringify({
        title: 't', url: 'https://evil.example/x',
        actions: [{ action: 'a', title: 'A', url: 'https://evil.example/post' }, { action: 'b', title: 'B', url: '//evil.example' }, { title: 'no id', url: '/x' }],
    }), origin);
    assert.equal(evil.url, '/', 'a foreign url falls back to the app root');
    assert.deepEqual(J(evil.actions), [], 'no foreign or incomplete action survives');
});

test('a click on an action posts, a click on the body or an unknown action opens', () => {
    const data = { url: '/habits/water', actions: [{ action: 'done', url: '/api/habits/water/done' }] };
    assert.deepEqual(J(logic.clickPlan({ action: 'done', data }, origin)), { kind: 'post', url: '/api/habits/water/done', open: '/habits/water' });
    assert.deepEqual(J(logic.clickPlan({ action: '', data }, origin)), { kind: 'open', url: '/habits/water' });
    assert.deepEqual(J(logic.clickPlan({ action: 'gone', data }, origin)), { kind: 'open', url: '/habits/water' });
    assert.deepEqual(J(logic.clickPlan({ action: '', data: undefined }, origin)), { kind: 'open', url: '/' });
});

test('an open window is reused only when it shows the very page', () => {
    const win = (url) => ({ url });
    const list = [win(`${origin}/other`), win(`${origin}/habits/water?x=1`), win(`${origin}/habits/water`)];
    assert.equal(logic.pickClient(list, '/habits/water', origin), list[2]);
    assert.equal(logic.pickClient(list, '/habits/water?x=1', origin), list[1]);
    assert.equal(logic.pickClient(list, '/nowhere', origin), null);
    assert.equal(logic.pickClient([win('not a url')], '/', origin), null);
});

function worker({ fetchResult = { ok: true }, clients = [], maxActions = 2 } = {}) {
    const listeners = {};
    const log = { shown: [], fetched: [], opened: [], focused: [], closed: 0 };
    const self = {
        addEventListener: (name, fn) => (listeners[name] = fn),
        location: { origin },
        registration: { showNotification: async (title, options) => log.shown.push({ title, options }) },
        clients: {
            matchAll: async () => clients.map((c) => ({ url: c, focus: async () => log.focused.push(c) })),
            openWindow: async (u) => log.opened.push(u),
        },
    };
    const fetch = async (url, init) => {
        log.fetched.push({ url, init });
        if (fetchResult instanceof Error) throw fetchResult;
        return fetchResult;
    };
    vm.runInNewContext(`${logicSrc}\n${coreSrc}`, { self, fetch, URL, Notification: { maxActions } });
    const run = async (name, event) => {
        const waits = [];
        listeners[name]({ ...event, waitUntil: (p) => waits.push(p) });
        await Promise.all(waits);
    };
    const click = (action, data) =>
        run('notificationclick', { action, notification: { data, close: () => (log.closed += 1) } });
    return { run, click, log };
}

const data = { url: '/habits/water', actions: [{ action: 'done', url: '/api/habits/water/done' }] };

test('the push event shows the notification', async () => {
    const w = worker();
    await w.run('push', { data: { text: () => JSON.stringify({ title: 'Hi', body: 'B' }) } });
    assert.equal(w.log.shown.length, 1);
    assert.equal(w.log.shown[0].title, 'Hi');
    assert.equal(w.log.shown[0].options.body, 'B');
    const empty = worker();
    await empty.run('push', { data: null });
    assert.equal(empty.log.shown[0].title, 'Notification', 'an empty push still shows a notification');
});

test('an action button posts with the cookie, closes and does not open a window', async () => {
    const w = worker();
    await w.click('done', data);
    assert.equal(w.log.closed, 1);
    assert.equal(w.log.fetched.length, 1);
    const { url, init } = w.log.fetched[0];
    assert.equal(url, '/api/habits/water/done');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'same-origin');
    assert.deepEqual(w.log.opened.concat(w.log.focused), []);
});

test('a failed action post opens the app at the notification url instead of failing silently', async () => {
    for (const fetchResult of [{ ok: false, status: 401 }, new TypeError('offline')]) {
        const w = worker({ fetchResult });
        await w.click('done', data);
        assert.deepEqual(w.log.opened, ['/habits/water']);
    }
});

test('a body click focuses the open window at the url, else opens a new one', async () => {
    const same = worker({ clients: [`${origin}/habits/water`] });
    await same.click('', data);
    assert.deepEqual([same.log.focused, same.log.opened], [[`${origin}/habits/water`], []]);
    assert.equal(same.log.fetched.length, 0);
    const none = worker({ clients: [`${origin}/other`] });
    await none.click('', data);
    assert.deepEqual([none.log.focused, none.log.opened], [[], ['/habits/water']]);
});
