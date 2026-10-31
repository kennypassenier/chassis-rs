// The lightbox of one opened picture: the viewer shell, previous and next, zoom, the picture's load, and closing.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { openViewer } from '../viewer.js';
import { attachDisabledReasons } from '../reason.js';
import { resolveLocale } from '../locale.js';
import { GALLERY_CLOSE_EVENT, GALLERY_OPEN_EVENT, GALLERY_PICTURE_FAILED_EVENT, PRELOAD_MAX } from './constants.js';
import { again, attr, make } from './dom.js';
import { actionsFor, drawInfo } from './lightbox-info.js';
import { installChrome, installHash, installSwipe } from './lightbox-input.js';

/** @typedef {import('./gallery.js').Gallery} Gallery */

/** One opening of the lightbox. It lives until the viewer closes, and `destroy()` undoes what it wired. */
export class Lightbox extends Controller {
    /** @param {Gallery} gallery @param {string} id the picture to open */
    constructor(gallery, id) {
        super(gallery.el);
        this.gallery = gallery;
        this.el = gallery.el;
        this.id = id;
        this.doc = this.el.ownerDocument;
        this.view = /** @type {Window} */ (this.doc.defaultView);
        this.strings = getStrings();
        this.locale = resolveLocale(undefined, this.el);
        /** The gallery's pictures, shared: a Retry replaces one in place. */
        this.items = gallery.items;
        this.at = gallery.items.findIndex((i) => i.id === id);
        const el = this.el;
        this.loop = attr(el, 'data-kp-lightbox-loop', 'off') === 'on';
        this.preload = Math.max(0, Math.min(PRELOAD_MAX, Number(attr(el, 'data-kp-lightbox-preload', '1'))));
        this.zoomOn = attr(el, 'data-kp-lightbox-zoom', 'on') !== 'off';
        this.chromeMode = attr(el, 'data-kp-lightbox-chrome', 'fade');
        this.infoMode = attr(el, 'data-kp-lightbox-info', 'caption');
        this.hashOn = attr(el, 'data-kp-lightbox-hash', 'on') !== 'off';
        this.prefix = attr(el, 'data-kp-hash-prefix', 'photo');
        this.extraActions = attr(el, 'data-kp-lightbox-actions', '')
            .split(/[\s,]+/)
            .filter(Boolean);
        /** Whether this opening pushed a history entry, and whether the back button closed it. */
        this.pushed = false;
        this.closedByHistory = false;
        this.chromeTimer = 0;
        /** A swipe on a phone while a finger is down: where it started, and whether one runs. */
        this.swipe = { x: 0, y: 0, on: false };
        // The parts below are made in `open()`.
        this.viewer = /** @type {import('../viewer.js').ViewerHandle} */ (/** @type {unknown} */ (null));
        this.picture = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.info = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.figure = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.previous = /** @type {HTMLButtonElement} */ (/** @type {unknown} */ (null));
        this.next = /** @type {HTMLButtonElement} */ (/** @type {unknown} */ (null));
    }

    /** The address of a picture. @param {string} itemId */
    hashOf(itemId) {
        return `#${this.prefix}-${encodeURIComponent(itemId)}`;
    }

    /** The keys the lightbox answers, listed in the `?` sheet. */
    keyBindings() {
        const s = this.strings;
        const group = s.galleryKeyGroup;
        const notVideo = () => this.items[this.at]?.kind !== 'video';
        return [
            { keys: 'ArrowLeft', what: s.galleryKeyPrevious, group, run: () => this.go(-1), when: () => this.canGo(-1) },
            { keys: 'ArrowRight', what: s.galleryKeyNext, group, run: () => this.go(1), when: () => this.canGo(1) },
            { keys: 'Home', what: s.galleryKeyFirst, group, run: () => this.to(0), when: () => this.at > 0 },
            { keys: 'End', what: s.galleryKeyLast, group, run: () => this.to(this.items.length - 1), when: () => this.at < this.items.length - 1 },
            ...(this.zoomOn
                ? [
                      { keys: 'z', what: s.galleryKeyZoom, group, run: () => this.zoom('toggle'), when: notVideo },
                      { keys: '+', what: s.galleryKeyZoomIn, group, run: () => this.zoom('in'), when: notVideo },
                      { keys: '-', what: s.galleryKeyZoomOut, group, run: () => this.zoom('out'), when: notVideo },
                  ]
                : []),
            { keys: 'f', what: s.galleryKeyFull, group, run: () => this.toggleFull() },
        ];
    }

