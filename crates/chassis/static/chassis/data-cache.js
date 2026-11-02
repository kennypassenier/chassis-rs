// The offline copy of server answers (feat-offline-1): what is kept, how many
// bytes it takes, and the cap. Store-agnostic; sizes are tracked in memory so
// a write never rereads the whole copy.

import { createLru } from './data-lru.js';
import { capLevel, sizeOf } from './data-keep.js';

/**
 * `store` is the flat store; `extraBytes()` the bytes of the write queue (it
 * counts against the cap); `onLevel(detail)` hears every change of level.
 */
export async function createCache({ store, config, extraBytes = () => 0, onLevel = () => {}, now = Date.now }) {
    const stored = await store.allReads();
    const sizes = new Map(stored.map((r) => [r.path, r.size ?? sizeOf(r.data)]));
    const lru = createLru(config, stored);
    let level = 'ok';

    const readBytes = () => [...sizes.values()].reduce((a, b) => a + b, 0);
    const usage = () => {
        const used = readBytes() + extraBytes();
        return { used, max: config.maxBytes, level: capLevel(used, config.maxBytes, config.warnRatio) };
    };
    const settle = () => {
        const u = usage();
        if (u.level !== level) {
            level = u.level;
            onLevel(u);
        }
        return u;
    };

    return {
        usage,
        /** The paths of the stored answers. */
        paths: () => [...sizes.keys()],
        settle,
        read(path) {
            lru.touch(path);
            return store.getRead(path);
        },
        /** Keep an answer. Returns false (and reports `full`) when it would pass the cap. */
        async remember(path, data, rev, partial = false) {
            const size = sizeOf(data);
            const room = config.maxBytes - readBytes() - extraBytes() + (sizes.get(path) ?? 0);
            if (size > room) {
                level = 'full';
                onLevel({ ...usage(), level: 'full' });
                return false;
            }
            await store.putRead({ path, data, rev: rev ?? null, partial, size, savedAt: now() });
            sizes.set(path, size);
            lru.touch(path);
            // Past the route's limit of query copies the least recently used go (the size cap still applies above).
            for (const old of lru.over(path)) await this.forget(old);
            settle();
            return true;
        },
        /** Change the copy of `path` if there is one (a queued edit shows offline). */
        async amend(path, change, extra = {}) {
            const had = await store.getRead(path);
            if (!had) return;
            const data = change(had.data);
            if (data === undefined) return this.forget(path);
            await store.putRead({ ...had, ...extra, data, size: sizeOf(data) });
            sizes.set(path, sizeOf(data));
            settle();
        },
        async forget(path) {
            await store.deleteRead(path);
            sizes.delete(path);
            lru.delete(path);
            settle();
        },
        async clear() {
            await store.clearReads();
            sizes.clear();
            lru.clear();
            settle();
        },
    };
}
