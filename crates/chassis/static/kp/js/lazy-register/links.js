// A register's URL, the link that serves it, whether it has loaded, and the per-document record of loads.

import { REGISTER_ATTRIBUTE, REGISTER_PATTERN } from './values.js';

/** @typedef {import('../lazy-register.js').LazyRegisterOptions} LazyRegisterOptions */

/**
 * Loads by resolved URL, per document: the same theme under two patterns
 * is two files, and a test page with two documents is two sets.
 *
 * @type {WeakMap<Document, Map<string, Promise<HTMLLinkElement>>>}
 */
const loadsByDocument = new WeakMap();
/** @type {WeakMap<Document, Set<string>>} */
const loadedByDocument = new WeakMap();

/**
 * The loads started and the URLs loaded in a document.
 * @param {Document} doc
 * @returns {{ loads: Map<string, Promise<HTMLLinkElement>>, loaded: Set<string> }}
 */
export function stateOf(doc) {
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
export function hasLoaded(link) {
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
