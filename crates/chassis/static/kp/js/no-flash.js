// The no-flash snippet [TH23].
//
// Runs before first paint, in the document head, before any stylesheet
// has painted a light background under a visitor who chose a dark theme.
// Six lines, and deliberately ignorant of which themes are dark: it only
// copies the stored name onto <html>, and the stylesheet does the rest.
// Knowing which themes are dark is the registry's job, and the registry
// is generated from the token source — a snippet that carried its own
// list is exactly how kyu came to believe in four dark themes.
//
// A consumer with a bundler imports this and calls applyStoredTheme()
// as early as their bundle runs. A consumer rendering HTML from a server
// inlines the snippet instead, because a module arrives too late to
// prevent the flash it exists to prevent.
//
// Pure since 3.0.0 [KT6]: importing this file does nothing. The first
// version read localStorage and wrote <html data-theme> on import, with
// the key and the attribute as literals in two places — a consumer who
// changed either got a snippet silently reading the wrong one.

import { DEFAULT_THEME, STORAGE_KEY, THEMES } from './theme-registry.js';

/** The attribute the stylesheet keys on. A contract value [TH26]. */
export const THEME_ATTRIBUTE = 'data-theme';

/** The attribute the register keys its reveal start states on [AR34]; the same value as ROOT_ATTRIBUTE in js/effects.js. */
export const EFFECTS_ATTRIBUTE = 'data-kp-effects';

/**
 * The snippet to inline inside <script> in <head>, before the stylesheet
 * link. Plain ES5, no imports, no dependency on this package being loaded.
 *
 * @param {{ key?: string, attribute?: string, effects?: boolean }} [options]
 * @returns {string}
 */
/**
 * A string as a JS literal that is also safe inside a <script> element.
 *
 * `JSON.stringify` escapes for a JS string, not for HTML: the sequence
 * `</script>` inside the literal still closes the element the snippet
 * lives in, and everything after it becomes markup. Escaping `<` as
 * `\\u003c` is the same string to the engine and inert to the parser.
 * The key and the attribute are the consumer's own values, so this is a
 * foot-gun rather than an injection — but the foot is the consumer's.
 *
 * @param {string} value
 * @returns {string}
 */
function jsString(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Where a register is served from, as a pattern with `{theme}` in it
 * [scope-50]. The same default as REGISTER_PATTERN in js/lazy-register.js,
 * kept as a literal here because this file's import closure is vendored
 * as it is (gates/check-closure.mjs).
 */
export const REGISTER_PATTERN_DEFAULT = '/css/{theme}-register.css';

/** @param {string} text */
const attributeText = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {{ key?: string, attribute?: string, effects?: boolean, register?: boolean | { pattern?: string, fallback?: string } }} [options]
 *   register: also write the active theme's register link, for a page that
 *   loads registers lazily (js/lazy-register.js). The snippet then goes
 *   BELOW the css/themes.css link, not above it — see README.md, "Per
 *   theme". Default false: the snippet is byte-for-byte what it was.
 * @returns {string}
 */
export function noFlashSnippet({ key = STORAGE_KEY, attribute = THEME_ATTRIBUTE, effects = false, register = false } = {}) {
    if (register) return registerSnippet({ key, attribute, effects, ...(register === true ? {} : register) });
    // `effects: true` also arms the reveals of js/effects.js before first
    // paint [AR34]: the register keys its start states on the attribute,
    // so a page that will attach the module never paints the rest state
    // first and snaps. A page that never attaches it leaves this off and
    // shows every reveal at rest.
    const arm = effects ? `\n        document.documentElement.setAttribute(${jsString(EFFECTS_ATTRIBUTE)}, '');` : '';
    return `(function () {
    try {
        var t = localStorage.getItem(${jsString(key)});
        if (t) document.documentElement.setAttribute(${jsString(attribute)}, t);${arm}
    } catch (e) {}
})();`;
}

/**
 * The snippet for a page whose registers load lazily [scope-50].
 *
 * The same moment as the plain snippet has a second job: the FIRST
 * register link has to be in the document before first paint, or the page
 * paints its tokens with no register and gets the register a frame (on a
 * slow link, seconds) later. A link appended by script does not block
 * rendering; one written by `document.write` while the parser is in
 * <head> is parser-inserted, and every browser holds the paint for it —
 * the one job `document.write` is still the right tool for.
 *
 * Its place is below the css/themes.css link. The cascade layer order is
 * fixed by whichever stylesheet states it first, and that has to be
 * themes.css: a register written above it would state `kp.register`
 * before `kp.base` and `kp.components` exist, and the components would
 * then beat every register rule. Written below, the register's
 * `@layer kp.register { … }` lands in the layer themes.css gave it, and
 * this snippet never states an order of its own.
 *
 * The name is checked against the generated list before it reaches the
 * URL: a stored name from a newer deployment, or a hand-set attribute,
 * asks for the fallback's register rather than a file that is not there.
 *
 * @param {{ key: string, attribute: string, effects: boolean, pattern?: string, fallback?: string }} options
 * @returns {string}
 */
function registerSnippet({ key, attribute, effects, pattern = REGISTER_PATTERN_DEFAULT, fallback = DEFAULT_THEME }) {
    const names = THEMES.map((t) => t.name);
    if (!names.includes(/** @type {import('./theme-registry.js').ThemeName} */ (fallback)))
        throw new RangeError(`kp-themes: the register fallback "${fallback}" is not a theme`);
    const [before, ...rest] = pattern.split('{theme}');
    const after = rest.join('{theme}');
    const arm = effects ? `\n    d.setAttribute(${jsString(EFFECTS_ATTRIBUTE)}, '');` : '';
    return `(function () {
    var d = document.documentElement;
    try {
        var t = localStorage.getItem(${jsString(key)});
        if (t) d.setAttribute(${jsString(attribute)}, t);
    } catch (e) {}${arm}
    var n = d.getAttribute(${jsString(attribute)});
    if (${JSON.stringify(names).replace(/</g, '\\u003c')}.indexOf(n) < 0) n = ${jsString(fallback)};
    document.write('<link rel="stylesheet" href="' + ${jsString(attributeText(before))} + n + ${jsString(attributeText(after))} + '" data-kp-register="' + n + '" blocking="render">');
})();`;
}

/** The snippet with the defaults, for the common case. */
export const NO_FLASH_SNIPPET = noFlashSnippet();

/**
 * What the snippet does, as a function: copy the stored theme onto the
 * document element. Returns the name applied, or null.
 *
 * @param {{ key?: string, attribute?: string, root?: Element }} [options]
 * @returns {string | null}
 */
export function applyStoredTheme({ key = STORAGE_KEY, attribute = THEME_ATTRIBUTE, root } = {}) {
    if (typeof document === 'undefined') return null;
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        (root ?? document.documentElement).setAttribute(attribute, stored);
        return stored;
    } catch {
        // Blocked storage: the document keeps whatever theme it was served with.
        return null;
    }
}
