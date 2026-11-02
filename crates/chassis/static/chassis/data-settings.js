// The per-device settings API of the client: what is kept offline (feat-offline-3,
// split out of data-client.js; no behaviour change).

import { matchRoute } from './data-config.js';
import { loadSettings, saveSettings, shouldKeep, withAll, withItem } from './data-keep.js';
import { fail } from './data-errors.js';

/** Returns { current, api }: `current()` is the live settings object. */
export function createSettings({ storage, config }) {
    let settings = loadSettings(storage, config.name);
    const persist = (next) => {
        settings = next;
        saveSettings(storage, config.name, settings);
        return settings;
    };
    const api = {
        settings: () => ({ all: settings.all, items: [...settings.items] }),
        keepAll: (on) => persist(withAll(settings, on)).all,
        keepItem(path, on) {
            const route = matchRoute(config, path);
            if (route?.kind !== 'item') throw fail(`${path} is not an item route of this app. Add "…/:id" to routes.`);
            persist(withItem(settings, path, on));
            return on === true && settings.items.includes(path);
        },
        isKept: (path) => shouldKeep(settings, matchRoute(config, path), path),
    };
    return { current: () => settings, api };
}
