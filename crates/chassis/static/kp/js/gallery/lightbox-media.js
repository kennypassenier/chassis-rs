// What the lightbox puts in its stage: the video and the image, and the zoom of the picture.

import { make } from './dom.js';
/** @typedef {import('./lightbox.js').Lightbox} Lightbox */

/** @param {Lightbox} lb @param {'in' | 'out' | 'toggle'} how @param {PointerEvent | MouseEvent} [event] */
export function zoomFigure(lb, how, event) {
    const { figure, picture } = lb;
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
            lb.view.requestAnimationFrame(() => {
                picture.scrollLeft = px * picture.scrollWidth - picture.clientWidth / 2;
                picture.scrollTop = py * picture.scrollHeight - picture.clientHeight / 2;
            });
        }
    } else if (!want) {
        picture.scrollTo(0, 0);
    }
}

/** @param {Lightbox} lb @param {import('./constants.js').GalleryItem} item */
export function buildVideo(lb, item) {
    const video = /** @type {HTMLVideoElement} */ (make(lb.doc, 'video', 'kp-gallery__video'));
    video.controls = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    if (item.poster) video.poster = item.poster;
    video.setAttribute('aria-label', item.alt || item.caption || lb.strings.galleryPicture);
    video.addEventListener('loadedmetadata', () => lb.items[lb.at]?.id === item.id && lb.viewer.setState('ready'));
    video.addEventListener('error', () => lb.failed(item));
    video.src = item.src;
    return video;
}

/** @param {Lightbox} lb @param {import('./constants.js').GalleryItem} item */
export function buildImage(lb, item) {
    const img = /** @type {HTMLImageElement} */ (make(lb.doc, 'img', 'kp-gallery__image'));
    img.alt = item.alt || item.caption || '';
    img.addEventListener('load', () => lb.items[lb.at]?.id === item.id && lb.viewer.setState('ready'));
    img.addEventListener('error', () => lb.failed(item));
    img.src = item.src;
    if (lb.zoomOn) img.addEventListener('dblclick', (event) => lb.zoom('toggle', event));
    return img;
}