    /** Open the viewer on the picture and wire it. @returns {import('../viewer.js').ViewerHandle} */
    open() {
        const { el, doc, id } = this;
        const opener = el.querySelector(`.kp-gallery__cell[data-id="${CSS.escape(id)}"] .kp-gallery__open`);
        this.viewer = openViewer({
            title: '',
            size: 'full',
            className: 'kp-gallery__lightbox',
            doc,
            opener: opener instanceof HTMLElement ? opener : null,
            keys: this.keyBindings(),
            onClose: () => this.onClose(),
        });
        this.gallery.viewer = this.viewer;
        this.picture = make(doc, 'div', 'kp-gallery__picture');
        this.info = make(doc, 'div', 'kp-gallery__info');
        this.figure = make(doc, 'div', 'kp-gallery__figure');
        this.figure.setAttribute('data-kp-zoom', 'fit');
        this.figure.append(this.picture, this.info);
        this.viewer.setContent(this.figure);
        this.previous = this.addZone('previous', this.strings.galleryPrevious, '‹');
        this.next = this.addZone('next', this.strings.galleryNext, '›');
        // The reason a button is off (the first picture, the last) stands in the package's tooltip.
        attachDisabledReasons(this.viewer.dialog);
        this.previous.addEventListener('click', () => this.go(-1));
        this.next.addEventListener('click', () => this.go(1));
        installChrome(this);
        installSwipe(this);
        installHash(this, id);
        this.show();
        return this.viewer;
    }

    /** The viewer closed: undo the wiring, give the address back, say so, and put the focus on the tile. */
    onClose() {
        const { gallery, el, id, view } = this;
        this.destroy();
        gallery.viewer = null;
        gallery.openId = null;
        if (this.pushed && !this.closedByHistory) {
            // The address goes back to where the page was; the back button had one step for the lightbox.
            try {
                view.history.back();
            } catch {
                // A frame that may not move its history keeps the hash.
            }
        }
        const current = this.items[this.at];
        el.dispatchEvent(new CustomEvent(GALLERY_CLOSE_EVENT, { bubbles: true, detail: { id: current?.id ?? id } }));
        // Focus goes to the tile that was open, scrolled into view if the lightbox moved on.
        const tile = current ? el.querySelector(`.kp-gallery__cell[data-id="${CSS.escape(current.id)}"] .kp-gallery__open`) : null;
        if (tile instanceof HTMLElement) {
            tile.scrollIntoView({ block: 'nearest' });
            tile.focus({ preventScroll: true });
        }
    }

    /** A wide edge zone with its arrow button. @param {'previous' | 'next'} side @param {string} label @param {string} glyph */
    addZone(side, label, glyph) {
        const holder = make(this.doc, 'div', `kp-gallery__zone kp-gallery__zone--${side}`);
        const button = /** @type {HTMLButtonElement} */ (make(this.doc, 'button', `kp-icon-button kp-gallery__nav kp-gallery__nav--${side}`));
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.setAttribute('data-kp-disabled-reason', '');
        button.textContent = glyph;
        holder.append(button);
        this.viewer.stage.append(holder);
        return button;
    }

    /** @param {number} by */
    canGo(by) {
        return this.loop ? this.items.length > 1 : this.at + by >= 0 && this.at + by < this.items.length;
    }

    /** @param {number} by */
    go(by) {
        if (!this.canGo(by)) return;
        this.to((this.at + by + this.items.length) % this.items.length);
    }

    /** @param {number} index */
    to(index) {
        if (index === this.at || index < 0 || index >= this.items.length) return;
        this.at = index;
        this.show();
        if (this.hashOn && this.pushed) {
            try {
                this.view.history.replaceState({ kpGallery: this.items[this.at].id }, '', this.hashOf(this.items[this.at].id));
            } catch {
                // Not every frame may write its address.
            }
        }
    }

