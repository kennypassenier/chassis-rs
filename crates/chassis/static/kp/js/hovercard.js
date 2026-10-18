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
//   - ignores touch: a finger has no hover, and a tap must stay a tap.
//
// The card's words come from the `data-kp-hovercard` attribute, or from the
// `fill(anchor, card)` callback, which runs at the moment of opening and
// returns a string, a node, an array of nodes or `null` (null opens
// nothing). The attribute wins when it is not empty. The card is never
// filled with markup text: a string is text, and anything richer is built
// as nodes, so a cell's content can never inject HTML.

import { playEntranceBackwards, stopReversing } from './motion.js';
import { layoutRect, placeBlockSide, raiseOverlay } from './top-layer.js';

/** The attribute that makes an element an anchor; its value is the card's text when not empty. */
export const HOVERCARD_ATTRIBUTE = 'data-kp-hovercard';
/** Dispatched on the anchor, bubbling, when the card opens or closes: `{ open, card, anchor }`. */
export const HOVERCARD_EVENT = 'kp-hovercard';
/** Written on the one shared card node. */
export const HOVERCARD_CARD = 'data-kp-hovercard-card';
/** The distance from the window's edge the card keeps, in px. */
const EDGE = 8;

/** @typedef {string | Node | readonly Node[] | null | undefined | false} HoverCardContent */

/**
 * @typedef {object} HoverCardOptions
 * @property {string} [selector]       What an anchor is. Default `[data-kp-hovercard]`; per call.
 * @property {(anchor: HTMLElement, card: HTMLElement) => HoverCardContent} [fill]
 *   Runs when the card is about to open or to move to another anchor; the words for this anchor right now.
 * @property {number} [openDelayMs]    Pointer only; keyboard focus opens at once. Default 300. Per anchor `data-kp-open-delay`.
 * @property {number} [closeDelayMs]   Default 100. Per anchor `data-kp-close-delay`.
 * @property {boolean} [closeOnEscape] Default true. Per anchor `data-kp-close-on-escape="false"`.
 * @property {string} [cardClass]      A class added to the card, for a page's own measure (it lives in <body>).
 */

/**
 * @typedef {(() => void) & { card: HTMLElement, open: (anchor: HTMLElement) => void, hide: () => void, refresh: () => void, anchor: () => HTMLElement | null }} HoverCardHandle
 * `card` is the shared node, `open(anchor)` opens it for an anchor at once, `hide()` closes it now, `refresh()` fills it
 * again for the open anchor (data that changed under the pointer),
 * `anchor()` is the anchor it is open for.
 */

