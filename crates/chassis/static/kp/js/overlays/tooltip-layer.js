// Tooltips: the layer a tooltip is drawn on [tip-1102].
//
// A tooltip lives in its anchor, next to its trigger, so the register's selectors (`.kp-tooltip-anchor > .kp-tooltip`, the
// `:has()` marks some themes draw on the anchor) and the trigger's `aria-describedby` keep working. In the anchor's own
// layer it was cut by a box round it that clips or contains: measured in Firefox 153, the fixed tooltip of a disabled Delete
// in a data table was placed and cut inside the table's scroll box (`.kp-table-wrap`, an inline-size container that
// scrolls), at the card's edge on a phone and under the next row on a laptop [kitchen-1101]. On the top layer nothing round the anchor can cut it: the tooltip is made a manual popover, shown and
// hidden with the tooltip, and placed by the same anchor positioning and position-try fallbacks as before
// (css/components/popover.css), so its look and place are the register's own wherever nothing cut it.
//
// `layer: 'inline'` (or `data-kp-tooltip-layer="inline"` on the anchor) keeps the tooltip in the anchor's layer, as it was
// before tip-1102, for a page that shows it by its `hidden` attribute alone.

/** The two layers a tooltip can be drawn on; `top` is the default. */
export const TOOLTIP_LAYERS = /** @type {const} */ (['top', 'inline']);
/** The attribute on a tooltip this module put on the top layer; the stylesheet keeps its tooltip placement for it. */
export const TOOLTIP_LAYER_ATTR = 'data-kp-tooltip-layer';

/**
 * The layer an anchor asks for: its own `data-kp-tooltip-layer`, else the call's, else `top`. An unknown word is said once in
 * the console and read as `top`, never silently taken.
 *
 * @param {HTMLElement} anchor @param {string | undefined} asked
 * @returns {'top' | 'inline'}
 */
export function layerOf(anchor, asked) {
    const word = anchor.dataset.kpTooltipLayer ?? asked ?? 'top';
    if (word === 'top' || word === 'inline') return word;
    console.warn(`kp-themes tooltip: unknown layer "${word}" on`, anchor, `(expected ${TOOLTIP_LAYERS.join(' or ')}); the top layer is used.`);
    return 'top';
}

/**
 * Make the tooltip a manual popover, unless it is one already or the browser has no popover API (then it stays in the
 * anchor's layer, as before). Returns whether it was promoted, so restore() can take exactly that back.
 *
 * @param {HTMLElement} tooltip
 */
export function promote(tooltip) {
    if (tooltip.hasAttribute('popover') || typeof tooltip.showPopover !== 'function') return false;
    tooltip.setAttribute('popover', 'manual');
    tooltip.setAttribute(TOOLTIP_LAYER_ATTR, 'top');
    return true;
}

/** Take the popover back off a tooltip promote() put on the top layer. @param {HTMLElement} tooltip */
export function demote(tooltip) {
    hideLayer(tooltip);
    tooltip.removeAttribute('popover');
    tooltip.removeAttribute(TOOLTIP_LAYER_ATTR);
}

/** Is the tooltip on the top layer now? @param {HTMLElement} tooltip */
export const onTopLayer = (tooltip) => tooltip.hasAttribute(TOOLTIP_LAYER_ATTR) && tooltip.matches(':popover-open');

/**
 * Put a promoted tooltip on the top layer (after its `hidden` was cleared). A tooltip that cannot be shown there (it left
 * the document between the timer and now, or the browser refuses) is said in the console and drawn in the anchor's layer
 * instead, so the reason is never lost.
 *
 * @param {HTMLElement} tooltip
 */
export function showLayer(tooltip) {
    if (!tooltip.hasAttribute(TOOLTIP_LAYER_ATTR) || tooltip.matches(':popover-open')) return;
    try {
        tooltip.showPopover();
    } catch (error) {
        console.warn('kp-themes tooltip: could not put the tooltip on the top layer; it is drawn in its anchor instead.', tooltip, error);
        tooltip.removeAttribute('popover');
        tooltip.removeAttribute(TOOLTIP_LAYER_ATTR);
    }
}

/** Take a promoted tooltip off the top layer (it stays a popover, closed). @param {HTMLElement} tooltip */
export function hideLayer(tooltip) {
    if (tooltip.hasAttribute(TOOLTIP_LAYER_ATTR) && tooltip.matches(':popover-open')) tooltip.hidePopover();
}
