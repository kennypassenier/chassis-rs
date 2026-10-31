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
//
// The module is a facade: a gallery is a `Gallery` and an opened lightbox a `Lightbox` (closure-pattern B, js/controller.js) in `js/gallery/`, one file per concern.

export {
    GALLERY,
    GALLERY_OPEN_EVENT,
    GALLERY_CLOSE_EVENT,
    GALLERY_RETRY_EVENT,
    GALLERY_ADD_EVENT,
    GALLERY_STATES,
    GALLERY_CHROME_MS,
} from './gallery/constants.js';
export {
    galleryItems,
    galleryLast,
    setGallery,
    setGalleryUploading,
    openGalleryItem,
    attachGalleries,
    openGalleryFromHash,
} from './gallery/attach.js';

/** @typedef {import('./gallery/constants.js').GalleryItem} GalleryItem */
/** @typedef {import('./gallery/constants.js').GalleryAction} GalleryAction */
/** @typedef {import('./gallery/constants.js').GallerySpec} GallerySpec */
