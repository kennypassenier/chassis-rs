// A grid of pictures that open large [kpadopt6-media; kp-soft's Hangmaten photo gallery].
//
// A grid of thumbnails; a press opens the picture large in the viewer shell (js/viewer.js) with previous and next, also for video;
// a picture that fails to load is replaced by a proper state, never a broken icon. Kenny, 2026-10-17: "stoppen is default,
// doorgaan een optie": at the last picture the arrow stops (the end is the end); `data-kp-lightbox-loop="on"` wraps round.
//
//   <div class="kp-gallery" data-kp-gallery aria-label="Photos"></div>
//   setGallery(el, { items: [{ id: '12', src, thumb, width, height, alt, caption, kind: 'image', uploader, at }] });
//
// Items (the fields kp-soft's `Photo` already carries): `{ id, src, thumb, width, height, alt, caption, kind: 'image' | 'video', poster,
// uploader, at (ms), bytes }`. Options (markup on the gallery, each with a default [KT6]; the same names are the options of `setGallery`):
//   data-kp-grid-columns       auto | 2 to 8                                              auto (tiles of at least 9rem: two columns at 390 px)
//   data-kp-tile-shape         square | ratio: each picture keeps its own ratio in rows    square
//   data-kp-caption            hover | always | none                                      hover on a pointer, always on touch
//   data-kp-lightbox-loop      on | off                                                   off
//   data-kp-lightbox-preload   0 | 1 | 2: originals fetched beside the open one           1
//   data-kp-lightbox-zoom      on | off: a double press or `z` zooms to 100 %             on
//   data-kp-lightbox-chrome    fade | always: the controls fade after 3 s without movement  fade (never when calm)
//   data-kp-lightbox-info      off | caption | details: caption, uploader and date, then size   caption
//   data-kp-lightbox-actions   open download copy-link: more buttons in the foot            none
//   data-kp-lightbox-hash      on | off: the address carries the open picture (#photo-12)  on
//   data-kp-hash-prefix        the word before the id in the address                       photo
//   data-kp-lazy               on | off: lazy pictures with a box reserved from width and height   on
//   data-kp-remember           a name: the last opened picture is kept, with "Continue where you were"
//
// Keys while the lightbox is open (the shortcut engine, listed in the `?` sheet; none needs AltGr): Left and Right, Home and End,
// `z` zoom, `+` and `-`, `f` full screen. Escape closes. Phone: the lightbox is the whole screen, previous and next are wide edge zones
// and a swipe, a swipe down closes. The position is an exact count ("4 of 37") announced politely. Actions per picture come from
// `setGallery(el, { actions: (item) => [{ label, tone, run, confirm }] })`. States: loading (the busy card over the whole gallery), empty and
// failed (the package's plates over the whole footprint), a picture that fails (its tile and the stage become a plate with Retry).
// Events: `kp-gallery-open` `{ id, item }`, `kp-gallery-close`, `kp-gallery-retry` (the failed list), `kp-gallery-add` `{ files }`,
// `kp-gallery-picture-failed` `{ id }`. Nothing runs on import.

import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';
import { openViewer } from './viewer.js';
import { motionAllowed } from './calm.js';
import { agoMoment } from './freshness.js';
import { formatBytes, resolveLocale } from './locale.js';
import { openConfirmation } from './components.js';
import { attachDisabledReasons } from './reason.js';

/** A gallery. */
export const GALLERY = '[data-kp-gallery]';
/** Fired on the gallery when a picture was opened: `{ id, item }`. */
export const GALLERY_OPEN_EVENT = 'kp-gallery-open';
/** Fired on the gallery when the lightbox closed: `{ id }`. */
export const GALLERY_CLOSE_EVENT = 'kp-gallery-close';
/** Fired on the gallery when the Retry of a failed list was pressed. */
export const GALLERY_RETRY_EVENT = 'kp-gallery-retry';
/** Fired on the gallery when pictures were chosen to add: `{ files }`. */
export const GALLERY_ADD_EVENT = 'kp-gallery-add';
/** The states a gallery can be in. */
export const GALLERY_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** How long the controls stay before they fade, in ms. */
export const GALLERY_CHROME_MS = 3000;
/** The most a swipe has to travel sideways to step, in px. */
const SWIPE = 56;

