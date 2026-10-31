// Scroll boxes: the overflow marker, the scrollbar watcher of one box (ScrollbarControl) and of every box under a root (ScrollbarsRoot).
import { Controller, attachOne, controllerOf, hostsOf } from '../controller.js';
import { SCROLL_BOXES, SCROLL_OVERFLOW } from './constants.js';

/**
 * Tell a register whether an overlay's box scrolls, and where [retro notes, 2026-09-15].
 *
 * Theme-neutral data, nothing drawn: `data-kp-popover-overflowing` exactly while the
 * content is taller than the box, and three custom properties while it is —
 * `--kp-scroll-view` (the box's inner height in px), `--kp-scroll-ratio`
 * (the part of the content in view, 0–1) and `--kp-scroll-progress` (how far
 * it is scrolled, 0–1). A register that draws its own scrollbar reads them;
 * every other theme never notices them.
 *
 * Such a register also declares `--kp-scrollbar-size` (the bar's width),
 * `--kp-scrollbar-inset` (its distance from the padding box's end edge and
 * from the top and bottom) and `--kp-scrollbar-button` (an arrow button's
 * height) on the box. Only then does a press on the drawn bar do what a
 * platform scrollbar's does: an arrow scrolls a line, the track a page,
 * and the thumb is dragged. A press on a bar with nothing to scroll does
 * nothing. The bar is drawn at the inline end of a left-to-right box.
 *
 * @param {HTMLElement} box
 * @returns {() => void} stop, which also takes the attribute and the properties away
 */
export function watchScrollbar(box) {
    // Its own controller per call, outside the registry: a box watched twice is stopped by each stop on its own, as before.
    const control = new ScrollbarControl(box);
    control.connect();
    return () => control.destroy();
}

/** The custom properties a drawing register reads while a box overflows. */
const PROPS = ['--kp-scroll-view', '--kp-scroll-ratio', '--kp-scroll-progress'];
/** The line a press on an arrow scrolls when the box has no line height (px), and the smallest thumb (px). */
const FALLBACK_LINE = 20;
const MIN_THUMB = 8;
/** The decimals the ratios are written with. */
const RATIO_DIGITS = 4;

/** One watched box: its size watches, and the drag of its drawn thumb while one runs. */
class ScrollbarControl extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        /** Ends the thumb drag that runs, if one does. @type {(() => void) | null} */
        this.endDrag = null;
    }

    connect() {
        const box = this.host;
        this.own(() => {
            // A detach in mid-drag ends the drag too.
            this.endDrag?.();
            box.removeAttribute(SCROLL_OVERFLOW);
            for (const p of PROPS) box.style.removeProperty(p);
        });
        this.measure();
        this.listen(box, 'scroll', () => this.measure(), { passive: true });
        this.listen(box, 'pointerdown', (event) => this.onPointerDown(/** @type {PointerEvent} */ (event)));
        if (typeof ResizeObserver === 'undefined') return;
        const resize = this.observe(new ResizeObserver(() => this.measure()));
        const watch = () => {
            resize.disconnect();
            resize.observe(box);
            for (const child of box.children) resize.observe(child);
        };
        watch();
        this.observe(
            new MutationObserver(() => {
                watch();
                this.measure();
            }),
        ).observe(box, { childList: true });
    }

    /** Mark the box while its content is taller than it, and write the view, the ratio in view and the progress. */
    measure() {
        const box = this.host;
        const view = box.clientHeight;
        const size = box.scrollHeight;
        const over = view > 0 && size > view + 1;
        box.toggleAttribute(SCROLL_OVERFLOW, over);
        if (!over) {
            for (const p of PROPS) box.style.removeProperty(p);
            return;
        }
        box.style.setProperty('--kp-scroll-view', `${view}px`);
        box.style.setProperty('--kp-scroll-ratio', (view / size).toFixed(RATIO_DIGITS));
        box.style.setProperty('--kp-scroll-progress', Math.min(1, Math.max(0, box.scrollTop / (size - view))).toFixed(RATIO_DIGITS));
    }

    /** @param {string} name */
    length(name) {
        return parseFloat(getComputedStyle(this.host).getPropertyValue(name));
    }

    /** The drawn bar's edges in window coordinates, or null when the register draws none. */
    bar() {
        const box = this.host;
        const size = this.length('--kp-scrollbar-size');
        if (!(size > 0)) return null;
        const inset = this.length('--kp-scrollbar-inset') || 0;
        const rect = box.getBoundingClientRect();
        const right = rect.left + box.clientLeft + box.clientWidth - inset;
        const top = rect.top + box.clientTop + inset;
        const bottom = rect.top + box.clientTop + box.clientHeight - inset;
        return { size, right, top, bottom };
    }

    /** A press on the drawn bar: an arrow scrolls a line, the track a page, and the thumb is dragged. @param {PointerEvent} event */
    onPointerDown(event) {
        const box = this.host;
        const bar = event.button === 0 ? this.bar() : null;
        if (!bar) return;
        const { size, right, top, bottom } = bar;
        if (event.clientX < right - size || event.clientX > right || event.clientY < top || event.clientY > bottom) return;
        event.preventDefault();
        if (!box.hasAttribute(SCROLL_OVERFLOW)) return;
        const button = Math.min(this.length('--kp-scrollbar-button') || size, (bottom - top) / 2);
        const line = parseFloat(getComputedStyle(box).lineHeight) || FALLBACK_LINE;
        if (event.clientY < top + button) box.scrollTop -= line;
        else if (event.clientY > bottom - button) box.scrollTop += line;
        else this.onTrack(event, top + button, bottom - top - 2 * button);
        this.measure();
    }

    /** A press on the track: above or below the thumb pages, on it drags. @param {PointerEvent} event @param {number} from @param {number} track */
    onTrack(event, from, track) {
        const box = this.host;
        const thumb = Math.max(MIN_THUMB, track * (box.clientHeight / box.scrollHeight));
        const travel = track - thumb;
        const range = box.scrollHeight - box.clientHeight;
        const start = from + travel * (box.scrollTop / range);
        if (event.clientY < start) box.scrollTop -= box.clientHeight;
        else if (event.clientY > start + thumb) box.scrollTop += box.clientHeight;
        else if (travel > 0) this.drag(event, travel, range);
    }

    /** Drag the thumb until the pointer lets go. @param {PointerEvent} event @param {number} travel @param {number} range */
    drag(event, travel, range) {
        const box = this.host;
        const from = { y: event.clientY, scroll: box.scrollTop };
        /** @param {Event} move */
        const onMove = (move) => {
            box.scrollTop = from.scroll + ((/** @type {PointerEvent} */ (move).clientY - from.y) / travel) * range;
        };
        const stop = () => {
            box.removeEventListener('pointermove', onMove);
            box.removeEventListener('pointerup', stop);
            box.removeEventListener('pointercancel', stop);
            this.endDrag = null;
        };
        this.endDrag?.();
        this.endDrag = stop;
        box.setPointerCapture?.(event.pointerId);
        box.addEventListener('pointermove', onMove);
        box.addEventListener('pointerup', stop);
        box.addEventListener('pointercancel', stop);
    }
}

