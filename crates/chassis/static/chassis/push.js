// Web Push for the installed web app (habits-push-1): `window.chassisPush`.
// It has no interface of its own; the app decides where the switch goes.
//
//   await chassisPush.state()        // 'unsupported' | 'denied' | 'off' | 'on'
//   await chassisPush.subscribe()    // from a click: asks permission, subscribes
//   await chassisPush.unsubscribe()
//
// Loaded by webapp-runtime.js and active only when the server wrote the
// `<meta name="chassis-push">` tag into the page, which it does for an
// installable app of a build with the `push` feature. State is asynchronous
// because the browser keeps the subscription behind a promise.

import { api } from './json-api.js';

export const META_NAME = 'chassis-push';
export const KEY_URL = '/api/kit/push/key';
export const SUBSCRIBE_URL = '/api/kit/push/subscribe';
export const UNSUBSCRIBE_URL = '/api/kit/push/unsubscribe';

/** Whether the server enabled push for this page. */
export function pushEnabled(doc) {
    return typeof doc.querySelector === 'function' && doc.querySelector(`meta[name="${META_NAME}"]`) !== null;
}

/** Whether this browser can do Web Push at all. */
export function supported(win) {
    const nav = win.navigator;
    return Boolean(nav?.serviceWorker && win.PushManager && win.Notification);
}

/** The public key as the bytes `applicationServerKey` wants. */
export function keyBytes(base64url) {
    const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
    const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The state word for a permission and an existing subscription (or null). */
export function stateOf({ ok, permission, subscription }) {
    if (!ok) return 'unsupported';
    if (permission === 'denied') return 'denied';
    return subscription && permission === 'granted' ? 'on' : 'off';
}

/** What the server stores, from a browser subscription. */
export function subscriptionBody(subscription) {
    const json = subscription.toJSON();
    return { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } };
}

async function current(win) {
    const reg = await win.navigator.serviceWorker.ready;
    return { reg, subscription: await reg.pushManager.getSubscription() };
}

async function subscribeWithKey(reg, key) {
    const options = { userVisibleOnly: true, applicationServerKey: keyBytes(key) };
    try {
        return await reg.pushManager.subscribe(options);
    } catch (err) {
        // A subscription made with an older VAPID key blocks a new one.
        if (err?.name !== 'InvalidStateError') throw err;
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        return reg.pushManager.subscribe(options);
    }
}

/** The current state word; asks the registration, so it is asynchronous. */
async function readState(win) {
    if (!supported(win)) return 'unsupported';
    const { subscription } = await current(win);
    return stateOf({ ok: true, permission: win.Notification.permission, subscription });
}

/** Ask, subscribe with the server's key and tell the server; undo the browser side if it refuses. */
async function doSubscribe(win, post) {
    if (!supported(win)) throw new Error('This browser does not support push notifications.');
    // First await of the call: permission must be asked inside the click.
    const permission = await win.Notification.requestPermission();
    if (permission !== 'granted') return stateOf({ ok: true, permission, subscription: null });
    const [{ reg }, { public_key: key }] = await Promise.all([current(win), post(KEY_URL)]);
    const subscription = await subscribeWithKey(reg, key);
    try {
        await post(SUBSCRIBE_URL, subscriptionBody(subscription));
    } catch (err) {
        await subscription.unsubscribe().catch(() => {});
        throw err;
    }
    return 'on';
}

/** Tell the server, then the browser; the browser side ends either way. */
async function doUnsubscribe(win, post) {
    if (!supported(win)) return 'unsupported';
    const { subscription } = await current(win);
    if (!subscription) return readState(win);
    let failure = null;
    await post(UNSUBSCRIBE_URL, { endpoint: subscription.endpoint }).catch((e) => { failure = e; });
    await subscription.unsubscribe();
    if (failure) throw failure;
    return 'off';
}

/** Create `window.chassisPush` when the page has push enabled and the browser can do it. */
export function installPush(win, doc, post = api) {
    if (win.chassisPush || !pushEnabled(doc)) return win.chassisPush ?? null;
    win.chassisPush = {
        state: () => readState(win),
        subscribe: () => doSubscribe(win, post),
        unsubscribe: () => doUnsubscribe(win, post),
    };
    return win.chassisPush;
}
