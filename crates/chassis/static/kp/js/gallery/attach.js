// The calls a page makes on a gallery: write it, read its pictures, open one, and attach it.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { GALLERY } from './constants.js';
import { attr } from './dom.js';
import { Gallery } from './gallery.js';

/** The gallery of an element, made on first need. @param {HTMLElement} el */
const galleryOf = (el) => controllerOf(el, Gallery) ?? attachOne(el, Gallery);

/** The pictures of a gallery. @param {Element} el */
export function galleryItems(el) {
    return (controllerOf(/** @type {HTMLElement} */ (el), Gallery)?.items ?? []).map((item) => ({ ...item }));
}

/** The picture a gallery last opened on this device, or null (a gallery nobody wrote holds no pictures to continue to). @param {Element} el */
export function galleryLast(el) {
    return controllerOf(/** @type {HTMLElement} */ (el), Gallery)?.last() ?? null;
}

/**
 * Write a gallery.
 * @param {HTMLElement} el
 * @param {import('./constants.js').GallerySpec} spec
 */
export function setGallery(el, spec) {
    galleryOf(el)?.update(spec);
}

/**
 * Mark the add tile off with a reason while an upload runs, or on again with `null`.
 * @param {HTMLElement} el @param {string | null} reason
 */
export function setGalleryUploading(el, reason) {
    controllerOf(el, Gallery)?.setUploading(reason);
}

/**
 * Open a picture in the lightbox.
 * @param {HTMLElement} el @param {string} id
 * @returns {import('../viewer.js').ViewerHandle | null}
 */
export function openGalleryItem(el, id) {
    return controllerOf(el, Gallery)?.openItem(id) ?? null;
}

/**
 * Wire every gallery under `root`: the hash the page opened with opens its picture.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachGalleries(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const el of hostsOf(root, GALLERY)) {
        if (el.dataset.kpGalleryAttached !== undefined) continue;
        el.dataset.kpGalleryAttached = '';
        if (!controllerOf(el, Gallery)) setGallery(el, { state: /** @type {any} */ (el.getAttribute('data-kp-state') ?? 'loading') });
        cleanups.push(() => {
            controllerOf(el, Gallery)?.viewer?.close();
            delete el.dataset.kpGalleryAttached;
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}

/**
 * Open the picture the address names, if this gallery holds it (call after the items are set).
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function openGalleryFromHash(el) {
    const prefix = attr(el, 'data-kp-hash-prefix', 'photo');
    const hash = el.ownerDocument.defaultView?.location.hash ?? '';
    const match = new RegExp(`^#${prefix}-(.+)$`).exec(hash);
    if (!match) return false;
    let id = match[1];
    try {
        id = decodeURIComponent(id);
    } catch {
        // Use it as written.
    }
    return openGalleryItem(el, id) !== null;
}
