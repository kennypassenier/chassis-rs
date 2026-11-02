// Whether a box holds what is inside it in a stacking context of its own, read from its computed style.

/** The `will-change` values and `contain` words that make a box a stacking context. */
const CONTEXT_WILL_CHANGE = /(^|,\s*)(transform|opacity|filter|backdrop-filter|perspective|clip-path|mask|mask-image|isolation|mix-blend-mode|translate|rotate|scale|offset-path)(\s*,|$)/;
const CONTEXT_CONTAIN = /\b(paint|layout|strict|content)\b/;

/**
 * A positioned box with a z-index, a sticky or fixed box, a flex or grid item with a z-index (positioned or not), and a box
 * with a transform, filter, backdrop-filter, perspective, clip-path, mask, an opacity under 1, isolation, a blend mode,
 * containment of paint or layout, or a `will-change` naming one of those. A later box on the same layer paints over what
 * is inside any of them, whatever the inner z-index.
 * @param {CSSStyleDeclaration} style the box
 * @param {CSSStyleDeclaration | null} parent its parent, for the flex or grid item test
 */
export function formsStackingContext(style, parent) {
    if (style.position === 'sticky' || style.position === 'fixed') return true;
    if (style.zIndex !== 'auto' && (style.position !== 'static' || /flex|grid/.test(parent?.display ?? ''))) return true;
    if (style.transform !== 'none' || style.translate !== 'none' || style.rotate !== 'none' || style.scale !== 'none') return true;
    if (style.filter !== 'none' || style.backdropFilter !== 'none' || style.perspective !== 'none') return true;
    if (style.clipPath !== 'none' || (style.maskImage ?? 'none') !== 'none') return true;
    if (Number(style.opacity) < 1 || style.isolation === 'isolate' || style.mixBlendMode !== 'normal') return true;
    return CONTEXT_CONTAIN.test(style.contain) || CONTEXT_WILL_CHANGE.test(style.willChange);
}
