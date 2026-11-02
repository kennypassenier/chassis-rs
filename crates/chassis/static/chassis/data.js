// `window.chassisData` (feat-offline-1): the offline app data client. Loaded
// by webapp-runtime.js on every web-app page and inert until the app calls
// `configure()`; nothing opens IndexedDB before. See docs/OFFLINE_DESIGN.md.
//
//   chassisData.configure({ name: 'kitchen', routes: ['/api/dishes', '/api/dishes/:id'] });
//   await chassisData.get('/api/dishes/7');   // { data, rev, offline, savedAt }

import { bindBand } from './data-band.js';
import { normalize } from './data-config.js';
import { createData } from './data-client.js';
import { createFailedView } from './data-failed-view.js';
import { wordsOf } from './data-errors.js';
import { installLogoutGuard } from './logout-guard.js';
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
    // The logout guard needs no configure(): it reads the stored queues of
    // every chassis-data database, and adds the open client's own once there.
    installLogoutGuard({ win, doc, confirm: kp?.openConfirmation, client: async () => (ready ? await ready : null), messages: () => wordsOf(words) });
    const configure = (options) => {
        if (ready) throw new Error('chassisData: configure() was already called on this page.');
        const config = normalize(options);
        words = config.messages;
        ready = (async () => {
            const store = await storeFor(win, config.name, deps);
            const emit = (name, detail) => win.dispatchEvent(new win.CustomEvent(name, { detail }));
            const data = await createData({
                config, store, emit, storage: storageOf(win),
                fetch: (...a) => win.fetch(...a),
                setTimer: (fn, ms) => win.setTimeout(fn, ms),
                clearTimer: (id) => win.clearTimeout(id),
                now: () => Date.now(),
            });
            const view = kp?.openDialog ? createFailedView({ win, doc, kp, data, messages: config.messages }) : null;
            if (kp) bindBand({ win, doc, kp, data, messages: config.messages, view });
            win.addEventListener('online', () => data.retry());
            return { ...data, review: (trigger) => view?.open(trigger) };
        })();
        return ready;
    };
    const facade = { configure, ready: () => ready };
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
