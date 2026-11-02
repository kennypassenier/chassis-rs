// The per-device offline settings (feat-offline-1): keep an offline copy of
// everything, or of chosen items; and the size cap's level. The decisions are
// pure; `loadSettings` / `saveSettings` are the only storage touch.

export const EMPTY = Object.freeze({ all: false, items: [] });

/** Whether the answer of `path` (matching `route`) is copied for offline use. */
export function shouldKeep(settings, route, path) {
    if (!route) return false;
    if (settings.all) return true;
    const pathname = path.split('?')[0];
    if (route.kind === 'item') return settings.items.includes(pathname);
    // A list is the way to a kept item: it is kept (trimmed to the kept items) when it has an item route.
    return settings.items.length > 0 && route.child != null;
}

export function withAll(settings, on) {
    return { ...settings, all: Boolean(on) };
}

export function withItem(settings, path, on) {
    const rest = settings.items.filter((p) => p !== path);
    return { ...settings, items: on ? [...rest, path] : rest };
}

/** `'ok'`, `'warn'` (at or above the ratio) or `'full'` (at or above the cap). */
export function capLevel(used, max, warnRatio) {
    if (used >= max) return 'full';
    return used >= max * warnRatio ? 'warn' : 'ok';
}

/** UTF-8 size of a value as it is stored. */
export function sizeOf(value) {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
}

const keyOf = (name) => `chassis-data:${name}:settings`;

/** The saved settings; a blocked or damaged store gives the empty settings and a warning. */
export function loadSettings(storage, name) {
    try {
        const raw = storage?.getItem(keyOf(name));
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed.items) ? parsed.items.filter((p) => typeof p === 'string') : [];
        return { all: parsed.all === true, items };
    } catch (err) {
        console.warn('chassisData: the offline settings could not be read; starting empty.', err);
        return EMPTY;
    }
}

export function saveSettings(storage, name, settings) {
    try {
        storage?.setItem(keyOf(name), JSON.stringify(settings));
        return true;
    } catch (err) {
        console.warn('chassisData: the offline settings could not be saved; they last until the page closes.', err);
        return false;
    }
}
