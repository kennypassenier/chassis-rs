// An open overlay above the containers it sits in [2026-09-13].
//
// Four registers draw the silhouette of a container with `clip-path` — the
// cut corners of a card, an alert, a popover, a dialog or a spec sheet in
// dark, cyberpunk, phantom and titanium — and a clip cuts away everything
// inside the box, an open list or calendar included. Measured on
// 2026-09-13 inside a `.kp-card` in those four themes: every day of a date
// picker's calendar (31 of 31) and every option of a combobox and of a
// drawn select (5 of 5; 4 of 5 for phantom's combobox) out of reach, the
// clipped area handing the click to whatever lay beneath. `overflow:
// hidden` on an ancestor does the same. No z-index escapes either; the top
// layer does.
//
// So an overlay the package opens becomes a manual popover for as long as
// it is open. It stays where it is in the document — the child of its
// control, so it inherits the theme, still matches every register
// selector, and focus and `focusout` behave as before — and is placed in
// window coordinates by its component, again whenever anything scrolls or
// the window changes size. A browser without the popover API keeps the
// overlay where it always hung.

/**
 * The box an element's bounding rectangle would be with its own `rotate`
 * set aside: the layout box. A theme may stand a part askew (phantom lands
 * a menu, a card and a combobox's list a degree and a half turned), and the
 * bounding rectangle of a turned box is larger than the box (a 1227 px list
 * reads 1232 px wide and 32 px taller), so a placement that measured it put
 * the list 16 px above its field and 3 px too wide. Only a single angle is
 * set aside, about the box's `transform-origin`.
 *
 * @param {HTMLElement} el
 * @param {CSSStyleDeclaration} style
 * @returns {DOMRect}
 */
function unturnedRect(el, style) {
    const box = el.getBoundingClientRect();
    const match = /^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(style.rotate ?? '');
    if (!match) return box;
    const unit = { deg: Math.PI / 180, rad: 1, turn: 2 * Math.PI, grad: Math.PI / 200 }[match[2]] ?? 0;
    const a = Number.parseFloat(match[1]) * unit;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const det = c * c - s * s;
    // Near 45 degrees the turned box cannot be told back; it stays as drawn.
    if (a === 0 || Math.abs(det) < 0.05) return box;
    const w = (c * box.width - s * box.height) / det;
    const h = (c * box.height - s * box.width) / det;
    const [ox, oy] = style.transformOrigin.split(/\s+/).map((n) => Number.parseFloat(n) || 0);
    // The turned box's centre is the layout box's centre carried round the origin.
    const dx = w / 2 - ox;
    const dy = h / 2 - oy;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const left = box.left + box.width / 2 - ox - (dx * cos - dy * sin);
    const top = box.top + box.height / 2 - oy - (dx * sin + dy * cos);
    return new DOMRect(left, top, w, h);
}

/**
 * Where an element's box lies in window coordinates with its own `translate`
 * (and a `transform` that only translates) set aside: where the layout put
 * it, not where an arrival animation is drawing it this frame.
 *
 * Forest grows a menu, a popover, a combobox's list and a date picker's
 * panel out of their button from `translate: 0 -100%` (css/forest-register.css,
 * 2026-10-09). Measured on the frame it opened, the menu button's menu sat
 * its own height above where the layout put it, and the placement moved it
 * down by that much: in catalogue/overlays.html#menu-button the button
 * ended at 409 px and the menu started at 947 px, where formal starts it at
 * 413 px. Every placement measures through this instead, so every theme
 * places an overlay at its button whatever its arrival draws.
 *
 * @param {Element} element
 * @returns {DOMRect}
 */
export function layoutRect(element) {
    const view = element.ownerDocument.defaultView;
    if (!view) return element.getBoundingClientRect();
    const style = view.getComputedStyle(element);
    const el = /** @type {HTMLElement} */ (element);
    const box = unturnedRect(el, style);
    let x = 0;
    let y = 0;
    if (style.translate && style.translate !== 'none') {
        const parts = style.translate.split(/\s+/);
        /** @param {string | undefined} part @param {number} size */
        const length = (part, size) => {
            if (!part) return 0;
            const n = Number.parseFloat(part);
            if (!Number.isFinite(n)) return 0;
            return part.endsWith('%') ? (n / 100) * size : n;
        };
        x += length(parts[0], el.offsetWidth ?? box.width);
        y += length(parts[1], el.offsetHeight ?? box.height);
    }
    if (style.transform && style.transform !== 'none' && typeof DOMMatrixReadOnly === 'function') {
        const m = new DOMMatrixReadOnly(style.transform);
        // Only a pure move is set aside; a scale or a turn is left as drawn.
        if (m.is2D && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) {
            x += m.e;
            y += m.f;
        }
    }
    if (x === 0 && y === 0) return box;
    return new DOMRect(box.x - x, box.y - y, box.width, box.height);
}

/**
 * Raise an overlay that is being shown into the top layer.
 *
 * @param {HTMLElement} element the overlay, already visible (not `hidden`)
 * @param {(element: HTMLElement) => void} place puts it in window coordinates; called now and on every scroll and resize
 * @returns {() => void} lower — takes it out of the top layer, stops following, and removes what raising wrote
 */
