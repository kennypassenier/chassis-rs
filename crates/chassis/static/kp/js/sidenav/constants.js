// The event names, attributes and fixed timings of the side navigation.
/** @typedef {import('./helpers.js').Sidenav} Sidenav */

export const SIDENAV_TOGGLE_EVENT = 'kp-sidenav-toggle';
export const SIDENAV_SLIM_EVENT = 'kp-sidenav-slim';
export const SIDENAV_MODE_EVENT = 'kp-sidenav-mode';
/** A change that was asked for and refused: by a listener, or by a static backdrop [Bootstrap's hidePrevented]. */
export const SIDENAV_PREVENTED_EVENT = 'kp-sidenav-prevented';
/** The mark a consumer puts on a toggler they wire themselves [AR29]. */
export const SIDENAV_OWNED = '[data-kp-sidenav-owner]';
/** The shortest leg of the refused cue, in milliseconds: it is pulled and let go, each over at least this long. */
export const REFUSE_MIN_MS = 120;
/** The class of the handle the module adds to a resizable panel. */
export const SIDENAV_RESIZER = '.kp-sidenav__resizer';
/**
 * The reasons a change carries in `detail.reason`. A reader or a caller can
 * refuse the first five; a layout's own adaptation cannot be refused.
 */
export const ASKABLE = new Set(['toggler', 'escape', 'backdrop', 'shortcut', 'api']);
/** The fixed box at the panel's far edge that holds a small toggler: the edge tab. */
export const SIDENAV_TAB = '.kp-sidenav__tab';
/** The fixed box at the window's start corner that holds a panel's toggler. */
export const SIDENAV_LAUNCHER = '.kp-sidenav__launcher';
/**
 * The width at and below which a panel with `data-kp-sidenav-over-below`
 * and no length of its own becomes an `over` panel [scope-80]: the 40rem
 * the bar collapses at and the table falls into cards at, so the package
 * steps at one width rather than at two [TH104, TH26].
 */
export const NARROW_STEP = '40rem';
/** The inset card's knobs: set on the panel, they are carried to the content the card is made of. */
export const INSET_KNOBS = ['--kp-sidenav-inset-gap', '--kp-sidenav-inset-radius', '--kp-sidenav-inset-edge'];
/** The panel knobs the peek strip (`.kp-sidenav__peek`, made for `--kp-sidenav-peek`) follows. */
export const PEEK_KNOBS = [
    '--kp-sidenav-inset-block',
    '--kp-sidenav-float-inset',
    '--kp-sidenav-float-radius',
    '--kp-sidenav-float-edge',
    '--kp-sidenav-peek',
];
/** @type {WeakMap<Element, Sidenav>} */
export const handles = new WeakMap();
/** The pointer's rest before a collapsed rail's group floats out, and its grace before it goes. */
export const FLYOUT_OPEN_MS = 150;
export const FLYOUT_CLOSE_MS = 250;
/** The pointer's rest before a rail item's label shows, as the package's tooltips wait [js/overlays.js]. */
export const TIP_OPEN_MS = 300;
/** The gap between the rail and what floats beside it, in pixels, and the margin kept from the window's edges. */
export const FLOAT_GAP = 6;
export const FLOAT_MARGIN = 8;
/** The refused cue's leg when the theme names no readable duration, and the time the refused mark stays when motion is off. */
export const REFUSE_FALLBACK_MS = 220;
export const REFUSE_STILL_MS = 600;
/** How far a refused panel is pulled toward its edge, when `--kp-sidenav-refuse-travel` is not set. */
export const REFUSE_TRAVEL = '0.75rem';
/** The pointer's rest before a rail with `data-kp-sidenav-expand-on-hover` widens, when `-hover-delay` names none. */
export const HOVER_DELAY_MS = 150;
/** One arrow key's move of the resize grip, in pixels, and how many of those a Shift+arrow moves. */
export const RESIZE_STEP = 16;
export const RESIZE_SHIFT_STEPS = 5;
/** The narrowest and widest a resizable panel may be dragged, when `-min-width` and `-max-width` name none. */
export const RESIZE_MIN_WIDTH = '12rem';
export const RESIZE_MAX_WIDTH = '32rem';
