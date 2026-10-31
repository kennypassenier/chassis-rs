// Measures how tall a box needs to be: line height and chrome of a computed style, and the exact fit on a hidden twin.

import { AUTOSIZE_MAX_LINES, AUTOSIZE_MIN_LINES, FALLBACK_FONT_PX, NORMAL_LINE_HEIGHT } from './constants.js';

/** @param {string} value @param {number} fallback */
export const px = (value, fallback = 0) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * The line height in px of a box: its computed value, else 1.2 times its font size (`normal`). Pure over a computed style.
 * @param {CSSStyleDeclaration} cs
 */
export function lineHeightOf(cs) {
    const n = Number.parseFloat(cs.lineHeight);
    return Number.isFinite(n) ? n : px(cs.fontSize, FALLBACK_FONT_PX) * NORMAL_LINE_HEIGHT;
}

/** The padding and border, top and bottom, in px. @param {CSSStyleDeclaration} cs */
export function chromeOf(cs) {
    return px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
}

/** Properties that decide how text wraps; copied to the measuring twin. */
const WRAP_PROPS = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'fontVariant',
    'fontStretch',
    'letterSpacing',
    'wordSpacing',
    'textTransform',
    'textIndent',
    'lineHeight',
    'tabSize',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'hyphens',
    'boxSizing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
];

/** Where the twin lives: out of the flow, hidden, collapsed, so measuring it moves nothing. */
const TWIN_STYLE =
    'position:absolute;visibility:hidden;pointer-events:none;inset-block-start:0;inset-inline-start:-9999px;block-size:0;min-block-size:0;max-block-size:none;overflow:hidden;resize:none;margin:0;';

/** @type {WeakMap<HTMLTextAreaElement, HTMLTextAreaElement>} */
const TWINS = new WeakMap();

/**
 * A hidden twin of the box, outside the flow, that holds the same text at the same width: measuring it changes nothing on
 * the page (collapsing the real box to measure it would move the scroll position under the reader's hand).
 * @param {HTMLTextAreaElement} area
 */
function twinOf(area) {
    let twin = TWINS.get(area);
    if (!twin || !twin.isConnected) {
        twin = area.ownerDocument.createElement('textarea');
        twin.setAttribute('aria-hidden', 'true');
        twin.setAttribute('tabindex', '-1');
        twin.readOnly = true;
        twin.rows = 1;
        twin.style.cssText = TWIN_STYLE;
        area.ownerDocument.body.append(twin);
        TWINS.set(area, twin);
    }
    return twin;
}

/** Take a box's measuring twin away. @param {HTMLTextAreaElement} area */
export function dropTwin(area) {
    TWINS.get(area)?.remove();
    TWINS.delete(area);
}

/**
 * The height a box needs for its text, between the least and the most lines. Measured on a twin, so it is exact and the page
 * does not move.
 *
 * @param {HTMLTextAreaElement} area
 * @param {import('./constants.js').FitOptions} [options]
 * @returns {{ height: number, scrolls: boolean, capped: boolean, lines: number, lineHeight: number }}
 */
export function fitTextarea(area, { minRows = AUTOSIZE_MIN_LINES, maxRows = AUTOSIZE_MAX_LINES, maxPx, keepPx = 0, apply = true } = {}) {
    const view = area.ownerDocument.defaultView;
    const cs = /** @type {Window} */ (view).getComputedStyle(area);
    const lh = lineHeightOf(cs);
    const chrome = chromeOf(cs);
    const twin = twinOf(area);
    const ts = twin.style;
    for (const name of WRAP_PROPS) /** @type {any} */ (ts)[name] = /** @type {any} */ (cs)[name];
    ts.inlineSize = `${area.getBoundingClientRect().width}px`;
    twin.value = area.value === '' ? ' ' : area.value;
    const border = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const content = twin.scrollHeight + border;
    const least = Math.max(1, minRows) * lh + chrome;
    let most = maxRows === null ? Number.POSITIVE_INFINITY : Math.max(maxRows, minRows) * lh + chrome;
    if (maxPx !== undefined) most = Math.max(least, Math.min(most, maxPx));
    const wanted = Math.max(least, keepPx, content);
    const height = Math.ceil(Math.min(most, wanted));
    const scrolls = content > height + 1;
    if (apply) {
        area.style.blockSize = `${height}px`;
        area.style.overflowY = scrolls ? 'auto' : 'hidden';
    }
    return { height, scrolls, capped: wanted > most, lines: Math.max(1, Math.round((twin.scrollHeight - (chrome - border)) / lh)), lineHeight: lh };
}

/** Whether this browser sizes a field to its content itself. */
export function cssAutosizeSupported() {
    return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}