/**
 * @typedef {object} GalleryItem
 * @property {string} id
 * @property {string} src the original
 * @property {string} [thumb] the small one (default the original)
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [alt]
 * @property {string} [caption]
 * @property {'image' | 'video'} [kind]
 * @property {string} [poster] a video's still
 * @property {string} [uploader]
 * @property {number} [at] when it was added, in ms
 * @property {number} [bytes]
 */

/**
 * @typedef {object} GalleryAction
 * @property {string} label
 * @property {'destructive' | 'default'} [tone]
 * @property {() => void} run
 * @property {string} [confirm] a question: the package's confirmation dialog asks it first
 */

/**
 * @typedef {object} GallerySpec
 * @property {readonly GalleryItem[]} [items]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message] the words of the empty and failed plates
 * @property {string} [label]
 * @property {(item: GalleryItem) => readonly GalleryAction[]} [actions]
 * @property {boolean} [add] show the Add pictures tile (the gallery fires `kp-gallery-add`)
 * @property {number} [skeleton] how many waiting tiles a loading gallery shows (default 8)
 */

/**
 * @typedef {object} Memory
 * @property {GalleryItem[]} items
 * @property {GallerySpec} spec
 * @property {import('./busy-card.js').BusyCard | null} card
 * @property {string | null} uploading the reason the add tile is off, else null
 * @property {import('./viewer.js').ViewerHandle | null} viewer
 * @property {string | null} openId
 */

/** @type {WeakMap<Element, Memory>} */
const MEMORY = new WeakMap();

/** @param {Document} doc @param {string} tag @param {string} cls */
const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};

/** @param {Element} el @param {string} name @param {string} fallback */
const attr = (el, name, fallback) => el.getAttribute(name) ?? fallback;

/** The pictures of a gallery. @param {Element} el */
export function galleryItems(el) {
    return (MEMORY.get(el)?.items ?? []).map((item) => ({ ...item }));
}

/** The key a gallery remembers its last picture under. @param {Element} el */
const rememberKey = (el) => {
    const name = el.getAttribute('data-kp-remember');
    return name ? `kp-remember:gallery:${name}:last` : null;
};

/** The picture a gallery last opened on this device, or null. @param {Element} el */
export function galleryLast(el) {
    const key = rememberKey(el);
    if (!key) return null;
    try {
        const id = localStorage.getItem(key);
        return id && (MEMORY.get(el)?.items ?? []).some((i) => i.id === id) ? id : null;
    } catch {
        return null;
    }
}

/** A thumbnail address that asks again (past a cached failure). @param {string} url */
const again = (url) => `${url}${url.includes('?') ? '&' : '?'}kp-retry=${Date.now()}`;

/**
 * Write a gallery.
 * @param {HTMLElement} el
 * @param {GallerySpec} spec
 */
