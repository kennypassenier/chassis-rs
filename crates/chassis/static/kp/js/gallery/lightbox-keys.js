// The keys of the gallery's lightbox, listed in the `?` sheet [keys4-1104].
//
// The arrows, Home and End are standard widget keys (WAI-ARIA) and stay as they are; zoom, zoom in, zoom out and full screen are options:
// each a key spec read from the gallery's spec (`zoomKey`, `zoomInKey`, `zoomOutKey`, `fullKey`), then its attribute, then the default
// in constants.js; `none` or `false` switches the key off.

import { resolveEngineKeys } from '../key-spec.js';
import {
    GALLERY_FULL_KEY,
    GALLERY_FULL_KEY_ATTRIBUTE,
    GALLERY_ZOOM_IN_KEY,
    GALLERY_ZOOM_IN_KEY_ATTRIBUTE,
    GALLERY_ZOOM_KEY,
    GALLERY_ZOOM_KEY_ATTRIBUTE,
    GALLERY_ZOOM_OUT_KEY,
    GALLERY_ZOOM_OUT_KEY_ATTRIBUTE,
} from './constants.js';

/**
 * @param {import('./lightbox.js').Lightbox} box the open lightbox
 * @returns {import('../shortcuts.js').Shortcut[]}
 */
export function lightboxKeys(box) {
    const s = box.strings;
    const group = s.galleryKeyGroup;
    const spec = box.gallery.spec;
    const notVideo = () => box.items[box.at]?.kind !== 'video';
    /** @type {import('../shortcuts.js').Shortcut[]} */
    const keys = [
        { keys: 'ArrowLeft', what: s.galleryKeyPrevious, group, run: () => box.go(-1), when: () => box.canGo(-1) },
        { keys: 'ArrowRight', what: s.galleryKeyNext, group, run: () => box.go(1), when: () => box.canGo(1) },
        { keys: 'Home', what: s.galleryKeyFirst, group, run: () => box.to(0), when: () => box.at > 0 },
        { keys: 'End', what: s.galleryKeyLast, group, run: () => box.to(box.items.length - 1), when: () => box.at < box.items.length - 1 },
    ];
    /** @type {[string | null, string, () => void][]} */
    const zooms = box.zoomOn
        ? [
              [resolveEngineKeys(box.el, GALLERY_ZOOM_KEY_ATTRIBUTE, spec.zoomKey, GALLERY_ZOOM_KEY), s.galleryKeyZoom, () => box.zoom('toggle')],
              [resolveEngineKeys(box.el, GALLERY_ZOOM_IN_KEY_ATTRIBUTE, spec.zoomInKey, GALLERY_ZOOM_IN_KEY), s.galleryKeyZoomIn, () => box.zoom('in')],
              [resolveEngineKeys(box.el, GALLERY_ZOOM_OUT_KEY_ATTRIBUTE, spec.zoomOutKey, GALLERY_ZOOM_OUT_KEY), s.galleryKeyZoomOut, () => box.zoom('out')],
          ]
        : [];
    for (const [key, what, run] of zooms) if (key !== null) keys.push({ keys: key, what, group, run, when: notVideo });
    const full = resolveEngineKeys(box.el, GALLERY_FULL_KEY_ATTRIBUTE, spec.fullKey, GALLERY_FULL_KEY);
    if (full !== null) keys.push({ keys: full, what: s.galleryKeyFull, group, run: () => box.toggleFull() });
    return keys;
}
