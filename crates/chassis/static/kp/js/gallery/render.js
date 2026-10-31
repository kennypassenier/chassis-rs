// Builds the gallery's tiles and plates: the grid and its cells, the add tile, the failed-picture tile and the empty or failed plate.

import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { COLUMNS_PATTERN, DEFAULT_SKELETON, GALLERY_ADD_EVENT, GALLERY_PICTURE_FAILED_EVENT, GALLERY_RETRY_EVENT } from './constants.js';
import { again, attr, make } from './dom.js';

/** @typedef {import('./gallery.js').Gallery} Gallery */
/** @typedef {import('./constants.js').GalleryItem} GalleryItem */

/** The button that opens the file picker. @param {HTMLElement} el */
const pickFiles = (el) => /** @type {HTMLInputElement | null} */ (el.querySelector('.kp-gallery__file'))?.click();

/** The hidden file input behind the add tile. @param {Document} doc @param {HTMLElement} el */
export function fileInput(doc, el) {
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

/** The plate of an empty or failed gallery, over the whole footprint. @param {Gallery} gallery @param {'empty' | 'error'} state */
export function statePlateBox(gallery, state) {
    const { el, spec } = gallery;
    const doc = el.ownerDocument;
    const strings = getStrings();
    const box = make(doc, 'div', 'kp-gallery__state');
    const isError = state === 'error';
    const canAdd = !isError && spec.add;
    const plate = statePlate(doc, {
        kind: isError ? 'error' : 'empty',
        title: spec.message ?? (isError ? strings.galleryFailed : strings.galleryEmpty),
        text: isError ? strings.galleryFailedText : canAdd ? strings.galleryEmptyAdd : strings.galleryEmptyText,
        ...(isError
            ? { actionLabel: strings.galleryRetry, onAction: () => el.dispatchEvent(new CustomEvent(GALLERY_RETRY_EVENT, { bubbles: true })) }
            : canAdd
              ? { actionLabel: strings.galleryAdd, onAction: () => pickFiles(el) }
              : {}),
    });
    box.append(plate);
    return box;
}

/** "Continue where you were". @param {Gallery} gallery @param {string} last */
export function continueBar(gallery, last) {
    const doc = gallery.el.ownerDocument;
    const bar = make(doc, 'div', 'kp-gallery__bar');
    const go = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-button--sm kp-gallery__continue'));
    go.type = 'button';
    go.textContent = getStrings().galleryContinue;
    go.addEventListener('click', () => gallery.openItem(last));
    bar.append(go);
    return bar;
}

/** The first cell of the grid: Add pictures. @param {Gallery} gallery */
function addCell(gallery) {
    const { el, uploading } = gallery;
    const doc = el.ownerDocument;
    const cell = make(doc, 'li', 'kp-gallery__cell kp-gallery__cell--add');
    const add = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-gallery__add'));
    add.type = 'button';
    const plus = make(doc, 'span', 'kp-gallery__add-mark');
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = '+';
    const label = make(doc, 'span', 'kp-gallery__add-label');
    label.textContent = getStrings().galleryAdd;
    add.append(plus, label);
    if (uploading) {
        add.disabled = true;
        add.setAttribute('data-kp-disabled-reason', uploading);
    }
    add.addEventListener('click', () => pickFiles(el));
    cell.append(add);
    return cell;
}

/** The waiting tiles of a loading gallery. @param {Gallery} gallery @param {HTMLElement} grid */
function addSkeletonCells(gallery, grid) {
    const doc = gallery.el.ownerDocument;
    const count = Math.max(1, gallery.spec.skeleton ?? DEFAULT_SKELETON);
    for (let i = 0; i < count; i++) {
        const cell = make(doc, 'li', 'kp-gallery__cell');
        const tile = make(doc, 'div', 'kp-gallery__tile kp-skeleton');
        tile.setAttribute('aria-hidden', 'true');
        cell.append(tile);
        grid.append(cell);
    }
}

/** The grid of tiles, or of waiting tiles. @param {Gallery} gallery @param {boolean} loading */
export function buildGrid(gallery, loading) {
    const { el, spec, items } = gallery;
    const doc = el.ownerDocument;
    const grid = make(doc, 'ul', 'kp-gallery__grid');
    grid.setAttribute('role', 'list');
    const columns = attr(el, 'data-kp-grid-columns', 'auto');
    if (COLUMNS_PATTERN.test(columns)) {
        el.style.setProperty('--kp-gallery-columns', columns);
        el.setAttribute('data-kp-grid-fixed', '');
    } else {
        el.style.removeProperty('--kp-gallery-columns');
        el.removeAttribute('data-kp-grid-fixed');
    }
    grid.setAttribute('data-kp-tile-shape', attr(el, 'data-kp-tile-shape', 'square'));
    if (spec.add && !loading) grid.append(addCell(gallery));
    if (loading) addSkeletonCells(gallery, grid);
    else for (const item of items) grid.append(tileFor(gallery, item));
    return grid;
}

/** The tile of one picture. @param {Gallery} gallery @param {GalleryItem} item */
export function tileFor(gallery, item) {
    const { el } = gallery;
    const doc = el.ownerDocument;
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
    img.addEventListener('error', () => failTile(gallery, cell, tile, item));
    open.append(img);
    if (item.kind === 'video') {
        const play = make(doc, 'span', 'kp-gallery__play');
        play.setAttribute('aria-hidden', 'true');
        open.append(play);
    }
    const words = item.uploader || item.caption;
    if (attr(el, 'data-kp-caption', 'hover') !== 'none' && words) {
        const caption = make(doc, 'span', 'kp-gallery__caption');
        caption.textContent = words;
        open.append(caption);
    }
    open.addEventListener('click', () => gallery.openItem(item.id));
    tile.append(open);
    cell.append(tile);
    return cell;
}

/** A tile whose picture would not load: a state tile of the same size, with Retry. @param {Gallery} gallery @param {HTMLElement} cell @param {HTMLElement} tile @param {GalleryItem} item */
function failTile(gallery, cell, tile, item) {
    const { el } = gallery;
    const doc = el.ownerDocument;
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
        const fresh = tileFor(gallery, { ...item, thumb: again(item.thumb ?? item.poster ?? item.src) });
        cell.replaceWith(fresh);
        /** @type {HTMLElement | null} */ (fresh.querySelector('.kp-gallery__open'))?.focus({ preventScroll: true });
    });
    plate.append(mark, text, retry);
    tile.replaceChildren(plate);
    el.dispatchEvent(new CustomEvent(GALLERY_PICTURE_FAILED_EVENT, { bubbles: true, detail: { id: item.id } }));
}
