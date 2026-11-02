// The offline client's databases seen from outside (fix-offline-logout-1):
// every `chassis-data:*` database of this origin, whether or not this page
// ever called `chassisData.configure()`. The logout guard counts the edits
// waiting in their queues and deletes the databases; kit pages need that
// without knowing the app's name. Like data-store.js this file touches
// IndexedDB directly; it never writes a record.

import { DB_PREFIX } from './data-store.js';
import { DB_PREFIX as LOCAL_DB_PREFIX } from './db-store.js';

const once = (request) =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });

/** The names of this origin's offline databases, or null when the browser cannot list them. */
export async function storedNames(idb, prefixes = [DB_PREFIX]) {
    if (!idb || typeof idb.databases !== 'function') return null;
    const all = await idb.databases();
    return all.map((d) => d.name).filter((n) => typeof n === 'string' && prefixes.some((p) => n.startsWith(p)));
}

/** How many edits (waiting, held or failed) database `name` holds. */
async function queueLength(idb, name) {
    // No version: open what exists at its current version, never upgrade.
    const request = idb.open(name);
    request.onupgradeneeded = () => request.transaction.abort(); // it vanished meanwhile: do not create it
    const db = await once(request);
    try {
        if (!db.objectStoreNames.contains('queue')) return 0;
        return await once(db.transaction('queue', 'readonly').objectStore('queue').count());
    } finally {
        db.close();
    }
}

/**
 * The number of unsent edits over every offline database of the origin. A
 * database that cannot be read is reported and skipped, never counted as
 * empty silently; a browser that cannot list databases says so once and
 * answers 0 (the caller may add the open client's own count).
 */
export async function countStoredQueues(idb, warn = console.warn) {
    let names;
    try {
        names = await storedNames(idb);
    } catch (err) {
        warn('chassisData: the offline databases could not be listed; unsent edits are not checked.', err);
        return 0;
    }
    if (names === null) {
        warn('chassisData: this browser cannot list IndexedDB databases; unsent edits of other pages are not checked.');
        return 0;
    }
    let total = 0;
    for (const name of names) {
        try {
            total += await queueLength(idb, name);
        } catch (err) {
            warn(`chassisData: the queue of ${name} could not be read; it is not counted.`, err);
        }
    }
    return total;
}

/** Delete every offline database (`chassis-data:*` and the local database `chassis-db:*`); a blocked one (open in another tab) is left to the worker. */
export async function deleteStoredCopies(idb) {
    const names = (await storedNames(idb, [DB_PREFIX, LOCAL_DB_PREFIX])) ?? [];
    await Promise.all(names.map((name) => new Promise((resolve) => {
        const request = idb.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
}