/**
 * A box an `attachScrollbars` call watches. Its own class, so the registry of js/controller.js answers "is this box watched by
 * some attach already" without a stray `watchScrollbar` stop (a plain ScrollbarControl) ever clearing that answer.
 */
class AttachedScrollbar extends ScrollbarControl {}

/** One `attachScrollbars` call: the boxes it watches, now and as they arrive. The "host" is the root the page passed, which may be the document. */
class ScrollbarsRoot extends Controller {
    /** @param {ParentNode} root */
    constructor(root) {
        super(/** @type {HTMLElement} */ (/** @type {unknown} */ (root)));
        this.root = root;
        /** The box controllers this call made, for the detach. @type {Set<AttachedScrollbar>} */
        this.made = new Set();
    }

    connect() {
        const { root } = this;
        // Registered first, so it runs last: every box is let go after the watcher stopped.
        this.own(() => this.letGoAll());
        this.scan(root);
        if (typeof MutationObserver === 'undefined') return;
        const later = this.observe(
            new MutationObserver((records) => {
                for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) this.scan(node);
            }),
        );
        const target = root instanceof Document ? root.documentElement : root;
        if (target instanceof Node) later.observe(target, { childList: true, subtree: true });
    }

    /** Watch every box under `scope` (itself included) that no attach watches yet; a box whose wiring throws is reported and skipped. @param {ParentNode} scope */
    scan(scope) {
        for (const box of hostsOf(scope, SCROLL_BOXES)) {
            if (controllerOf(box, AttachedScrollbar)) continue;
            const control = attachOne(box, AttachedScrollbar);
            if (control) this.made.add(control);
        }
    }

    /** Stop every box this call watches. */
    letGoAll() {
        for (const control of this.made) control.destroy();
        this.made.clear();
    }
}

/**
 * `watchScrollbar` on every `.kp-popover`, `.kp-dialog` and
 * `.kp-dialog__body` under `root`, including the ones added later (a theme
 * menu, a data table's column menu). Idempotent.
 *
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function attachScrollbars(root = document) {
    // Every call watches its root on its own, as before; a box is watched by the first call that finds it.
    const control = new ScrollbarsRoot(root);
    control.connect();
    return () => control.destroy();
}
