// The register of the active theme, fetched when it is needed [scope-50].
//
// A page that links every register pays for twenty-one it does not wear:
// measured on examples/index.html (research/loading/README.md), 1,320,113
// bytes of CSS on first load against 371,900 for the shared stylesheets
// plus one register. This module is the other route, and it is opt-in: a
// page that links all the registers, or the bundle, never imports it and
// behaves exactly as before.
//
// The shared stylesheets (fonts, themes.css, components.css, layout.css,
// utilities.css) are linked as always. The register — the one file that
// differs per theme — is a <link> this module inserts for the theme the
// root wears, and again when the theme changes. It is kept once fetched:
// every rule in a register is scoped to [data-theme='name'], so a register
// whose theme is not worn is inert, and switching back costs nothing.
//
// Every register is wrapped in `@layer kp.register { … }` by its author,
// and the layer ORDER is fixed by the first statement of css/themes.css,
// so a register that arrives later lands in the layer that statement gave
// it: layout and utilities keep beating it, components keep losing to it.
//
// Two contracts come with it, both in README.md under "Per theme":
//
//   1. The first register is not this module's to insert. By the time a
//      module runs the page has painted, so the no-flash snippet writes
//      the first link — `noFlashSnippet({ register: true })` from
//      js/no-flash.js, inlined BELOW the themes.css link. This module
//      finds that link and adopts it.
//   2. A change is HELD until its register has loaded. Tokens without
//      their register are a theme that is not that theme, so the root
//      keeps the previous theme meanwhile: `applyTheme()` returns the
//      previous name, `pendingTheme()` from js/theme-core.js names the one
//      on its way, and the change lands — with its `kp-theme-change` —
//      the moment the file has. A later choice supersedes a held one.
//
// Pure, like every module but js/auto.js: importing it does nothing.

import { applyTheme, BEFORE_THEME_EVENT, currentTheme, onThemeChange, PENDING_THEME_ATTRIBUTE } from './theme-core.js';
import { getStrings } from './strings.js';

/** The attribute a register link carries, with the theme it serves as its value. A contract value. */
export const REGISTER_ATTRIBUTE = 'data-kp-register';
/** Where a register is served from by default; `{theme}` is replaced by the name. */
export const REGISTER_PATTERN = '/css/{theme}-register.css';
/** Dispatched on the root, bubbling, when a register has loaded: `{ theme, href }`. */
export const REGISTER_LOAD_EVENT = 'kp-register-load';
/** Dispatched on the root, bubbling, when a register failed to load: `{ theme, href }`. The theme stays what it was. */
export const REGISTER_ERROR_EVENT = 'kp-register-error';

/**
 * @typedef {object} LazyRegisterOptions
 * @property {string} [pattern] where a register is served from, with `{theme}` in it (default REGISTER_PATTERN)
 * @property {Document} [doc] the document to insert into (default: the current one)
 */

/**
 * Loads by resolved URL, per document: the same theme under two patterns
 * is two files, and a test page with two documents is two sets.
 *
 * @type {WeakMap<Document, Map<string, Promise<HTMLLinkElement>>>}
 */
const loadsByDocument = new WeakMap();
/** @type {WeakMap<Document, Set<string>>} */
const loadedByDocument = new WeakMap();

/** @param {Document} doc */
function stateOf(doc) {
    let loads = loadsByDocument.get(doc);
    let loaded = loadedByDocument.get(doc);
    if (!loads) loadsByDocument.set(doc, (loads = new Map()));
    if (!loaded) loadedByDocument.set(doc, (loaded = new Set()));
    return { loads, loaded };
}

/**
 * The URL of a theme's register.
 *
 * @param {string} theme
 * @param {{ pattern?: string, doc?: Document }} [options]
 * @returns {string} absolute, resolved against the document
 */
export function registerHref(theme, { pattern = REGISTER_PATTERN, doc = document } = {}) {
    return new URL(pattern.split('{theme}').join(theme), doc.baseURI).href;
}

