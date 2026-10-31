// Where an overlay's layout box lies: its bounding rectangle with its own rotate, translate and pure-move transform set aside.

/** How close to 45 degrees a turned box may be before it cannot be told back and stays as drawn (the determinant of the turn). */
const NEAR_DIAGONAL = 0.05;
/** One angle unit in radians, per CSS unit. */
const RADIANS_PER = { deg: Math.PI / 180, rad: 1, turn: 2 * Math.PI, grad: Math.PI / 200 };

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
    const unit = RADIANS_PER[/** @type {keyof typeof RADIANS_PER} */ (match[2])] ?? 0;
    const a = Number.parseFloat(match[1]) * unit;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const det = c * c - s * s;
    // Near 45 degrees the turned box cannot be told back; it stays as drawn.
    if (a === 0 || Math.abs(det) < NEAR_DIAGONAL) return box;
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

/** One part of a `translate` value as px: a length, or a percentage of the box. @param {string | undefined} part @param {number} size */
const lengthOf = (part, size) => {
    if (!part) return 0;
    const n = Number.parseFloat(part);
    if (!Number.isFinite(n)) return 0;
    return part.endsWith('%') ? (n / 100) * size : n;
};

/** How far a `translate` and a pure-move `transform` have carried the box. @param {HTMLElement} el @param {CSSStyleDeclaration} style @param {DOMRect} box @returns {{ x: number, y: number }} */
function offsetOf(el, style, box) {
    let x = 0;
    let y = 0;
    if (style.translate && style.translate !== 'none') {
        const parts = style.translate.split(/\s+/);
        x += lengthOf(parts[0], el.offsetWidth ?? box.width);
        y += lengthOf(parts[1], el.offsetHeight ?? box.height);
    }
    if (style.transform && style.transform !== 'none' && typeof DOMMatrixReadOnly === 'function') {
        const m = new DOMMatrixReadOnly(style.transform);
        // Only a pure move is set aside; a scale or a turn is left as drawn.
        if (m.is2D && m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) {
            x += m.e;
            y += m.f;
        }
    }
    return { x, y };
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
    const { x, y } = offsetOf(el, style, box);
    if (x === 0 && y === 0) return box;
    return new DOMRect(box.x - x, box.y - y, box.width, box.height);
}
