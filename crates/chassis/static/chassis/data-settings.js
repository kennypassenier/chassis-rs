// The per-device settings API of the client: what is kept offline (feat-offline-3,
// split out of data-client.js; no behaviour change).

import { matchRoute } from './data-config.js';
import { loadSettings, saveSettings, shouldKeep, withAll, withItem } from './data-keep.js';
import { createTrimmer } from './data-trimmer.js';
import { fail } from './data-errors.js';

/** Returns { current, api }: `current()` is the live settings object. */
export function createSettings({ storage, config, cache }) {
    const trimmer = createTrimmer({ config, cache });
    let settings = loadSettings(storage, config.name);
    const persist = (next) => {
        settings = next;
        saveSettings(storage, config.name, settings);
        return settings;
    };
    const api = {
        settings: () => ({ all: settings.all, items: [...settings.items] }),
        /** Switching off trims the stored copy first; resolves to the new value. */
        async keepAll(on) {
            persist(withAll(settings, on));
            await trimmer.trimAll(settings);
            return settings.all;
        },
        /** Throws at once for a non-item path; switching off trims the copy; resolves to the new state. */
        keepItem(path, on) {
            const route = matchRoute(config, path);
            if (route?.kind !== 'item') throw fail(`${path} is not an item route of this app. Add "…/:id" to routes.`);
            persist(withItem(settings, path, on));
            return trimmer.trimAll(settings).then(() => on === true && settings.items.includes(path));
        },
        isKept: (path) => shouldKeep(settings, matchRoute(config, path), path),
    };
    return { current: () => settings, api };
}
