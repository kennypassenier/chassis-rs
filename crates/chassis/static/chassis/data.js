// `window.chassisData` (feat-offline-1): the offline app data client. Loaded
// by webapp-runtime.js on every web-app page and inert until the app calls
// `configure()`; nothing opens IndexedDB before. See docs/OFFLINE_DESIGN.md.
//
//   chassisData.configure({ name: 'kitchen', routes: ['/api/dishes', '/api/dishes/:id'] });
//   await chassisData.get('/api/dishes/7');   // { data, rev, offline, savedAt }
//
// With `db: true` (or { syncUrl, pullMs, live, pageLimit }) the app also gets the
// local database, `chassisData.db.collection(name)` (docs/LOCAL_DB_DESIGN.md).

import { bindBand } from './data-band.js';
import { normalize } from './data-config.js';
import { createData } from './data-client.js';
import { bootDb } from './db-boot.js';
import { createFailedView } from './data-failed-view.js';
import { wordsOf } from './data-errors.js';
import { createHub } from './db-hub.js';
import { lazyDb } from './db-lazy.js';
import { installLogoutGuard } from './logout-guard.js';
import { rememberLogoutWords } from './logout-words.js';
import { memoryStore, openStore } from './data-store.js';

const METHODS = ['get', 'put', 'patch', 'post', 'delete', 'queue', 'pending', 'failed', 'unsent', 'retry', 'drop', 'resave',
    'settings', 'keepAll', 'keepItem', 'isKept', 'usage', 'clearCopy', 'purge', 'review'];

function storageOf(win) {
    try {
        return win.localStorage;
    } catch {
        return null; // blocked: the settings last until the page closes
    }
}

async function storeFor(win, name, deps) {
    try {
        return await (deps.openStore ?? openStore)(win.indexedDB, name);
    } catch (err) {
        console.warn('chassisData: IndexedDB is not usable here; the offline copy and queue last until the page closes.', err);
        return memoryStore();
    }
}

/** The facade on `win`: methods wait for `configure()`, which may run once. */
export function installData(win, doc, deps = {}, kp = null) {
    if (win.chassisData) return win.chassisData;
    // The facade exists synchronously, before the app's module scripts: the server puts the runtime first in <head>.
    let ready = null;
    let words = {};
    const hub = createHub();
    // The logout guard needs no configure(): it reads the stored queues of
    // every chassis-data database, and adds the open client's own once there.
    installLogoutGuard({ win, doc, confirm: kp?.openConfirmation, client: async () => (ready ? await ready : null), messages: () => wordsOf(words) });
    // `messages` of the app (an object or a function), swappable: a later configure({ messages }) replaces them.
    const messages = () => wordsOf(words);
    // The kit's own pages ask at logout with the app's words, stored here (fix-logout-words-1).
    const keepLogoutWords = () => rememberLogoutWords(storageOf(win), messages());
    if (typeof win.addEventListener === 'function') win.addEventListener('kp-strings-change', () => keepLogoutWords());
    const configure = (options) => {
        if (ready) return reword(options);
        const config = normalize(options);
        words = config.messages;
        keepLogoutWords();
        ready = (async () => {
            const store = await storeFor(win, config.name, deps);
            const listeners = new Map();
            const events = { on: (name, fn) => (listeners.set(name, [...(listeners.get(name) ?? []), fn]), () => listeners.set(name, listeners.get(name).filter((f) => f !== fn))) };
            const emit = (name, detail) => {
                win.dispatchEvent(new win.CustomEvent(name, { detail }));
                for (const fn of listeners.get(name) ?? []) fn(detail);
            };
            let dbBytes = () => 0;
            const data = await createData({
                config, store, emit, storage: storageOf(win), extraBytes: () => dbBytes(),
                fetch: (...a) => win.fetch(...a),
                setTimer: (fn, ms) => win.setTimeout(fn, ms),
                clearTimer: (id) => win.clearTimeout(id),
                now: () => Date.now(),
            });
            const view = kp?.openDialog ? createFailedView({ win, doc, kp, data, messages, describe: config.describe }) : null;
            if (kp) bindBand({ win, doc, kp, data, messages, view });
            // The connection is back: replay at once instead of waiting for the retry timer; a failure is reported, never left unhandled (fix-mc-data-d).
            win.addEventListener('online', () => data.retry().catch((err) => console.warn('chassisData: replaying the queued edits after the connection came back failed.', err)));
            const local = config.db ? bootDb({
                win, doc, app: config.name, options: config.db, data, hub, events, emit, storage: storageOf(win), deps,
                fetch: (...a) => win.fetch(...a), setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: (id) => win.clearTimeout(id),
                now: () => Date.now(), uuid: () => win.crypto.randomUUID(),
            }) : null;
            if (local) dbBytes = local.bytes;
            return {
                ...data,
                review: (trigger) => view?.open(trigger),
                dbEnsure: () => (local ? local.ensure() : Promise.reject(new Error('chassisData.db: pass db: true to configure() to use the local database.'))),
                // "Keep everything" also decides what the local database stores.
                async keepAll(on) {
                    const result = await data.keepAll(on);
                    await local?.keepAllChanged(result).catch((err) => !err?.offline && console.warn('chassisData.db: the local database could not follow "keep everything".', err));
                    return result;
                },
                // Logout: the offline copy, the queue and the local database all go.
                async purge() {
                    await data.purge();
                    await local?.purge();
                },
            };
        })();
        return ready;
    };
    /** A second configure() may only bring new `messages` (the language changed); anything else is an error. */
    function reword(options) {
        const extra = Object.keys(options ?? {}).filter((k) => k !== 'messages');
        const next = options?.messages;
        if (extra.length > 0 || !(typeof next === 'function' || (next && typeof next === 'object'))) {
            throw new Error('chassisData: configure() was already called on this page. A later call may only pass { messages } (an object or a function).');
        }
        words = next;
        keepLogoutWords();
        if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('chassis-data-messages'));
        return ready;
    }
    const dbEnsure = () => (ready ? ready.then((client) => client.dbEnsure()) : Promise.reject(new Error('chassisData: call configure() first.')));
    const facade = { configure, ready: () => ready, db: lazyDb({ ensure: dbEnsure, hub }) };
    for (const name of METHODS) {
        facade[name] = async (...args) => {
            if (!ready) throw new Error('chassisData: call configure() first.');
            return (await ready)[name](...args);
        };
    }
    win.chassisData = facade;
    // For code that cannot rely on script order (a classic script, a late import):
    // the promise settles with the facade, and the event fires once, at install (fix-habits-data-5).
    win.chassisDataReady = Promise.resolve(facade);
    // (a bare test window has no event machinery: nothing to announce there)
    if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('chassis-data-ready'));
    return facade;
}
