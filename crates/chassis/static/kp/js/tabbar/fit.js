// A bar whose labels do not fit their tabs tightens them before any is cut [habits-1101 theme-sweep].
//
// Five tabs on a 390 px phone leave each label about 70 px; "CALENDAR" in brutalism's bold spaced capitals or deco's
// wide tracking needs more, and the label ended in an ellipsis. The bar steps through what the theme allows, the
// whole bar at once so every label keeps one size and one tracking: `data-kp-tabbar-fit="tight"` closes the tracking
// (`--kp-tabbar-tight-tracking`, a register's own), `"small"` also lowers the size (`--kp-tabbar-small-size`). Only
// then does a label still too long end in its ellipsis. It is measured again whenever the bar changes size, its tabs
// are redrawn or the fonts arrive.

/** The steps, loosest first; '' is the bar as the theme draws it. */
export const TABBAR_FIT_STEPS = /** @type {const} */ (['', 'tight', 'small']);
export const TABBAR_FIT_ATTRIBUTE = 'data-kp-tabbar-fit';

/** Whether any label is cut now (half a pixel is rounding, not a cut). @param {HTMLElement} bar */
function anyCut(bar) {
    for (const label of bar.querySelectorAll('.kp-tabbar__label')) {
        const el = /** @type {HTMLElement} */ (label);
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) return true;
    }
    return false;
}

/**
 * Sets the loosest step at which no label is cut, or the last step when none is. A hidden bar (above its width) is
 * left as the theme draws it, and measured again when it shows.
 * @param {HTMLElement} bar
 * @returns {string} the step set
 */
export function fitTabbar(bar) {
    for (const step of TABBAR_FIT_STEPS) {
        if (step) bar.setAttribute(TABBAR_FIT_ATTRIBUTE, step);
        else bar.removeAttribute(TABBAR_FIT_ATTRIBUTE);
        if (!anyCut(bar)) return step;
    }
    return TABBAR_FIT_STEPS[TABBAR_FIT_STEPS.length - 1];
}
