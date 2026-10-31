// The hover card: one tooltip for a whole page, filled when it opens
// [kpadopt-9; the admin dashboard's ui.js `hoverCard`].
//
// `attachTooltips()` (js/overlays.js) wants a tooltip element inside every
// anchor, found once when it attaches. That cannot serve a table whose
// cells and chips are rebuilt every thirty seconds, or a card whose words
// are only known when the pointer arrives. This is the other shape of the
// same tooltip:
//
//   <td data-kp-hovercard="Last seen 14:02, 3 minutes ago">healthy</td>
//
//   attachHoverCards(document, { fill: (anchor) => rowDetail(anchor) });
//
// The listeners sit on the root, not on the anchors, so an anchor created
// after the attach (or created again by a rebuild) works at once and
// nothing is rewired. There is ONE card node, a `.kp-popover.kp-tooltip`
// the module makes in <body>: it wears the look, the entrance and the
// going-out of whichever theme is on, exactly as a tooltip in an anchor
// does, and it is placed where that tooltip would be: under the anchor,
// its start edge on the anchor's start edge, above it when there is no
// room below, kept inside the window. It lives in the top layer while it
// is open, so a dialog or a clipping container never hides it.
//
// What it does:
//   - opens after a short delay under the pointer, at once on keyboard
//     focus, and at once when the pointer moves from one anchor to the next
//     while it is open (no re-entrance, the card is carried over);
//   - stays while the pointer is on it (WCAG 1.4.13: hoverable), goes when
//     the pointer or the focus leaves, and on Escape (dismissible);
//   - closes the way it came in: the theme's entrance played backwards;
//   - describes the anchor (`aria-describedby`) only while open, and puts
//     the anchor's own value back after;
//   - closes by itself when its anchor is removed (a rebuild) and opens
//     again for the new anchor the next time the pointer or focus arrives;
//   - on touch a finger has no hover, so a TAP on an anchor opens the card, a tap on the open anchor or anywhere outside
//     the card closes it, and a tap inside the card keeps it [hover-wheel-1019; the AuDHD recipes app's ingredient
//     notes were unreachable on a phone]. A tap on an anchor that is itself a control (a link, a button, an input)
//     stays that control's tap and opens nothing, unless the anchor says `data-kp-touch="tap"` (the first tap then
//     opens the card and does not follow the link, the second does). `data-kp-touch="off"` leaves one anchor to
//     touch alone, `touch: false` the whole root. A touch never starts the hover timers; the keyboard is unchanged.
//
// The card's words come from the `data-kp-hovercard` attribute, or from the
// `fill(anchor, card)` callback, which runs at the moment of opening and
// returns a string, a node, an array of nodes or `null` (null opens
// nothing). The attribute wins when it is not empty. The card is never
// filled with markup text: a string is text, and anything richer is built
// as nodes, so a cell's content can never inject HTML.
//
// One card per root is one HoverCard controller (js/hovercard/controller.js over touch.js, show.js and core.js, on js/controller.js; the root is its
// host); the parts are listed in js/README.md.

import { controllerOf, attachOne } from './controller.js';
import { HoverCard } from './hovercard/controller.js';

export { HOVERCARD_ATTRIBUTE, HOVERCARD_CARD, HOVERCARD_EVENT } from './hovercard/values.js';

/** @typedef {string | Node | readonly Node[] | null | undefined | false} HoverCardContent */

/**
 * @typedef {object} HoverCardOptions
 * @property {string} [selector]       What an anchor is. Default `[data-kp-hovercard]`; per call.
 * @property {(anchor: HTMLElement, card: HTMLElement) => HoverCardContent} [fill]
 *   Runs when the card is about to open or to move to another anchor; the words for this anchor right now.
 * @property {number} [openDelayMs]    Pointer only; keyboard focus opens at once. Default 300. Per anchor `data-kp-open-delay`.
 * @property {number} [closeDelayMs]   Default 100. Per anchor `data-kp-close-delay`.
 * @property {boolean} [closeOnEscape] Default true. Per anchor `data-kp-close-on-escape="false"`.
 * @property {boolean} [touch]           A tap opens and closes the card. Default true; per anchor `data-kp-touch="off" | "tap"`.
 * @property {string} [cardClass]      A class added to the card, for a page's own measure (it lives in <body>).
 */

/**
 * @typedef {(() => void) & { card: HTMLElement, open: (anchor: HTMLElement) => void, hide: () => void, refresh: () => void, anchor: () => HTMLElement | null }} HoverCardHandle
 * `card` is the shared node, `open(anchor)` opens it for an anchor at once, `hide()` closes it now, `refresh()` fills it
 * again for the open anchor (data that changed under the pointer),
 * `anchor()` is the anchor it is open for.
 */

/**
 * Attach the page's hover card to `root`.
 *
 * @param {Document | Element} [root]
 * @param {HoverCardOptions} [options]
 * @returns {HoverCardHandle} detach, with the handle's members on it
 */
export function attachHoverCards(root = document, options = {}) {
    // One card per root. A second call (a page that attaches with a `fill`
    // after `js/auto.js` attached with none) hands its options to the card
    // that is there and returns the same handle, so a page never gets two.
    // A document is a host too: the controllers are keyed on any object.
    const host = /** @type {HTMLElement} */ (/** @type {unknown} */ (root));
    const held = controllerOf(host, HoverCard);
    if (held !== undefined) {
        held.merge(options);
        return held.handle;
    }
    const card = attachOne(host, HoverCard, options);
    if (!card) throw new Error('The hover card could not be set up; the cause was reported.');
    return card.handle;
}