let made = 0;
/** @type {WeakMap<Document | Element, { cfg: HoverCardOptions, handle: HoverCardHandle }>} */
const attached = new WeakMap();
/** @param {HoverCardOptions} o */
const stripped = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

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
    const held = attached.get(root);
    if (held !== undefined) {
        for (const [key, value] of Object.entries(options)) if (value !== undefined) /** @type {any} */ (held.cfg)[key] = value;
        return held.handle;
    }
    /** @type {HoverCardOptions & { selector: string }} */
    const cfg = { selector: `[${HOVERCARD_ATTRIBUTE}]`, openDelayMs: 300, closeDelayMs: 100, closeOnEscape: true, ...stripped(options) };
    const doc = root instanceof Document ? root : root.ownerDocument;
    const card = doc.createElement('div');
    card.className = `kp-popover kp-tooltip${cfg.cardClass ? ` ${cfg.cardClass}` : ''}`;
    card.setAttribute('role', 'tooltip');
    card.setAttribute(HOVERCARD_CARD, '');
    card.id = `kp-hovercard-${(made += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    card.hidden = true;
    doc.body.append(card);

    /** @type {HTMLElement | null} */
    let current = null; // the anchor the card is open for
    /** @type {HTMLElement | null} */
    let wanted = null; // the anchor a pending open is for
    /** @type {string | null} */
    let described = null; // the anchor's own aria-describedby, put back on close
    let timer = 0;
    let going = false;
    let overCard = false;
    /** @type {(() => void) | null} */
    let lower = null;
    /** @type {MutationObserver | null} */
    let watch = null;

    /** @param {Event | null} event @returns {HTMLElement | null} */
    const anchorOf = (event) => {
        const target = event?.target;
        const found = target instanceof Element ? target.closest(cfg.selector) : null;
        return found instanceof HTMLElement && root.contains(found) ? found : null;
    };
    /** @param {HTMLElement} anchor @param {string} name @param {number} fallback */
    const number = (anchor, name, fallback) => {
        const value = anchor.getAttribute(name);
        return value === null || Number.isNaN(Number(value)) ? fallback : Number(value);
    };

    /** @param {HTMLElement} anchor @returns {boolean} whether there is anything to say */
    const fillFor = (anchor) => {
        const own = anchor.getAttribute(HOVERCARD_ATTRIBUTE) ?? '';
        /** @type {HoverCardContent} */
        const content = own !== '' ? own : (cfg.fill?.(anchor, card) ?? null);
        if (content === null || content === undefined || content === false || content === '') return false;
        if (typeof content === 'string') card.textContent = content;
        else card.replaceChildren(...(content instanceof Node ? [content] : content));
        return true;
    };

    /** Under the anchor, start edges aligned, kept in the window; above when there is no room below. @param {HTMLElement} el */
    const place = (el) => {
        if (current === null || !current.isConnected) return;
        const field = current.getBoundingClientRect();
        const rtl = getComputedStyle(current).direction === 'rtl';
        const view = doc.documentElement.clientWidth;
        el.style.setProperty('right', 'auto');
        el.style.setProperty('bottom', 'auto');
        el.style.setProperty('top', `${field.bottom}px`);
        // The width it takes depends on the room it has to the right of its left edge, so it is measured with the whole window
        // to itself, then placed: start edge under the anchor's, kept inside the window by the register's own margin (EDGE).
        el.style.setProperty('left', `${EDGE}px`);
        const width = layoutRect(el).width;
        const gap = Number.parseFloat(getComputedStyle(el).marginLeft) || 0;
        const wanted = rtl ? field.right - width : field.left;
        const left = Math.max(EDGE - gap, Math.min(wanted, view - EDGE - width - gap));
        el.style.setProperty('left', `${left}px`);
        placeBlockSide(el, field);
    };

    /** @param {HTMLElement} anchor */
    const describe = (anchor) => {
        described = anchor.getAttribute('aria-describedby');
        const ids = (described ?? '').split(/\s+/).filter(Boolean);
        if (!ids.includes(card.id)) anchor.setAttribute('aria-describedby', [...ids, card.id].join(' '));
    };
    /** @param {HTMLElement} anchor */
    const undescribe = (anchor) => {
        if (described === null) anchor.removeAttribute('aria-describedby');
        else anchor.setAttribute('aria-describedby', described);
        described = null;
    };

    /** @param {boolean} open @param {HTMLElement} anchor */
    const announce = (open, anchor) => anchor.dispatchEvent(new CustomEvent(HOVERCARD_EVENT, { bubbles: true, detail: { open, card, anchor } }));

    /** Opens for `anchor`, or moves to it when already open. @param {HTMLElement} anchor */
    const open = (anchor) => {
        wanted = null;
        if (!anchor.isConnected || anchor === current) return;
        if (!fillFor(anchor)) {
            // Nothing to say for this one: an open card for the last one goes.
            if (current !== null) close(0);
            return;
        }
        if (going) {
            // Wanted back while it was leaving: the entrance turns round.
            going = false;
            stopReversing(card);
        }
        const was = current;
        if (was !== null) {
            undescribe(was);
            announce(false, was);
        }
        current = anchor;
        describe(anchor);
        if (card.hidden) {
            card.hidden = false;
            lower = raiseOverlay(card, place);
        } else place(card);
        // A rebuild that removes the open anchor takes the card with it.
        watch ??= new MutationObserver(() => {
            if (current !== null && !current.isConnected) hide();
        });
        watch.observe(doc.body, { childList: true, subtree: true });
        announce(true, anchor);
    };

    /** The card goes the way it came, then is hidden. */
    const hide = () => {
        clearTimeout(timer);
        wanted = null;
        const anchor = current;
        if (anchor === null || going) return;
        current = null;
        overCard = false;
        watch?.disconnect();
        if (anchor.isConnected) undescribe(anchor);
        else described = null;
        going = true;
        const finish = () => {
            going = false;
            card.hidden = true;
            stopReversing(card);
            lower?.();
            lower = null;
            card.replaceChildren();
        };
        void playEntranceBackwards(card).then(() => {
            // Wanted back meanwhile: open() took it over.
            if (going) finish();
        });
        announce(false, anchor);
    };

    /** @param {number} delay */
    const close = (delay) => {
        clearTimeout(timer);
        if (delay <= 0) hide();
        else timer = window.setTimeout(hide, delay);
    };

    /** @param {HTMLElement} anchor @param {number} delay */
    const schedule = (anchor, delay) => {
        clearTimeout(timer);
        wanted = anchor;
        if (delay <= 0 || current !== null) open(anchor);
        else timer = window.setTimeout(() => open(anchor), delay);
    };

    /** @param {PointerEvent} event */
    const onOver = (event) => {
        if (event.pointerType === 'touch') return;
        const anchor = anchorOf(event);
        if (anchor === null || anchor === current) {
            if (anchor !== null) clearTimeout(timer);
            return;
        }
        schedule(anchor, number(anchor, 'data-kp-open-delay', cfg.openDelayMs ?? 300));
    };
    /** @param {PointerEvent} event */
    const onOut = (event) => {
        if (event.pointerType === 'touch') return;
        const anchor = anchorOf(event);
        if (anchor === null) return;
        const to = event.relatedTarget;
        // Still inside the anchor, or on the way to the card: nothing left yet.
        if (to instanceof Node && (anchor.contains(to) || card.contains(to))) return;
        if (anchor === wanted) {
            clearTimeout(timer);
            wanted = null;
        }
        if (anchor !== current) return;
        // Focus keeps it: a keyboard user's card stays while the pointer wanders off.
        if (anchor.contains(doc.activeElement) && anchor.matches(':focus-visible, :has(:focus-visible)')) return;
        close(number(anchor, 'data-kp-close-delay', cfg.closeDelayMs ?? 100));
    };
    const onCardEnter = () => {
        overCard = true;
        clearTimeout(timer);
    };
    /** @param {PointerEvent} event */
    const onCardLeave = (event) => {
        overCard = false;
        const to = event.relatedTarget;
        if (current !== null && to instanceof Node && current.contains(to)) return;
        close(cfg.closeDelayMs ?? 100);
    };
    /** @param {FocusEvent} event */
    const onFocusIn = (event) => {
        const anchor = anchorOf(event);
        if (anchor !== null) schedule(anchor, 0);
    };
    /** @param {FocusEvent} event */
    const onFocusOut = (event) => {
        const anchor = anchorOf(event);
        if (anchor === null) return;
        if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
        if (anchor === current && !overCard) close(0);
        else if (anchor === wanted) {
            clearTimeout(timer);
            wanted = null;
        }
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key !== 'Escape' || current === null) return;
        if (cfg.closeOnEscape === false || current.getAttribute('data-kp-close-on-escape') === 'false') return;
        hide();
    };

    root.addEventListener('pointerover', /** @type {EventListener} */ (onOver));
    root.addEventListener('pointerout', /** @type {EventListener} */ (onOut));
    root.addEventListener('focusin', /** @type {EventListener} */ (onFocusIn));
    root.addEventListener('focusout', /** @type {EventListener} */ (onFocusOut));
    card.addEventListener('pointerenter', onCardEnter);
    card.addEventListener('pointerleave', /** @type {EventListener} */ (onCardLeave));
    doc.addEventListener('keydown', onKey);

    const detach = () => {
        clearTimeout(timer);
        root.removeEventListener('pointerover', /** @type {EventListener} */ (onOver));
        root.removeEventListener('pointerout', /** @type {EventListener} */ (onOut));
        root.removeEventListener('focusin', /** @type {EventListener} */ (onFocusIn));
        root.removeEventListener('focusout', /** @type {EventListener} */ (onFocusOut));
        doc.removeEventListener('keydown', onKey);
        watch?.disconnect();
        if (current?.isConnected) undescribe(current);
        current = null;
        going = false;
        stopReversing(card);
        lower?.();
        card.remove();
    };
    const handle = Object.assign(
        () => {
            attached.delete(root);
            detach();
        },
        {
            card,
            open: (/** @type {HTMLElement} */ anchor) => schedule(anchor, 0),
            hide,
            refresh: () => {
                if (current !== null && current.isConnected && fillFor(current)) place(card);
                else hide();
            },
            anchor: () => current,
        },
    );
    attached.set(root, { cfg, handle });
    return handle;
}
