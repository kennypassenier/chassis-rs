// Making sure a register is in the document: one RegisterLoad per fetch, so a register is fetched once.

import { getStrings } from '../strings.js';
import { REGISTER_ATTRIBUTE, REGISTER_ERROR_EVENT, REGISTER_LOAD_EVENT, REGISTER_PATTERN } from './values.js';
import { hasLoaded, registerHref, registerLink, stateOf } from './links.js';

/** @typedef {import('../lazy-register.js').LazyRegisterOptions} LazyRegisterOptions */

/** One register's load: the link (reused or made), the promise that settles with it, and the insertion into <head>. */
class RegisterLoad {
    /**
     * @param {string} theme
     * @param {string} href
     * @param {Document} doc
     * @param {HTMLLinkElement | null} existing a link already in the document that serves this register
     */
    constructor(theme, href, doc, existing) {
        this.theme = theme;
        this.href = href;
        this.doc = doc;
        this.existing = existing;
        this.link = existing ?? doc.createElement('link');
        this.state = stateOf(doc);
    }

    /** The promise that settles when the link has loaded or failed; the listeners are on the link before it returns. @returns {Promise<HTMLLinkElement>} */
    start() {
        return new Promise((resolve, reject) => {
            if (this.existing && hasLoaded(this.existing)) {
                this.state.loaded.add(this.href);
                resolve(this.existing);
                return;
            }
            this.link.addEventListener('load', () => this.onLoad(resolve), { once: true });
            this.link.addEventListener('error', () => this.onError(reject), { once: true });
        });
    }

    /** @param {(link: HTMLLinkElement) => void} resolve */
    onLoad(resolve) {
        this.state.loaded.add(this.href);
        this.emit(REGISTER_LOAD_EVENT);
        resolve(this.link);
    }

    /** A failed load is forgotten and its link removed, so the next call tries again. @param {(error: Error) => void} reject */
    onError(reject) {
        this.state.loads.delete(this.href);
        if (!this.existing) this.link.remove();
        this.emit(REGISTER_ERROR_EVENT);
        reject(new Error(getStrings().registerLoadFailed(this.theme, this.link.href)));
    }

    /** @param {string} type */
    emit(type) {
        this.doc.documentElement.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { theme: this.theme, href: this.link.href } }));
    }

    /** Put a link of our own into <head>; a link already there is left alone. */
    insert() {
        if (this.existing) return;
        const { link } = this;
        link.rel = 'stylesheet';
        link.href = this.href;
        link.setAttribute(REGISTER_ATTRIBUTE, this.theme);
        // A browser that honours blocking=render on a script-inserted link
        // holds the paint for it; one that does not ignores the attribute.
        link.setAttribute('blocking', 'render');
        // Appended to <head>, which is after css/themes.css on any page
        // that links it there: the layer order is already stated, and this
        // register lands in `kp.register` [scope-50].
        this.doc.head.append(link);
    }
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
    const { loads } = stateOf(doc);
    const href = registerHref(theme, { pattern, doc });
    const known = loads.get(href);
    if (known) return known;
    const load = new RegisterLoad(theme, href, doc, registerLink(theme, { pattern, doc }));
    const promise = load.start();
    loads.set(href, promise);
    load.insert();
    return promise;
}