    /** @param {'in' | 'out' | 'toggle'} how @param {PointerEvent | MouseEvent} [event] */
    zoom(how, event) {
        const { figure, picture } = this;
        const now = figure.getAttribute('data-kp-zoom') === 'full';
        const want = how === 'toggle' ? !now : how === 'in';
        if (want === now) return;
        figure.setAttribute('data-kp-zoom', want ? 'full' : 'fit');
        if (want && event) {
            // Centre the place that was pressed.
            const img = picture.querySelector('img');
            if (img) {
                const box = img.getBoundingClientRect();
                const px = (event.clientX - box.left) / (box.width || 1);
                const py = (event.clientY - box.top) / (box.height || 1);
                this.view.requestAnimationFrame(() => {
                    picture.scrollLeft = px * picture.scrollWidth - picture.clientWidth / 2;
                    picture.scrollTop = py * picture.scrollHeight - picture.clientHeight / 2;
                });
            }
        } else if (!want) {
            picture.scrollTo(0, 0);
        }
    }

    toggleFull() {
        if (this.doc.fullscreenElement) void this.doc.exitFullscreen();
        else void this.viewer.dialog.requestFullscreen?.();
    }

    /** Remember the picture on this device, when the gallery was told to. @param {string} itemId */
    remember(itemId) {
        const key = this.gallery.rememberKey();
        if (!key) return;
        try {
            localStorage.setItem(key, itemId);
        } catch {
            // No storage: nothing is remembered.
        }
    }

    /** Show the picture at `at`: its title, position, actions, info and the image or video itself. */
    show() {
        const { strings, viewer, picture, items } = this;
        const item = items[this.at];
        this.gallery.openId = item.id;
        this.remember(item.id);
        viewer.setTitle(item.alt || item.caption || strings.galleryPicture);
        viewer.setPosition({ index: this.at + 1, total: items.length });
        viewer.setActions(actionsFor(this, item));
        this.figure.setAttribute('data-kp-zoom', 'fit');
        drawInfo(this, item);
        this.previous.disabled = !this.canGo(-1);
        this.next.disabled = !this.canGo(1);
        this.previous.setAttribute('data-kp-disabled-reason', this.previous.disabled ? strings.galleryFirst : '');
        this.next.setAttribute('data-kp-disabled-reason', this.next.disabled ? strings.galleryLast : '');
        picture.replaceChildren();
        viewer.setState('loading');
        picture.append(item.kind === 'video' ? this.buildVideo(item) : this.buildImage(item));
        // The neighbours' originals are fetched while this one is looked at, so the arrows do not wait.
        for (let d = 1; d <= this.preload; d++) {
            for (const n of [items[this.at + d], items[this.at - d]]) if (n && n.kind !== 'video') new Image().src = n.src;
        }
        this.el.dispatchEvent(new CustomEvent(GALLERY_OPEN_EVENT, { bubbles: true, detail: { id: item.id, item } }));
    }

    /** What happens when the picture of `item` would not load: a plate with Retry in the stage. @param {import('./constants.js').GalleryItem} item */
    failed(item) {
        const { strings, viewer, picture, items } = this;
        if (items[this.at]?.id !== item.id) return;
        picture.replaceChildren();
        this.el.dispatchEvent(new CustomEvent(GALLERY_PICTURE_FAILED_EVENT, { bubbles: true, detail: { id: item.id } }));
        viewer.setState('error', {
            title: strings.galleryPictureFailed,
            message: strings.galleryPictureFailedText,
            retry: () => {
                items[this.at] = { ...item, src: again(item.src) };
                this.show();
            },
        });
    }

    /** @param {import('./constants.js').GalleryItem} item */
    buildVideo(item) {
        const video = /** @type {HTMLVideoElement} */ (make(this.doc, 'video', 'kp-gallery__video'));
        video.controls = true;
        video.setAttribute('playsinline', '');
        video.preload = 'metadata';
        if (item.poster) video.poster = item.poster;
        video.setAttribute('aria-label', item.alt || item.caption || this.strings.galleryPicture);
        video.addEventListener('loadedmetadata', () => this.items[this.at]?.id === item.id && this.viewer.setState('ready'));
        video.addEventListener('error', () => this.failed(item));
        video.src = item.src;
        return video;
    }

    /** @param {import('./constants.js').GalleryItem} item */
    buildImage(item) {
        const img = /** @type {HTMLImageElement} */ (make(this.doc, 'img', 'kp-gallery__image'));
        img.alt = item.alt || item.caption || '';
        img.addEventListener('load', () => this.items[this.at]?.id === item.id && this.viewer.setState('ready'));
        img.addEventListener('error', () => this.failed(item));
        img.src = item.src;
        if (this.zoomOn) img.addEventListener('dblclick', (event) => this.zoom('toggle', event));
        return img;
    }
}
