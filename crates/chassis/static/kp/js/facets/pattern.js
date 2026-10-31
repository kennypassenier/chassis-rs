// The identity pattern on a facet swatch [kpadopt3]: the cells a seed gives, and the SVG drawn over the swatch's colour.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The 32-bit FNV-1a offset basis and prime. */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
/** The pattern is a 5 by 5 grid mirrored about its middle column: 3 columns of bits, 2 of them mirrored. */
const GRID = 5;
const HALF_COLUMNS = 3;
/** The hash bits below this are left alone, so the pattern does not move with the low bits other users of the hash take. */
const BIT_SKIP = 4;
/** The box the grid is drawn in: the grid and a one-cell margin. */
const PATTERN_BOX = 7;

/**
 * The cells of an identity pattern: FNV-1a over the seed, then a 5 by 5 grid mirrored about its middle column, a cell
 * filled where its bit is set. Pure and the same everywhere, so a name has one pattern on every page [kpadopt3].
 * @param {string} seed
 * @returns {[number, number][]} filled cells as [column, row], 0 to 4
 */
export function identityCells(seed) {
    let hash = FNV_OFFSET;
    for (const ch of seed) hash = Math.imul(hash ^ (ch.codePointAt(0) ?? 0), FNV_PRIME);
    hash >>>= 0;
    /** @type {[number, number][]} */
    const cells = [];
    for (let y = 0; y < GRID; y += 1)
        for (let x = 0; x < HALF_COLUMNS; x += 1)
            if ((hash >>> (y * HALF_COLUMNS + x + BIT_SKIP)) & 1) {
                cells.push([x, y]);
                if (x < HALF_COLUMNS - 1) cells.push([GRID - 1 - x, y]);
            }
    return cells;
}

/**
 * Draw (or take away) the identity pattern over a swatch: an SVG of the filled cells in the pattern's ink, inside a
 * one-cell margin, so the swatch's colour stays its ground.
 * @param {HTMLElement} swatch
 * @param {string | null} seed
 */
export function drawPattern(swatch, seed) {
    const old = swatch.querySelector(':scope > .kp-facet__pattern');
    if (!seed) {
        old?.remove();
        swatch.removeAttribute('data-kp-facet-pattern');
        return;
    }
    if (old && swatch.getAttribute('data-kp-facet-drawn') === seed) return;
    swatch.setAttribute('data-kp-facet-pattern', seed);
    swatch.setAttribute('data-kp-facet-drawn', seed);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kp-facet__pattern');
    svg.setAttribute('viewBox', `0 0 ${PATTERN_BOX} ${PATTERN_BOX}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
        'd',
        identityCells(seed)
            .map(([x, y]) => `M${x + 1} ${y + 1}h1v1h-1z`)
            .join(''),
    );
    svg.append(path);
    if (old) old.replaceWith(svg);
    else swatch.append(svg);
}