/**
 * The link in the document that serves `theme`'s register: one carrying
 * REGISTER_ATTRIBUTE for it, or else a plain stylesheet link at its URL.
 *
 * @param {string} theme
 * @param {LazyRegisterOptions} [options]
 * @returns {HTMLLinkElement | null}
 */
export function registerLink(theme, { pattern = REGISTER_PATTERN, doc = document } = {}) {
    const href = registerHref(theme, { pattern, doc });
    for (const link of doc.querySelectorAll('link[rel~="stylesheet"]')) {
        const el = /** @type {HTMLLinkElement} */ (link);
        if (el.getAttribute(REGISTER_ATTRIBUTE) === theme || el.href === href) return el;
    }
    return null;
}

/**
 * The themes whose register links are in the document, in document order.
 *
 * @param {Document} [doc]
 * @returns {string[]}
 */
export function registersPresent(doc = document) {
    return [...doc.querySelectorAll(`link[${REGISTER_ATTRIBUTE}]`)].map((l) => l.getAttribute(REGISTER_ATTRIBUTE) ?? '');
}

/**
 * Whether a link's stylesheet has finished loading. A sheet object can
 * exist while the file is still on its way; reading its rules throws
 * until it has arrived (same-origin), and the resource log has an entry
 * once it has (either origin).
 *
 * @param {HTMLLinkElement} link
 */
function hasLoaded(link) {
    if (!link.sheet) return false;
    try {
        void link.sheet.cssRules;
        return true;
    } catch {
        return typeof performance !== 'undefined' && performance.getEntriesByName(link.href).length > 0;
    }
}

/**
 * Whether `theme`'s register is in the document and has loaded.
 *
 * @param {string} theme
 * @param {LazyRegisterOptions} [options]
 */
export function registerLoaded(theme, { pattern = REGISTER_PATTERN, doc = document } = {}) {
    if (stateOf(doc).loaded.has(registerHref(theme, { pattern, doc }))) return true;
    const link = registerLink(theme, { pattern, doc });
    return link !== null && hasLoaded(link);
}

/**
 * Make sure `theme`'s register is in the document, and resolve when it has
 * loaded. A link already there — the no-flash snippet's, a hand-written
 * one, an earlier call's — is reused, so a register is fetched once. A
 * failed load is forgotten and its link removed, so the next call tries
 * again.
 *
 * @param {string} theme
 * @param {LazyRegisterOptions} [options]
 * @returns {Promise<HTMLLinkElement>}
 */
export function ensureRegister(theme, { pattern = REGISTER_PATTERN, doc = document } = {}) {
    const { loads, loaded } = stateOf(doc);
    const href = registerHref(theme, { pattern, doc });
    const known = loads.get(href);
    if (known) return known;

    const existing = registerLink(theme, { pattern, doc });
    const link = existing ?? doc.createElement('link');
    const root = doc.documentElement;

    /** @type {Promise<HTMLLinkElement>} */
    const promise = new Promise((resolve, reject) => {
        if (existing && hasLoaded(existing)) {
            loaded.add(href);
            resolve(existing);
            return;
        }
        link.addEventListener(
            'load',
            () => {
                loaded.add(href);
                root.dispatchEvent(new CustomEvent(REGISTER_LOAD_EVENT, { bubbles: true, detail: { theme, href: link.href } }));
                resolve(link);
            },
            { once: true },
        );
        link.addEventListener(
            'error',
            () => {
                loads.delete(href);
                if (!existing) link.remove();
                root.dispatchEvent(new CustomEvent(REGISTER_ERROR_EVENT, { bubbles: true, detail: { theme, href: link.href } }));
                reject(new Error(getStrings().registerLoadFailed(theme, link.href)));
            },
            { once: true },
        );
    });
    loads.set(href, promise);

    if (!existing) {
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute(REGISTER_ATTRIBUTE, theme);
        // A browser that honours blocking=render on a script-inserted link
        // holds the paint for it; one that does not ignores the attribute.
        link.setAttribute('blocking', 'render');
        // Appended to <head>, which is after css/themes.css on any page
        // that links it there: the layer order is already stated, and this
        // register lands in `kp.register` [scope-50].
        doc.head.append(link);
    }
    return promise;
}

