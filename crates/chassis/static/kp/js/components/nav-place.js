// Places a nav dropdown or mega panel inside the viewport.

/** What a bar item's dropdown is, as opposed to its mega menu's panel. */
export const DROPDOWN = ':scope > .kp-nav__menu:not(.kp-nav__menu--wide)';
/**
 * The box a bar's panel is actually seen in, in window coordinates
 * [fix-39].
 *
 * The window is only the outermost of them. Kenny's review of 2026-09-16
 * read the mega menu block inside the review dialog, whose stage carries
 * `contain: strict` and `overflow: auto` (catalogue/catalogue.css,
 * `.cat-review-dialog__stage`); the Account dropdown fitted the window by
 * 300px and the stage cut 70 to 83px off its right side all the same,
 * because the only reading anyone took was `clientWidth`. A consumer that
 * puts a bar in a panel that scrolls has the same box.
 *
 * Every ancestor that clips narrows the answer, read at its padding box —
 * a border and a scrollbar are not room to be seen in. The panel is
 * absolutely positioned, so every one of them is in its containing block's
 * chain and every one of them cuts it.
 *
 * @param {Element} element the panel
 * @returns {{ left: number, right: number }} the inline edges it must stay between
 */
const viewBox = (element) => {
    let left = 0;
    let right = document.documentElement.clientWidth;
    for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        // `contain` counts too, and on its own: `contain: paint` clips
        // while `overflow` still computes to `visible`.
        if (style.overflowX === 'visible' && !/\b(paint|strict|content)\b/.test(style.contain)) continue;
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left + node.clientLeft);
        right = Math.min(right, box.left + node.clientLeft + node.clientWidth);
    }
    return { left, right };
};
/**
 * How far a box lies outside the box that shows it, in pixels; 0 when inside.
 *
 * @param {DOMRect} box
 * @param {{ left: number, right: number }} view
 */
const overflowOf = (box, view) => Math.max(0, view.left - box.left) + Math.max(0, box.right - view.right);
/**
 * Slide a panel along the inline axis until it lies inside `view` [fix-39].
 *
 * Kenny, on the dropdown the review dialog cut: "Als er niet genoeg plaats
 * is moet het dropdown item naar links bewegen tot zijn rechterkant de
 * rechterkant van het venster is en alles dus zichtbaar is". So the panel
 * moves by exactly what hangs out, and never so far that the other side
 * leaves instead — a panel wider than the box keeps its start edge, where
 * a reader begins, rather than being centred on a cut.
 *
 * Written as `--kp-nav-menu-shift` (css/components.css), so the stylesheet
 * keeps the placement and this only corrects it.
 *
 * @param {Element} panel the panel, open and already on the edge it takes
 * @param {{ left: number, right: number }} view
 */
const slideIntoView = (panel, view) => {
    const element = /** @type {HTMLElement} */ (panel);
    element.style.removeProperty('--kp-nav-menu-shift');
    const box = element.getBoundingClientRect();
    if (box.width === 0) return;
    let shift = Math.min(0, view.right - box.right);
    // The start edge wins the tie: pulling it back in undoes as much of the
    // slide as it has to, and no more.
    if (box.left + shift < view.left) shift = view.left - box.left;
    // Sub-pixel shifts are the box's own rounding, not a cut.
    if (Math.abs(shift) < 1) return;
    element.style.setProperty('--kp-nav-menu-shift', `${Math.round(shift * 100) / 100}px`);
};
/**
 * Hang a bar item's open dropdown from whichever edge keeps it in the
 * window [fix-27].
 *
 * The panel hangs from its item's start edge. Under the last item of a bar
 * whose links sit at the window's end, that ran it past the window's right
 * edge in all 22 themes (grotesk's catalogue bar, Kenny's note of
 * 2026-09-14). A stylesheet cannot see where the window ends, so this
 * measures the open panel on both edges and keeps the one that lies less
 * outside — the start edge when both fit — writing
 * `data-kp-nav-menu-end` on the panel for the other. Both channels call it:
 * the module on hover and focus, the React NavBar from its item.
 *
 * Changing edges is not always enough, because the box that shows the bar
 * is not always the window [fix-39]: in a box that clips, both of an item's
 * edges can lie inside the window while the panel under it is cut. So the
 * edge is chosen against the box the panel is really seen in, and what
 * still hangs out afterwards is slid back in (`slideIntoView`).
 *
 * @param {Element} item the `.kp-nav__links > li` that holds the dropdown
 * @param {boolean} [retry] measure once more on the next frame when the panel is not open yet; default true
 * @returns {boolean} whether the panel now hangs from the end edge
 */
export function placeNavMenu(item, retry = true) {
    const menu = item.querySelector(DROPDOWN);
    if (!menu) return false;
    menu.removeAttribute('data-kp-nav-menu-end');
    /** @type {HTMLElement} */ (menu).style.removeProperty('--kp-nav-menu-shift');
    const start = menu.getBoundingClientRect();
    // Not open yet: a pointer that has just entered the item is not
    // `:hover` in the style until the next frame (measured in firefox), so
    // the panel is measured once more then. Still closed, nothing is written.
    if (start.width === 0) {
        if (retry) requestAnimationFrame(() => placeNavMenu(item, false));
        return false;
    }
    const view = viewBox(menu);
    const fromStart = overflowOf(start, view);
    let end = false;
    if (fromStart > 0) {
        menu.setAttribute('data-kp-nav-menu-end', '');
        end = overflowOf(menu.getBoundingClientRect(), view) < fromStart;
        if (!end) menu.removeAttribute('data-kp-nav-menu-end');
    }
    slideIntoView(menu, view);
    return end;
}
/**
 * Line an open mega menu's panel up with its bar's edges [scope-48].
 *
 * The panel is placed in whatever box contains it, and the registers
 * disagree about which box that is: the `.kp-nav-wrap` in the base, the
 * bar itself in eight registers, and cyberpunk's strip of links, which
 * must stay positioned because its cut-corner plate hangs from it. So the
 * bar is measured against that box, and the two offsets are written as
 * `--kp-nav-mega-start` and `--kp-nav-mega-end` on the panel.
 *
 * Lined up with its bar the panel is normally inside whatever shows the
 * bar, but it is placed against a box and judged against another, so it is
 * held to the same question the dropdown is [fix-39]: a bar wider than the
 * box that shows it would otherwise carry its panel out with it.
 *
 * @param {Element} panel the `.kp-nav__menu--wide`, open
 */
export function placeNavPanel(panel) {
    const element = /** @type {HTMLElement} */ (panel);
    const bar = element.closest('.kp-nav');
    const box = element.offsetParent;
    element.style.removeProperty('--kp-nav-menu-shift');
    if (!bar || !box || element.getBoundingClientRect().width === 0) return;
    const b = bar.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    // Offsets are taken from the padding box, inside the border.
    const left = b.left - (c.left + box.clientLeft);
    const right = c.left + box.clientLeft + box.clientWidth - b.right;
    const rtl = getComputedStyle(element).direction === 'rtl';
    element.style.setProperty('--kp-nav-mega-start', `${rtl ? right : left}px`);
    element.style.setProperty('--kp-nav-mega-end', `${rtl ? left : right}px`);
    slideIntoView(element, viewBox(element));
}
