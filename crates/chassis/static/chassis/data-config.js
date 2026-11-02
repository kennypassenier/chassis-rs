// Offline app data (feat-offline-1): the configuration an app hands to
// `chassisData.configure()`, validated once, and the route table. Pure.

import { normalizeDb } from './db-config.js';
import { childRoute } from './data-trim.js';

export const DEFAULTS = Object.freeze({
    name: 'app',
    rev: 'rev',
    routes: [],
    maxBytes: 50 * 1024 * 1024,
    warnRatio: 0.8,
    retryMs: 30_000,
    onConflict: null,
    itemKey: 'id',
    queryCopies: 8,
    messages: {},
    describe: null,
    db: null,
});

const PARAM = /^:[A-Za-z_][A-Za-z0-9_]*$/;

function fail(message, remedy) {
    return new Error(`chassisData: ${message}. ${remedy}`);
}

/** Compile `/api/dishes/:id` into `{ pattern, kind, keep, test(path) }`; `keep` is the route's own limit of query-string copies, or null. */
export function compileRoute(declared) {
    const { pattern, keep } = typeof declared === 'object' && declared !== null ? { pattern: declared.path, keep: declared.keep ?? null } : { pattern: declared, keep: null };
    if (keep !== null) positive(keep, `keep of route ${pattern}`);
    if (typeof pattern !== 'string' || !pattern.startsWith('/') || pattern.includes('?')) {
        throw fail(`route ${JSON.stringify(pattern)} is not a path`, 'Use a path of this app such as "/api/dishes/:id".');
    }
    const parts = pattern.split('/').slice(1);
    const kind = parts.some((p) => PARAM.test(p)) ? 'item' : 'list';
    const test = (path) => {
        const got = path.split('/').slice(1);
        return got.length === parts.length && parts.every((p, i) => (PARAM.test(p) ? got[i] !== '' : p === got[i]));
    };
    return { pattern, kind, keep, test };
}

function positive(value, key) {
    if (!Number.isFinite(value) || value <= 0) {
        throw fail(`${key} must be a positive number`, `Pass a number above zero for ${key}.`);
    }
    return value;
}

/** The validated configuration, with the defaults filled in. */
export function normalize(options = {}) {
    const merged = { ...DEFAULTS, ...options };
    if (typeof merged.name !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(merged.name)) {
        throw fail('name must be 1-40 letters, digits, "-" or "_"', 'It names the IndexedDB database of this app.');
    }
    if (!Array.isArray(merged.routes) || (merged.routes.length === 0 && !merged.db)) {
        throw fail('routes is empty', 'List the item and list routes of the app, e.g. ["/api/dishes", "/api/dishes/:id"].');
    }
    if (merged.onConflict !== null && typeof merged.onConflict !== 'function') {
        throw fail('onConflict must be a function', 'Return "skip", "hold" or "drop".');
    }
    if (merged.describe !== null && typeof merged.describe !== 'function') {
        throw fail('describe must be a function', 'Return { title, detail? } naming a failed edit, e.g. (entry) => ({ title: "Change task" }).');
    }
    if (!(merged.warnRatio > 0 && merged.warnRatio < 1)) {
        throw fail('warnRatio must be between 0 and 1', 'For example 0.8 warns at 80 percent of the cap.');
    }
    if (typeof merged.itemKey !== 'string' && typeof merged.itemKey !== 'function') {
        throw fail('itemKey must be a field name or a function', 'It maps a list entry to its item path, e.g. "id" for /api/dishes/:id.');
    }
    positive(merged.maxBytes, 'maxBytes');
    positive(merged.retryMs, 'retryMs');
    positive(merged.queryCopies, 'queryCopies');
    merged.db = normalizeDb(merged.db);
    const compiled = merged.routes.map(compileRoute);
    for (const route of compiled) route.child = route.kind === 'list' ? childRoute(compiled, route) : null;
    return { ...merged, compiled };
}

/** The route a path belongs to (query string ignored), or null. */
export function matchRoute(config, path) {
    const pathname = path.split('?')[0];
    return config.compiled.find((r) => r.test(pathname)) ?? null;
}

/** A same-origin path with its query, or an error: nothing else is ever requested or stored. */
export function checkPath(path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('#')) {
        throw fail(`${JSON.stringify(path)} is not a path of this app`, 'Use "/api/...", never a full URL.');
    }
    return path;
}
