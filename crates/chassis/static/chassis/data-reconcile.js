// Server deletions remove the local items (fix-server-wins-2). A fresh online
// answer is the truth: an item the server no longer lists, or answers 404 / 410
// for, loses its stored copy and its entry in every stored list. A queued write
// for that path is the one exception: it stays until it is replayed, and the
// server's 404 / 410 then sends it to the failed list. Assumption: a list
// route's answer without a query string is the complete collection.

import { matchRoute } from './data-config.js';
import { entriesOf, entryPath } from './data-trim.js';

export function createReconciler({ config, cache, hasPending }) {
    /** Drop `paths` from the entries of every stored list that maps to the same item route. */
    async function unlist(child, paths) {
        for (const stored of cache.paths()) {
            const route = matchRoute(config, stored);
            if (route?.kind !== 'list' || route.child !== child) continue;
            await cache.amend(stored, (data) => {
                const entries = entriesOf(data);
                if (!entries) return data;
                const left = entries.filter((e) => !paths.has(entryPath(config, child, e)));
                if (left.length === entries.length) return data;
                return Array.isArray(data) ? left : { ...data, items: left };
            });
        }
    }

    async function remove(child, paths) {
        const doomed = new Set([...paths].filter((p) => !hasPending(p)));
        for (const path of doomed) await cache.forget(path);
        if (doomed.size > 0) await unlist(child, doomed);
    }

    return {
        /** The server answered 404 / 410 for item `path`. */
        async gone(path) {
            const route = matchRoute(config, path);
            if (route?.kind !== 'item' || hasPending(path)) return;
            await cache.forget(path);
            await unlist(route, new Set([path]));
        },
        /** A whole list answered: every stored item it no longer holds is gone. */
        async listAnswered(route, path, body) {
            const entries = entriesOf(body);
            if (!route.child || !entries || path.includes('?')) return;
            const here = new Set(entries.map((e) => entryPath(config, route.child, e)));
            const stale = cache.paths().filter((p) => !p.includes('?') && matchRoute(config, p) === route.child && !here.has(p));
            await remove(route.child, new Set(stale));
        },
    };
}
