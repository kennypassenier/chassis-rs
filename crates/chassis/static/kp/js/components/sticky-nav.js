// Sticky navigation: compacts the nav once the page scrolls.
import { Controller, attachOne } from '../controller.js';

/** Fired on the wrapper when a sticky bar turns compact or back: `{ compact }`. */
export const NAV_COMPACT_EVENT = 'kp-nav-compact';
/** The mark the React NavBar puts on a sticky wrapper it wires itself [AR29]. */
export const NAV_STICKY_OWNED = '[data-kp-nav-sticky-owner]';
/**
 * The box that scrolls `el`: its nearest ancestor whose block overflow
 * scrolls, or the document's root element.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement}
 */
function scrollerOf(el) {
    const doc = el.ownerDocument;
    for (let at = el.parentElement; at !== null && at !== doc.body && at !== doc.documentElement; at = at.parentElement) {
        const overflow = getComputedStyle(at).overflowY;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return at;
    }
    return /** @type {HTMLElement} */ (doc.scrollingElement ?? doc.documentElement);
}
/**
 * Wire every sticky nav bar under `root` [scope-48 wave 2].
 *
 * Opt-in by the modifier `.kp-nav-wrap--sticky`; the CSS makes the bar
 * stick, this decides when it is compact and tells the scrolling box how
 * tall it is. Two things, both undone by `detach`:
 *
 * - `data-kp-nav-compact` on the wrapper once the box has scrolled further
 *   than `data-kp-nav-sticky-after` (px, and never less than the bar's own
 *   height at rest, which is the default), and off again once it is back
 *   within that distance less the bar's height. The gap between the two is not decoration: shrinking the
 *   bar moves the content under it up, the browser's scroll anchoring moves
 *   the scroll position with it, and without a gap at least that wide the
 *   bar would flip between its two heights at the threshold.
 * - `--kp-nav-sticky-height` and `data-kp-nav-sticky-root` on the scrolling
 *   box (the document's root, or the nearest ancestor that scrolls), which
 *   the box's `scroll-padding-block-start` reads, so an anchor or a focused
 *   element lands below the bar. A page's own `--kp-scroll-offset` wins.
 *
 * @param {ParentNode} root
 * @param {{ ownedBy?: string, after?: number }} [options]
 * @returns {() => void} detach
 */
export function attachStickyNavs(root = document, { ownedBy = NAV_STICKY_OWNED, after } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {HTMLElement[]} */
    const found = [];
    if (root instanceof HTMLElement && root.matches('.kp-nav-wrap--sticky')) found.push(root);
    for (const el of root.querySelectorAll('.kp-nav-wrap--sticky')) found.push(/** @type {HTMLElement} */ (el));

    for (const wrap of found) {
        if (ownedBy !== '' && wrap.matches(ownedBy)) continue;
        cleanups.push(stickyNav(wrap, after));
    }

    return () => {
        for (const c of cleanups) c();
    };
}
/**
 * One sticky bar; the React NavBar calls this for the wrapper it renders.
 *
 * @param {HTMLElement} wrap the `.kp-nav-wrap--sticky` element
 * @param {number} [after] px; overrides `data-kp-nav-sticky-after`
 * @returns {() => void} detach
 */
export function stickyNav(wrap, after) {
    // A wrapper marked attached is wired already (its detach is its first caller's); one outside a window has nothing to watch.
    if (wrap.dataset.kpNavStickyAttached !== undefined || !wrap.ownerDocument.defaultView) return () => {};
    const control = attachOne(wrap, StickyNavControl, { after });
    return () => control?.destroy();
}

/** One sticky bar: whether it is compact, its height at rest and whether a decision is queued for the next frame. */
class StickyNavControl extends Controller {
    /** @param {HTMLElement} host @param {{ after?: number }} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.view = /** @type {Window} */ (host.ownerDocument.defaultView);
        this.after = options.after;
        /** The box that scrolls the bar, and whether that is the document (whose scroll the window reports). */
        this.scroller = scrollerOf(host);
        const doc = host.ownerDocument;
        this.isDocument = this.scroller === doc.scrollingElement || this.scroller === doc.documentElement;
        /** Whether the bar is compact now. */
        this.compact = host.hasAttribute('data-kp-nav-compact');
        /** The bar's height while not compact. */
        this.restHeight = host.getBoundingClientRect().height;
        /** Whether a decision waits for the next frame. */
        this.queued = false;
    }

    connect() {
        const { host: wrap, scroller } = this;
        wrap.dataset.kpNavStickyAttached = '';
        // Registered first, so it runs last: the marks and the height go after the listener and the size watch.
        this.own(() => {
            wrap.removeAttribute('data-kp-nav-compact');
            scroller.removeAttribute('data-kp-nav-sticky-root');
            scroller.style.removeProperty('--kp-nav-sticky-height');
            delete wrap.dataset.kpNavStickyAttached;
        });
        scroller.setAttribute('data-kp-nav-sticky-root', '');
        if (typeof ResizeObserver !== 'undefined') this.observe(new ResizeObserver(() => this.measure())).observe(wrap);
        this.measure();
        this.decide();
        this.listen(this.isDocument ? this.view : scroller, 'scroll', () => this.onScroll(), { passive: true });
    }

    /** How far the box has scrolled. */
    offset() {
        return this.isDocument ? this.view.scrollY : this.scroller.scrollTop;
    }

    /** Tell the scrolling box how tall the bar is; remember its height at rest. */
    measure() {
        const height = this.host.getBoundingClientRect().height;
        if (!this.compact) this.restHeight = height;
        this.scroller.style.setProperty('--kp-nav-sticky-height', `${height}px`);
    }

    /** Compact past the threshold, back within it less the bar's height, and tell the page when that changes. */
    decide() {
        const wrap = this.host;
        this.queued = false;
        const attribute = wrap.getAttribute('data-kp-nav-sticky-after');
        const asked = this.after ?? (attribute !== null && attribute !== '' ? Number(attribute) : 0);
        const threshold = Math.max(this.restHeight, Number.isFinite(asked) ? asked : 0);
        const at = this.offset();
        const next = this.compact ? at > Math.max(0, threshold - this.restHeight) : at > threshold;
        if (next === this.compact) return;
        this.compact = next;
        wrap.toggleAttribute('data-kp-nav-compact', next);
        wrap.dispatchEvent(new CustomEvent(NAV_COMPACT_EVENT, { bubbles: true, detail: { compact: next } }));
    }

    /** One decision per frame, as the back-to-top control does. */
    onScroll() {
        if (this.queued) return;
        this.queued = true;
        this.view.requestAnimationFrame(() => {
            if (!this.destroyed) this.decide();
        });
    }
}
