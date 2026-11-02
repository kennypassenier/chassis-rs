// A bound on the copies of one route that differ only by query string
// (fix-habits-data-6): `/data/worklog?from=..&to=..` would otherwise keep one
// copy per range ever viewed. Per route, the least recently used query copies
// go first. Order lives in memory: a stored copy's `savedAt` seeds it after a
// reload, then every keep and every offline read moves the copy to the newest end.

import { matchRoute } from './data-config.js';

const pathnameOf = (path) => path.split('?')[0];

/** `records` are the stored reads at start-up; `config.queryCopies` is the default limit, a route's `keep` overrides it. */
export function createLru(config, records = []) {
    const order = new Map(); // path -> true, oldest first
    const seed = records.filter((r) => r.path.includes('?')).sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
    for (const r of seed) order.set(r.path, true);

    const limitOf = (path) => matchRoute(config, path)?.keep ?? config.queryCopies;

    return {
        /** `path` was kept or read just now. Plain paths are not tracked. */
        touch(path) {
            if (!path.includes('?')) return;
            order.delete(path);
            order.set(path, true);
        },
        delete: (path) => order.delete(path),
        clear: () => order.clear(),
        /** The query copies of `path`'s route beyond its limit, oldest first; `path` itself is never one. */
        over(path) {
            if (!path.includes('?')) return [];
            const same = [...order.keys()].filter((p) => pathnameOf(p) === pathnameOf(path));
            const extra = same.length - limitOf(path);
            return extra > 0 ? same.filter((p) => p !== path).slice(0, extra) : [];
        },
    };
}
