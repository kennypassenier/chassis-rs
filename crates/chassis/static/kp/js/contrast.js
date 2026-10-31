// Colour arithmetic a consumer may use [TH57].
//
// These primitives were in `gates/colour.mjs`, which is the package's own
// tooling and not something a consumer should import — I told the kp-soft
// session exactly that on 2026-09-04. Then the colour picker needed the
// contrast ratio, and the choice was to duplicate the maths or to move it
// where public things live. Duplicating is what this project spends most
// of its gates preventing, so it moved: `gates/colour.mjs` re-exports from
// here, and there is still one implementation.
//
// What a consumer gets from this is not a colour library. It is the exact
// measurement the contrast gate uses, so a picker, a preview or a check in
// someone else's app can answer the same question the same way rather than
// arriving at a second opinion.

/** Degrees in a full turn of the hue circle. */
const FULL_TURN = 360;
/** Degrees in one of the six sectors of the hue circle. */
const HUE_SECTOR = 60;
/** The sectors of the hue circle. */
const HUE_SECTORS = 6;
/** Saturation and lightness are written as percentages. */
const PERCENT = 100;
/** The linear/gamma switch the WCAG text names for a channel (the sRGB standard says 0.04045; pinned deliberately). */
const WCAG_LINEAR_LIMIT = 0.03928;
/** The slope of the linear part of the sRGB curve. */
const SRGB_LINEAR_SLOPE = 12.92;
/** The offset and the divisor of the gamma part of the sRGB curve. */
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA = 2.4;
/** The weights of the red, green and blue channels in relative luminance. */
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;
/** The flare WCAG adds to both luminances before it divides. */
const CONTRAST_FLARE = 0.05;
/** The WCAG ratio for body text (SC 1.4.3). */
const RATIO_TEXT = 4.5;
/** The WCAG ratio for large text and for non-text boundaries (SC 1.4.11). */
const RATIO_LARGE = 3;

/** @typedef {{h: number, s: number, l: number}} Hsl */
/** @typedef {[number, number, number]} Rgb sRGB in 0..1 */

/**
 * @param {string} text e.g. "hsl(40, 25%, 97%)"
 * @returns {Hsl}
 */
export function parseHsl(text) {
    const n = text.match(/-?[\d.]+/g);
    if (!n || n.length < 3) throw new Error(`not an hsl() value: ${text}`);
    return { h: Number(n[0]), s: Number(n[1]), l: Number(n[2]) };
}

/** @param {Hsl} c @returns {string} */
export function formatHsl({ h, s, l }) {
    /** @param {number} v @param {number} [p] */
    const r = (v, p = 0) => Number(v.toFixed(p));
    return `hsl(${r(h)}, ${r(s)}%, ${r(l)}%)`;
}

/** @param {Hsl} c @returns {Rgb} */
export function hslToRgb({ h, s, l }) {
    const S = s / PERCENT;
    const L = l / PERCENT;
    const c = (1 - Math.abs(2 * L - 1)) * S;
    const x = c * (1 - Math.abs(((h / HUE_SECTOR) % 2) - 1));
    const m = L - c / 2;
    const [r, g, b] = [
        [c, x, 0],
        [x, c, 0],
        [0, c, x],
        [0, x, c],
        [x, 0, c],
        [c, 0, x],
    ][Math.floor(h / HUE_SECTOR) % HUE_SECTORS];
    return [r + m, g + m, b + m];
}

/** @param {Rgb} rgb @returns {Hsl} */
export function rgbToHsl([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l: l * PERCENT };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = HUE_SECTOR * (((g - b) / d) % HUE_SECTORS);
    else if (max === g) h = HUE_SECTOR * ((b - r) / d + 2);
    else h = HUE_SECTOR * ((r - g) / d + 4);
    return { h: (h + FULL_TURN) % FULL_TURN, s: s * PERCENT, l: l * PERCENT };
}

/**
 * WCAG relative luminance. Note the 0.03928 threshold: it is the value the
 * specification names, and it differs slightly from the sRGB standard's
 * 0.04045. Pinned deliberately — this measures against WCAG.
 *
 * @param {Rgb} rgb
 */
export function luminance([r, g, b]) {
    /** @param {number} u */
    const f = (u) => (u <= WCAG_LINEAR_LIMIT ? u / SRGB_LINEAR_SLOPE : ((u + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA);
    return LUMA_RED * f(r) + LUMA_GREEN * f(g) + LUMA_BLUE * f(b);
}

/**
 * WCAG contrast ratio between two colours.
 *
 * @param {Rgb} a @param {Rgb} b
 */
export function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + CONTRAST_FLARE) / (lo + CONTRAST_FLARE);
}

/** Convenience: parse an authored value straight to sRGB. @param {string} text */
export const hsl = (text) => hslToRgb(parseHsl(text));

/**
 * Read a token off an element and return it as sRGB.
 *
 * The tokens are authored as `hsl(...)`, so this parses that. A theme that
 * ever emits another notation would need this to change, which is why the
 * gate that keeps every colour in the token layer exists.
 *
 * @param {string} token e.g. "--background"
 * @param {Element} [from]
 * @returns {Rgb | null} null when the token is absent or not an hsl() value
 */
export function tokenColour(token, from = document.documentElement) {
    const value = getComputedStyle(from).getPropertyValue(token).trim();
    if (value === '') return null;
    try {
        return hsl(value);
    } catch {
        return null;
    }
}

/**
 * Does this pair reach the level it needs?
 *
 * The three numbers are WCAG's, not this project's: 4.5 for body text
 * (SC 1.4.3), 3.0 for large text and for non-text boundaries (SC 1.4.11).
 *
 * @param {number} ratio
 * @param {'text' | 'large' | 'non-text'} kind
 */
export function meets(ratio, kind = 'text') {
    return ratio >= (kind === 'text' ? RATIO_TEXT : RATIO_LARGE);
}
