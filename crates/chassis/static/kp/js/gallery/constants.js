// The selector, event names, states and fixed numbers of the gallery, and the types of its pictures, actions and spec.

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
// Fired on the gallery when a picture would not load: `{ id }` (an event of the module's own, not a page-facing name).
export const GALLERY_PICTURE_FAILED_EVENT = 'kp-gallery-picture-failed';
/** The states a gallery can be in. */
export const GALLERY_STATES = /** @type {const} */ (['ready', 'loading', 'empty', 'error']);
/** How long the controls stay before they fade, in ms. */
export const GALLERY_CHROME_MS = 3000;
/** The most a swipe has to travel sideways to step, in px. */
export const SWIPE = 56;
/** How much further than a sideways step a swipe down has to travel to close the lightbox. */
export const SWIPE_CLOSE_FACTOR = 1.6;
/** How many waiting tiles a loading gallery shows unless the spec says. */
export const DEFAULT_SKELETON = 8;
/** The most originals fetched beside the open one. */
export const PRELOAD_MAX = 2;
/** The columns a gallery may be fixed to. */
export const COLUMNS_PATTERN = /^[2-8]$/;

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