/**
 * Keep the document's registers in step with its theme.
 *
 * @param {{ pattern?: string, hold?: boolean, prune?: boolean, root?: Element }} [options]
 *   pattern: where a register is served from, with `{theme}` in it (default REGISTER_PATTERN) —
 *     the same value the no-flash snippet was given;
 *   hold: keep a change back until its register has loaded (default true). Off, the root flips at
 *     once and wears the new tokens without their register until the file lands;
 *   prune: remove the previous theme's register after a change (default false: kept, so that
 *     switching back fetches nothing);
 *   root: the element that wears the theme (default: theme-core's root).
 * @returns {() => void} detach: stop following theme changes and drop a held change; links already inserted stay
 */
export function attachLazyRegisters({ pattern = REGISTER_PATTERN, hold = true, prune = false, root } = {}) {
    if (typeof document === 'undefined') return () => {};
    const doc = root?.ownerDocument ?? document;
    // The listener sits on `root` (default: the document element) and acts
    // on the element that wears the theme, which is the event's target: a
    // root set with configureTheme() below it bubbles its events up here.
    const html = root ?? doc.documentElement;
    const options = { pattern, doc };
    /** @param {unknown} error */
    const report = (error) => console.error(error instanceof Error ? error.message : error);

    // Before a change: when the new register is not here yet, refuse the
    // change, mark it held, fetch, then ask again. The second ask finds the
    // register loaded and goes through, so the root never wears a theme
    // ahead of its register. A choice made in the meantime removes the
    // mark (applyTheme does), and the stale load then applies nothing.
    /** @param {Event} e */
    const onBefore = (e) => {
        // Refused by someone else already: nothing to hold.
        if (!hold || e.defaultPrevented) return;
        const { theme } = /** @type {CustomEvent<{ theme: string }>} */ (e).detail;
        if (registerLoaded(theme, options)) return;
        const element = /** @type {Element} */ (e.target);
        e.preventDefault();
        element.setAttribute(PENDING_THEME_ATTRIBUTE, theme);
        ensureRegister(theme, options).then(
            () => {
                if (element.getAttribute(PENDING_THEME_ATTRIBUTE) !== theme) return;
                applyTheme(theme, { root: element });
            },
            (error) => {
                if (element.getAttribute(PENDING_THEME_ATTRIBUTE) === theme) element.removeAttribute(PENDING_THEME_ATTRIBUTE);
                report(error);
            },
        );
    };
    html.addEventListener(BEFORE_THEME_EVENT, onBefore);

    const unsubscribe = onThemeChange(
        (theme, { previous }) => {
            ensureRegister(theme, options).catch(report);
            if (prune && previous && previous !== theme) {
                const link = registerLink(previous, options);
                if (link) {
                    link.remove();
                    const href = registerHref(previous, options);
                    stateOf(doc).loads.delete(href);
                    stateOf(doc).loaded.delete(href);
                }
            }
        },
        { root: html },
    );

    // The theme worn now: normally the snippet's link is already there and
    // this adopts it; without the snippet it is fetched here, late.
    ensureRegister(currentTheme({ root: html }), options).catch(report);

    return () => {
        html.removeEventListener(BEFORE_THEME_EVENT, onBefore);
        // A held change is dropped rather than left to land after detach.
        for (const el of [html, ...html.querySelectorAll(`[${PENDING_THEME_ATTRIBUTE}]`)]) el.removeAttribute(PENDING_THEME_ATTRIBUTE);
        unsubscribe();
    };
}
