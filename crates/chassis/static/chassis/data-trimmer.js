// Trims the stored copy to what the settings keep (feat-offline-keep-1): run
// after an item or "keep everything" is switched off. Only the `reads` side is
// touched; queued writes live in another store and are never looked at.

import { matchRoute } from './data-config.js';
import { trimList } from './data-trim.js';

/** `cache` is the reads cache of data-cache.js. */
export function createTrimmer({ config, cache }) {
    async function trimStored(path, route, settings) {
        const kept = new Set(settings.items);
        if (route.kind === 'item') return kept.has(path.split('?')[0]) ? undefined : cache.forget(path);
        if (kept.size === 0) return cache.forget(path);
        const record = await cache.read(path);
        const data = record ? trimList(config, route, record.data, kept) : null;
        if (data === null) return cache.forget(path);
        return cache.amend(path, () => data, { partial: true });
    }

    return {
        /** Make the stored copy match `settings`: with "keep everything" on nothing is removed. */
        async trimAll(settings) {
            if (settings.all) return;
            for (const path of cache.paths()) {
                const route = matchRoute(config, path);
                if (route) await trimStored(path, route, settings);
                else await cache.forget(path);
            }
        },
    };
}