export function setGallery(el, spec) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    let memory = MEMORY.get(el);
    if (!memory) {
        memory = { items: [], spec: {}, card: null, uploading: null, viewer: null, openId: null };
        MEMORY.set(el, memory);
    }
    // Items given without a state mean the data arrived: the gallery is ready (or empty), not still loading.
    if (spec.items && spec.state === undefined) delete memory.spec.state;
    if (spec.items && spec.message === undefined) delete memory.spec.message;
    memory.spec = { ...memory.spec, ...spec };
    if (spec.items) memory.items = spec.items.map((i) => ({ ...i }));
    const state = memory.spec.state ?? (memory.items.length === 0 ? 'empty' : 'ready');
    const items = memory.items;
    const loading = state === 'loading';

    el.classList.add('kp-gallery');
    el.setAttribute('data-kp-gallery', '');
    el.setAttribute('data-kp-state', state);
    el.toggleAttribute('aria-busy', loading);
    if (memory.spec.label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', memory.spec.label);
    if (!el.hasAttribute('role')) el.setAttribute('role', 'region');

    const keep = memory.card?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();

    /** @type {Node[]} */
    const body = [];

    // "Continue where you were".
    const last = galleryLast(el);
    if (last && state === 'ready') {
        const bar = make(doc, 'div', 'kp-gallery__bar');
        const go = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-gallery__continue'));
        go.type = 'button';
        go.textContent = strings.galleryContinue;
        go.addEventListener('click', () => openGalleryItem(el, last));
        bar.append(go);
        body.push(bar);
    }

    if (state === 'empty' || state === 'error') {
        const box = make(doc, 'div', 'kp-gallery__state');
        const isError = state === 'error';
        const canAdd = !isError && memory.spec.add;
        const plate = statePlate(doc, {
            kind: isError ? 'error' : 'empty',
            title: memory.spec.message ?? (isError ? strings.galleryFailed : strings.galleryEmpty),
            text: isError ? strings.galleryFailedText : canAdd ? strings.galleryEmptyAdd : strings.galleryEmptyText,
            ...(isError
                ? { actionLabel: strings.galleryRetry, onAction: () => el.dispatchEvent(new CustomEvent(GALLERY_RETRY_EVENT, { bubbles: true })) }
                : canAdd
                  ? { actionLabel: strings.galleryAdd, onAction: () => /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-gallery__file'))?.click() }
                  : {}),
        });
        box.append(plate);
        body.push(box);
        if (canAdd) body.push(fileInput(doc, el));
        syncCard(el, memory, false);
        el.append(...body);
        return;
    }

    const grid = make(doc, 'ul', 'kp-gallery__grid');
    grid.setAttribute('role', 'list');
    const columns = attr(el, 'data-kp-grid-columns', 'auto');
    if (/^[2-8]$/.test(columns)) {
        el.style.setProperty('--kp-gallery-columns', columns);
        el.setAttribute('data-kp-grid-fixed', '');
    } else {
        el.style.removeProperty('--kp-gallery-columns');
        el.removeAttribute('data-kp-grid-fixed');
    }
    grid.setAttribute('data-kp-tile-shape', attr(el, 'data-kp-tile-shape', 'square'));

    if (memory.spec.add && !loading) {
        const cell = make(doc, 'li', 'kp-gallery__cell kp-gallery__cell--add');
        const add = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-gallery__add'));
        add.type = 'button';
        const plus = make(doc, 'span', 'kp-gallery__add-mark');
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+';
        const label = make(doc, 'span', 'kp-gallery__add-label');
        label.textContent = strings.galleryAdd;
        add.append(plus, label);
        if (memory.uploading) {
            add.disabled = true;
            add.setAttribute('data-kp-disabled-reason', memory.uploading);
        }
        add.addEventListener('click', () => /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-gallery__file'))?.click());
        cell.append(add);
        grid.append(cell);
    }

    if (loading) {
        const count = Math.max(1, memory.spec.skeleton ?? 8);
        for (let i = 0; i < count; i++) {
            const cell = make(doc, 'li', 'kp-gallery__cell');
            const tile = make(doc, 'div', 'kp-gallery__tile kp-skeleton');
            tile.setAttribute('aria-hidden', 'true');
            cell.append(tile);
            grid.append(cell);
        }
    } else {
        for (const item of items) grid.append(tileFor(doc, el, item));
    }
    body.push(grid);
    body.push(fileInput(doc, el));
    el.prepend(...body);
    syncCard(el, memory, loading, grid);
}

/** @param {HTMLElement} el @param {Memory} memory @param {boolean} loading @param {HTMLElement} [grid] */
function syncCard(el, memory, loading, grid) {
    // The card covers the whole gallery, not the strip of skeleton lines the grid is while it loads [t56-statefix-1018, S10].
    if (loading && grid) {
        if (!memory.card) memory.card = openBusyCard(el, { words: getStrings().galleryLoading, area: () => [el], className: 'kp-gallery__busy', arrive: false });
        else if (memory.card.layer.parentElement !== el) el.append(memory.card.layer);
        memory.card.place();
        return;
    }
    if (memory.card) {
        const closing = memory.card;
        memory.card = null;
        void closing.close();
    }
}

/** @param {Document} doc @param {HTMLElement} el */
function fileInput(doc, el) {
    const input = /** @type {HTMLInputElement} */ (make(doc, 'input', 'kp-gallery__file'));
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    input.hidden = true;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.addEventListener('change', () => {
        const files = [...(input.files ?? [])];
        input.value = '';
        if (files.length > 0) el.dispatchEvent(new CustomEvent(GALLERY_ADD_EVENT, { bubbles: true, detail: { files } }));
    });
    return input;
}

/** The tile of one picture. @param {Document} doc @param {HTMLElement} el @param {GalleryItem} item */
function tileFor(doc, el, item) {
    const strings = getStrings();
    const cell = make(doc, 'li', 'kp-gallery__cell');
    cell.setAttribute('data-id', item.id);
    const tile = make(doc, 'div', 'kp-gallery__tile');
    if (item.width && item.height) {
        cell.style.setProperty('--kp-gallery-ratio', `${item.width} / ${item.height}`);
        cell.style.setProperty('--kp-gallery-ratio-num', String(Math.round((item.width / item.height) * 100) / 100));
    }
    const open = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-gallery__open'));
    open.type = 'button';
    const name = item.alt || item.caption || strings.galleryPicture;
    open.setAttribute('aria-label', item.kind === 'video' ? strings.galleryOpenVideo(name) : strings.galleryOpenPicture(name));
    const img = /** @type {HTMLImageElement} */ (make(doc, 'img', 'kp-gallery__thumb'));
    img.alt = '';
    img.decoding = 'async';
    if (attr(el, 'data-kp-lazy', 'on') !== 'off') img.loading = 'lazy';
    if (item.width) img.width = item.width;
    if (item.height) img.height = item.height;
    img.src = item.thumb ?? item.poster ?? item.src;
    img.addEventListener('error', () => failTile(doc, el, cell, tile, item, img));
    open.append(img);
    if (item.kind === 'video') {
        const play = make(doc, 'span', 'kp-gallery__play');
        play.setAttribute('aria-hidden', 'true');
        open.append(play);
    }
    const captionMode = attr(el, 'data-kp-caption', 'hover');
    const words = item.uploader || item.caption;
    if (captionMode !== 'none' && words) {
        const caption = make(doc, 'span', 'kp-gallery__caption');
        caption.textContent = words;
        open.append(caption);
    }
    open.addEventListener('click', () => openGalleryItem(el, item.id));
    tile.append(open);
    cell.append(tile);
    return cell;
}

/** A tile whose picture would not load: a state tile of the same size, with Retry. @param {Document} doc @param {HTMLElement} el @param {HTMLElement} cell @param {HTMLElement} tile @param {GalleryItem} item @param {HTMLImageElement} img */
function failTile(doc, el, cell, tile, item, img) {
    const strings = getStrings();
    tile.setAttribute('data-kp-state', 'error');
    const plate = make(doc, 'div', 'kp-gallery__fail');
    plate.setAttribute('role', 'group');
    const mark = make(doc, 'span', 'kp-gallery__fail-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '!';
    const text = make(doc, 'span', 'kp-gallery__fail-text');
    text.textContent = strings.galleryPictureFailed;
    const retry = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-gallery__fail-retry'));
    retry.type = 'button';
    retry.textContent = strings.galleryRetry;
    retry.setAttribute('aria-label', strings.galleryRetryPicture(item.alt || item.caption || strings.galleryPicture));
    retry.addEventListener('click', () => {
        // Back to a picture, asked for again.
        const fresh = tileFor(doc, el, { ...item, thumb: again(item.thumb ?? item.poster ?? item.src) });
        cell.replaceWith(fresh);
        /** @type {HTMLElement | null} */ (fresh.querySelector('.kp-gallery__open'))?.focus({ preventScroll: true });
    });
    plate.append(mark, text, retry);
    tile.replaceChildren(plate);
    void img;
    el.dispatchEvent(new CustomEvent('kp-gallery-picture-failed', { bubbles: true, detail: { id: item.id } }));
}

/**
 * Mark the add tile off with a reason while an upload runs, or on again with `null`.
 * @param {HTMLElement} el @param {string | null} reason
 */
export function setGalleryUploading(el, reason) {
    const memory = MEMORY.get(el);
    if (!memory) return;
    memory.uploading = reason;
    const add = /** @type {HTMLButtonElement | null} */ (el.querySelector('.kp-gallery__add'));
    if (!add) return;
    add.disabled = reason !== null;
    if (reason) add.setAttribute('data-kp-disabled-reason', reason);
    else add.removeAttribute('data-kp-disabled-reason');
}

/**
 * Open a picture in the lightbox.
 * @param {HTMLElement} el @param {string} id
 * @returns {import('./viewer.js').ViewerHandle | null}
 */
export function openGalleryItem(el, id) {
    const memory = MEMORY.get(el);
    if (!memory) return null;
    const doc = el.ownerDocument;
    const view = /** @type {Window} */ (doc.defaultView);
    const strings = getStrings();
    const locale = resolveLocale(undefined, el);
    const items = memory.items;
    let at = items.findIndex((i) => i.id === id);
    if (at < 0) return null;
    const loop = attr(el, 'data-kp-lightbox-loop', 'off') === 'on';
    const preload = Math.max(0, Math.min(2, Number(attr(el, 'data-kp-lightbox-preload', '1'))));
    const zoomOn = attr(el, 'data-kp-lightbox-zoom', 'on') !== 'off';
    const chromeMode = attr(el, 'data-kp-lightbox-chrome', 'fade');
    const infoMode = attr(el, 'data-kp-lightbox-info', 'caption');
    const hashOn = attr(el, 'data-kp-lightbox-hash', 'on') !== 'off';
    const prefix = attr(el, 'data-kp-hash-prefix', 'photo');
    const extraActions = attr(el, 'data-kp-lightbox-actions', '').split(/[\s,]+/).filter(Boolean);
    const opener = el.querySelector(`.kp-gallery__cell[data-id="${CSS.escape(id)}"] .kp-gallery__open`);

    const hashOf = (/** @type {string} */ itemId) => `#${prefix}-${encodeURIComponent(itemId)}`;
    let pushed = false;
    let closedByHistory = false;

    const viewer = openViewer({
        title: '',
        size: 'full',
        className: 'kp-gallery__lightbox',
        doc,
        opener: opener instanceof HTMLElement ? opener : null,
        keys: [
            { keys: 'ArrowLeft', what: strings.galleryKeyPrevious, group: strings.galleryKeyGroup, run: () => go(-1), when: () => canGo(-1) },
            { keys: 'ArrowRight', what: strings.galleryKeyNext, group: strings.galleryKeyGroup, run: () => go(1), when: () => canGo(1) },
            { keys: 'Home', what: strings.galleryKeyFirst, group: strings.galleryKeyGroup, run: () => to(0), when: () => at > 0 },
            { keys: 'End', what: strings.galleryKeyLast, group: strings.galleryKeyGroup, run: () => to(items.length - 1), when: () => at < items.length - 1 },
            ...(zoomOn
                ? [
                      { keys: 'z', what: strings.galleryKeyZoom, group: strings.galleryKeyGroup, run: () => zoom('toggle'), when: () => items[at]?.kind !== 'video' },
                      { keys: '+', what: strings.galleryKeyZoomIn, group: strings.galleryKeyGroup, run: () => zoom('in'), when: () => items[at]?.kind !== 'video' },
                      { keys: '-', what: strings.galleryKeyZoomOut, group: strings.galleryKeyGroup, run: () => zoom('out'), when: () => items[at]?.kind !== 'video' },
                  ]
                : []),
            { keys: 'f', what: strings.galleryKeyFull, group: strings.galleryKeyGroup, run: () => toggleFull() },
        ],
        onClose: () => {
            window.clearTimeout(chromeTimer);
            view.removeEventListener('popstate', onPop);
            memory.viewer = null;
            memory.openId = null;
            if (pushed && !closedByHistory) {
                // The address goes back to where the page was; the back button had one step for the lightbox.
                try {
                    view.history.back();
                } catch {
                    // A frame that may not move its history keeps the hash.
                }
            }
            const current = items[at];
            el.dispatchEvent(new CustomEvent(GALLERY_CLOSE_EVENT, { bubbles: true, detail: { id: current?.id ?? id } }));
            // Focus goes to the tile that was open, scrolled into view if the lightbox moved on.
            const tile = current ? el.querySelector(`.kp-gallery__cell[data-id="${CSS.escape(current.id)}"] .kp-gallery__open`) : null;
            if (tile instanceof HTMLElement) {
                tile.scrollIntoView({ block: 'nearest' });
                tile.focus({ preventScroll: true });
            }
        },
    });
    memory.viewer = viewer;

    const picture = make(doc, 'div', 'kp-gallery__picture');
    const info = make(doc, 'div', 'kp-gallery__info');
    const figure = make(doc, 'div', 'kp-gallery__figure');
    figure.setAttribute('data-kp-zoom', 'fit');
    figure.append(picture, info);
    viewer.setContent(figure);

    const zone = (/** @type {'previous' | 'next'} */ side, /** @type {string} */ label, /** @type {string} */ glyph) => {
        const holder = make(doc, 'div', `kp-gallery__zone kp-gallery__zone--${side}`);
        const button = /** @type {HTMLButtonElement} */ (make(doc, 'button', `kp-icon-button kp-gallery__nav kp-gallery__nav--${side}`));
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.setAttribute('data-kp-disabled-reason', '');
        button.textContent = glyph;
        holder.append(button);
        viewer.stage.append(holder);
        return button;
    };
    const previous = zone('previous', strings.galleryPrevious, '‹');
    const next = zone('next', strings.galleryNext, '›');
    // The reason a button is off (the first picture, the last) stands in the package's tooltip.
    attachDisabledReasons(viewer.dialog);
    previous.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));

    /** @param {number} by */
    function canGo(by) {
        return loop ? items.length > 1 : at + by >= 0 && at + by < items.length;
    }
    /** @param {number} by */
    function go(by) {
        if (!canGo(by)) return;
        to((at + by + items.length) % items.length);
    }
    /** @param {number} index */
    function to(index) {
        if (index === at || index < 0 || index >= items.length) return;
        at = index;
        show();
        if (hashOn && pushed) {
            try {
                view.history.replaceState({ kpGallery: items[at].id }, '', hashOf(items[at].id));
            } catch {
                // Not every frame may write its address.
            }
        }
    }

    /** @param {'in' | 'out' | 'toggle'} how @param {PointerEvent | MouseEvent} [event] */
    function zoom(how, event) {
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
                view.requestAnimationFrame(() => {
                    picture.scrollLeft = px * picture.scrollWidth - picture.clientWidth / 2;
                    picture.scrollTop = py * picture.scrollHeight - picture.clientHeight / 2;
                });
            }
        } else if (!want) {
            picture.scrollTo(0, 0);
        }
    }

    function toggleFull() {
        if (doc.fullscreenElement) void doc.exitFullscreen();
        else void viewer.dialog.requestFullscreen?.();
    }

    /** @param {GalleryItem} item */
    function drawInfo(item) {
        info.replaceChildren();
        info.hidden = infoMode === 'off';
        if (infoMode === 'off') return;
        if (item.caption) {
            const caption = make(doc, 'p', 'kp-gallery__text');
            caption.textContent = item.caption;
            info.append(caption);
        }
        const meta = [item.uploader, item.at ? agoMoment(item.at) : ''];
        if (infoMode === 'details') {
            if (item.width && item.height) meta.push(`${item.width} × ${item.height}`);
            if (item.bytes) meta.push(formatBytes(item.bytes, locale));
        }
        const line = meta.filter(Boolean).join(' · ');
        if (line) {
            const facts = make(doc, 'p', 'kp-gallery__meta');
            facts.textContent = line;
            info.append(facts);
        }
        if (!item.caption && !line) info.hidden = true;
    }

    /** @param {GalleryItem} item @returns {import('./viewer.js').ViewerAction[]} */
    function actionsFor(item) {
        /** @type {import('./viewer.js').ViewerAction[]} */
        const list = extraActions.map((kind) => ({ kind, href: item.src, name: item.src.split('/').pop() ?? '' }));
        for (const action of memory?.spec.actions?.(item) ?? []) {
            list.push({
                kind: 'custom',
                label: action.label,
                ...(action.tone ? { tone: action.tone } : {}),
                run: () => {
                    const pressed = doc.activeElement;
                    if (action.confirm && pressed instanceof HTMLElement) {
                        openConfirmation(pressed, { phrase: action.confirm, acceptLabel: action.label, onAccept: action.run });
                    } else action.run();
                },
            });
        }
        return list;
    }

    function show() {
        const item = items[at];
        if (memory) memory.openId = item.id;
        const key = rememberKey(el);
        if (key) {
            try {
                localStorage.setItem(key, item.id);
            } catch {
                // No storage: nothing is remembered.
            }
        }
        viewer.setTitle(item.alt || item.caption || strings.galleryPicture);
        viewer.setPosition({ index: at + 1, total: items.length });
        viewer.setActions(actionsFor(item));
        figure.setAttribute('data-kp-zoom', 'fit');
        drawInfo(item);
        previous.disabled = !canGo(-1);
        next.disabled = !canGo(1);
        previous.setAttribute('data-kp-disabled-reason', previous.disabled ? strings.galleryFirst : '');
        next.setAttribute('data-kp-disabled-reason', next.disabled ? strings.galleryLast : '');
        picture.replaceChildren();
        viewer.setState('loading');
        const mine = item.id;
        const failed = () => {
            if (items[at]?.id !== mine) return;
            picture.replaceChildren();
            el.dispatchEvent(new CustomEvent('kp-gallery-picture-failed', { bubbles: true, detail: { id: mine } }));
            viewer.setState('error', {
                title: strings.galleryPictureFailed,
                message: strings.galleryPictureFailedText,
                retry: () => {
                    items[at] = { ...item, src: again(item.src) };
                    show();
                },
            });
        };
        if (item.kind === 'video') {
            const video = /** @type {HTMLVideoElement} */ (make(doc, 'video', 'kp-gallery__video'));
            video.controls = true;
            video.setAttribute('playsinline', '');
            video.preload = 'metadata';
            if (item.poster) video.poster = item.poster;
            video.setAttribute('aria-label', item.alt || item.caption || strings.galleryPicture);
            video.addEventListener('loadedmetadata', () => items[at]?.id === mine && viewer.setState('ready'));
            video.addEventListener('error', failed);
            video.src = item.src;
            picture.append(video);
        } else {
            const img = /** @type {HTMLImageElement} */ (make(doc, 'img', 'kp-gallery__image'));
            img.alt = item.alt || item.caption || '';
            img.addEventListener('load', () => items[at]?.id === mine && viewer.setState('ready'));
            img.addEventListener('error', failed);
            img.src = item.src;
            if (zoomOn) img.addEventListener('dblclick', (event) => zoom('toggle', event));
            picture.append(img);
        }
        // The neighbours' originals are fetched while this one is looked at, so the arrows do not wait.
        for (let d = 1; d <= preload; d++) {
            for (const n of [items[at + d], items[at - d]]) if (n && n.kind !== 'video') new Image().src = n.src;
        }
        el.dispatchEvent(new CustomEvent(GALLERY_OPEN_EVENT, { bubbles: true, detail: { id: item.id, item } }));
    }

    // The controls fade after a few seconds without movement; they come back on movement or focus; never when calm.
    let chromeTimer = 0;
    const showChrome = () => {
        viewer.dialog.removeAttribute('data-kp-chrome-idle');
        window.clearTimeout(chromeTimer);
        if (chromeMode === 'fade' && motionAllowed(el)) {
            chromeTimer = window.setTimeout(() => {
                if (!viewer.dialog.matches(':focus-within') || !viewer.dialog.querySelector(':focus-visible')) viewer.dialog.setAttribute('data-kp-chrome-idle', '');
            }, GALLERY_CHROME_MS);
        }
    };
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) viewer.dialog.addEventListener(type, showChrome);
    showChrome();

    // A swipe on a phone: sideways steps, down closes.
    let startX = 0;
    let startY = 0;
    let swiping = false;
    picture.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        swiping = true;
        startX = event.clientX;
        startY = event.clientY;
    });
    picture.addEventListener('pointerup', (event) => {
        if (!swiping) return;
        swiping = false;
        if (figure.getAttribute('data-kp-zoom') === 'full') return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > SWIPE * 1.6 && Math.abs(dy) > Math.abs(dx)) viewer.close();
    });
    picture.addEventListener('pointercancel', () => {
        swiping = false;
    });

    // The address carries the open picture; the back button closes the lightbox first.
    const onPop = () => {
        closedByHistory = true;
        viewer.close();
    };
    if (hashOn) {
        try {
            view.history.pushState({ kpGallery: id }, '', hashOf(id));
            pushed = true;
            view.addEventListener('popstate', onPop);
        } catch {
            pushed = false;
        }
    }

    show();
    return viewer;
}

/**
 * Wire every gallery under `root`: the hash the page opened with opens its picture.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachGalleries(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(GALLERY) ? [root] : []), ...root.querySelectorAll(GALLERY)]);
    for (const el of found) {
        if (el.dataset.kpGalleryAttached !== undefined) continue;
        el.dataset.kpGalleryAttached = '';
        if (!MEMORY.has(el)) setGallery(el, { state: /** @type {any} */ (el.getAttribute('data-kp-state') ?? 'loading') });
        cleanups.push(() => {
            MEMORY.get(el)?.viewer?.close();
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
