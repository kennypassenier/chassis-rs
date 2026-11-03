// One runtime boots per page [dupe-1103].
//
// Loading the full bundle (dist/kp-themes.min.js) and the chunked entry
// (dist/js/auto.js) on one page boots two runtimes. Each arms its own
// observers and attaches to the same markup, and Almanac (2026-11-03) saw
// Firefox freeze before DOMContentLoaded. The first copy to boot claims a
// marker on the global object; a second copy finds it, refuses to boot and
// logs one error naming both entries and the fix.
//
// Only the automatic boot in js/auto.js asks. The marker is a Symbol.for key,
// so copies of the package that share no module registry still see it. Plain
// exports (attachDialogs, applyTheme, ...) never ask, so a bundle that imports
// parts but does not load js/auto.js claims nothing and is never refused. The
// split entries share their chunks, so they hold one evaluation of js/auto.js
// and claim once.

/** The global key the first booted runtime sets. */
export const BOOT_MARKER = Symbol.for('kp-themes.boot');

/** The fix the error names. */
export const BOOT_FIX = 'load either dist/kp-themes.min.js or dist/js/auto.js, not both';

/**
 * Name an entry the way a person loads it: its path and which build it is.
 * @param {string} url the module's own `import.meta.url`
 * @returns {string}
 */
export function describeEntry(url) {
    const path = url.replace(/^[a-z]+:\/\/[^/]*/i, '').replace(/[?#].*$/, '');
    if (/\/kp-themes(\.min)?\.js$/.test(path)) return `${path} (the full bundle)`;
    if (/\/dist\/js\//.test(path)) return 'dist/js/ (the chunked bundle, started by dist/js/auto.js or dist/js/index.js)';
    return `${path} (loose js/auto.js)`;
}

/**
 * Claim the boot for this copy. Returns true when this copy is the first and may boot; otherwise logs one error
 * naming both entries and returns false.
 *
 * @param {string} entry this copy's `import.meta.url`
 * @param {Record<symbol, unknown>} [scope] where the marker lives, `globalThis` unless a test passes its own
 * @returns {boolean}
 */
export function claimBoot(entry, scope = /** @type {Record<symbol, unknown>} */ (/** @type {unknown} */ (globalThis))) {
    const first = scope[BOOT_MARKER];
    if (typeof first !== 'string') {
        scope[BOOT_MARKER] = entry;
        return true;
    }
    console.error(
        `kp-themes: a second copy of the runtime tried to boot on this page and was refused. First: ${describeEntry(first)}. Second: ${describeEntry(entry)}. Fix: ${BOOT_FIX}.`,
    );
    return false;
}
