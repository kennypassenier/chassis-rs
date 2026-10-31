// One gallery: its pictures and spec, how it draws itself in each state, the busy card, and what it remembers.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { buildGrid, continueBar, fileInput, statePlateBox } from './render.js';
import { Lightbox } from './lightbox.js';

/** @typedef {import('./constants.js').GalleryItem} GalleryItem */
/** @typedef {import('./constants.js').GallerySpec} GallerySpec */

/** A gallery. It lives as long as its element: written by `update()`, never detached. */
export class Gallery extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        this.el = host;
        /** The pictures. @type {GalleryItem[]} */
        this.items = [];
        /** What the page last gave: the items' state, the words, the actions. @type {GallerySpec} */
        this.spec = {};
        /** The busy card laid over a loading gallery. @type {import('../busy-card.js').BusyCard | null} */
        this.card = null;
        /** The reason the add tile is off, else null. @type {string | null} */
        this.uploading = null;
        /** The open lightbox's viewer. @type {import('../viewer.js').ViewerHandle | null} */
        this.viewer = null;
        /** The id of the picture the lightbox shows. @type {string | null} */
        this.openId = null;
    }

    /** The key a gallery remembers its last picture under. */
    rememberKey() {
        const name = this.el.getAttribute('data-kp-remember');
        return name ? `kp-remember:gallery:${name}:last` : null;
    }

    /** The picture this gallery last opened on this device, or null. */
    last() {
        const key = this.rememberKey();
        if (!key) return null;
        try {
            const id = localStorage.getItem(key);
            return id && this.items.some((i) => i.id === id) ? id : null;
        } catch {
            return null;
        }
    }

    /** Take what the page gave. Items given without a state mean the data arrived: ready (or empty), not still loading. @param {GallerySpec} spec */
    remember(spec) {
        if (spec.items && spec.state === undefined) delete this.spec.state;
        if (spec.items && spec.message === undefined) delete this.spec.message;
        this.spec = { ...this.spec, ...spec };
        if (spec.items) this.items = spec.items.map((i) => ({ ...i }));
    }

    /**
     * Write the gallery.
     * @param {GallerySpec} spec
     */
    update(spec) {
        const el = this.el;
        this.remember(spec);
        const state = this.spec.state ?? (this.items.length === 0 ? 'empty' : 'ready');
        const loading = state === 'loading';
        el.classList.add('kp-gallery');
        el.setAttribute('data-kp-gallery', '');
        el.setAttribute('data-kp-state', state);
        el.toggleAttribute('aria-busy', loading);
        if (this.spec.label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', this.spec.label);
        if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
        const keep = this.card?.layer;
        for (const child of [...el.childNodes]) if (child !== keep) child.remove();
        /** @type {Node[]} */
        const body = [];
        const last = this.last();
        if (last && state === 'ready') body.push(continueBar(this, last));
        if (state === 'empty' || state === 'error') {
            body.push(statePlateBox(this, state));
            if (state === 'empty' && this.spec.add) body.push(fileInput(el.ownerDocument, el));
            this.syncCard(false);
            el.append(...body);
            return;
        }
        const grid = buildGrid(this, loading);
        body.push(grid, fileInput(el.ownerDocument, el));
        el.prepend(...body);
        this.syncCard(loading, grid);
    }

    /** The card covers the whole gallery, not the strip of skeleton lines the grid is while it loads [t56-statefix-1018, S10]. @param {boolean} loading @param {HTMLElement} [grid] */
    syncCard(loading, grid) {
        const el = this.el;
        if (loading && grid) {
            if (!this.card)
                this.card = openBusyCard(el, { words: getStrings().galleryLoading, area: () => [el], className: 'kp-gallery__busy', arrive: false });
            else if (this.card.layer.parentElement !== el) el.append(this.card.layer);
            this.card.place();
            return;
        }
        if (this.card) {
            const closing = this.card;
            this.card = null;
            void closing.close();
        }
    }

    /** Mark the add tile off with a reason while an upload runs, or on again with `null`. @param {string | null} reason */
    setUploading(reason) {
        this.uploading = reason;
        const add = /** @type {HTMLButtonElement | null} */ (this.el.querySelector('.kp-gallery__add'));
        if (!add) return;
        add.disabled = reason !== null;
        if (reason) add.setAttribute('data-kp-disabled-reason', reason);
        else add.removeAttribute('data-kp-disabled-reason');
    }

    /** Open a picture in the lightbox. @param {string} id @returns {import('../viewer.js').ViewerHandle | null} */
    openItem(id) {
        if (this.items.findIndex((i) => i.id === id) < 0) return null;
        return new Lightbox(this, id).open();
    }
}