export function raiseOverlay(element, place) {
    if (typeof element.showPopover !== 'function' || !element.isConnected) {
        place(element);
        return () => {};
    }
    const added = !element.hasAttribute('popover');
    if (added) element.setAttribute('popover', 'manual');
    if (!element.matches(':popover-open')) element.showPopover();
    const follow = () => {
        // Moved in the document (a page that re-parents its sections, the review dialog's stage) the browser takes a
        // popover out of the top layer without a word; while the overlay is still meant to be showing, it is put back.
        if (element.isConnected && !element.hidden && !element.matches(':popover-open')) element.showPopover();
        place(element);
    };
    follow();
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    // A list that filters or a calendar that turns to a six-week month
    // changes height while open, and the side it fits on can change with it.
    // Placing writes the same size back, so this settles after one call.
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null;
    resized?.observe(element);
    return () => {
        resized?.disconnect();
        window.removeEventListener('scroll', follow, { capture: true });
        window.removeEventListener('resize', follow);
        if (element.matches(':popover-open')) element.hidePopover();
        if (added) element.removeAttribute('popover');
        clearBlockSide(element);
    };
}

/** @param {HTMLElement} element */
const clearBlockSide = (element) => {
    element.style.removeProperty('max-block-size');
    element.style.removeProperty('overflow-y');
    delete element.dataset.kpOverlaySide;
};

/**
 * Choose the side of its field a raised overlay opens on [fix-30].
 *
 * Measured on 2026-09-15: a combobox, a drawn select and a date picker at
 * the bottom of a 520px window each opened their overlay below the
 * window's edge (a list from y=486 to 604, a calendar from 512 to 788),
 * where neither a person nor a click could reach it; a fixed box outside
 * the viewport cannot be scrolled into view.
 *
 * The caller has just put the overlay below its field, where it always
 * opened; this reads that spot and keeps it when the overlay fits under
 * the window's bottom edge. When it does not and the room above the field
 * is larger, the overlay moves above the field at the same distance it hung
 * below it, and `data-kp-overlay-side="above"` says so, for a register that
 * wants to mirror something. When neither side holds it, the larger side
 * gets it with a `max-block-size` and the overlay scrolls itself.
 * Only the block axis: the inline placement stays the caller's, RTL
 * included. Horizontal writing modes only, as every caller is.
 *
 * @param {HTMLElement} element the overlay, in the top layer and placed below its field in window coordinates (its `top` written inline)
 * @param {{ top: number, bottom: number }} field the field's box in window coordinates
 * @returns {'below' | 'above'} the side taken
 */
export function placeBlockSide(element, field) {
    clearBlockSide(element);
    const drawn = layoutRect(element);
    const style = getComputedStyle(element);
    const height = drawn.height;
    // What a max-block-size does not count, for a box that is not border-box.
    const outside = style.boxSizing === 'border-box' ? 0 : height - (Number.parseFloat(style.height) || 0);
    /** @param {number} room */
    const cap = (room) => {
        element.style.maxBlockSize = `${Math.max(0, Math.floor(room - outside))}px`;
        element.style.overflowY = 'auto';
    };
    const gap = Math.max(0, drawn.top - field.bottom);
    const view = document.documentElement.clientHeight;
    const below = view - drawn.top;
    const above = field.top - gap;
    if (height <= below || below >= above) {
        if (height > below) cap(below);
        return 'below';
    }
    const size = Math.min(height, above);
    const top = Number.parseFloat(element.style.top) || 0;
    element.style.top = `${top + (field.top - gap - size - drawn.top)}px`;
    if (height > above) cap(above);
    element.dataset.kpOverlaySide = 'above';
    return 'above';
}

/**
 * Raise an overlay exactly where it was drawn: the spot and the width it
 * had in its container a moment ago, held against `anchor` while it is
 * open. For an overlay the stylesheet already places (a combobox's list at
 * its static position under the input), so the placement stays the
 * stylesheet's and a register that moves it is still obeyed.
 *
 * When the window has no room below, it opens above `field` instead
 * (placeBlockSide).
 *
 * @param {HTMLElement} element the overlay, already visible and laid out in place
 * @param {Element} anchor what it moves with — the control it belongs to
 * @param {Element} [field] what it opens under, and above when there is no room below — the input; the anchor when not given
 * @returns {() => void} lower
 */
export function raiseInPlace(element, anchor, field = anchor) {
    const drawn = layoutRect(element);
    const from = anchor.getBoundingClientRect();
    const dx = drawn.left - from.left;
    const dy = drawn.top - from.top;
    const width = drawn.width;
    const lower = raiseOverlay(element, () => {
        const at = anchor.getBoundingClientRect();
        const style = getComputedStyle(element);
        // A fixed box adds its own margins again, so they come off the spot it was drawn at.
        element.style.left = `${at.left + dx - (Number.parseFloat(style.marginLeft) || 0)}px`;
        element.style.top = `${at.top + dy - (Number.parseFloat(style.marginTop) || 0)}px`;
        element.style.width = `${width}px`;
        placeBlockSide(element, field.getBoundingClientRect());
    });
    return () => {
        lower();
        element.style.removeProperty('left');
        element.style.removeProperty('top');
        element.style.removeProperty('width');
    };
}

/**
 * Whether the overlay is in the top layer right now, and so placed in
 * window coordinates rather than against its containing block.
 *
 * @param {Element} element
 */
export const raised = (element) => element.matches(':popover-open');
