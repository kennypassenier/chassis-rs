// Pure rating arithmetic: clamping, snapping a value to the step and the scale, and plain numbers for sentences.

/** @param {number} n @param {number} lo @param {number} hi */
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A value snapped to the step and the scale. Pure. @param {number} value @param {number} max @param {number} step */
export function snapRating(value, max, step = 1) {
    if (!Number.isFinite(value)) return 0;
    return clamp(Math.round(value / step) * step, 0, max);
}

/** The numbers as a person says them: 4, 4.5, never 4.50 (a number, so a sentence prints it plain). Pure. @param {number} n */
export const plain = (n) => Number(n.toFixed(2));

/** The words for the levels, from `a|b|c` or a JSON list. @param {string | undefined} raw @returns {string[]} */
export function parseLabels(raw) {
    if (!raw) return [];
    const text = raw.trim();
    if (text.startsWith('[')) {
        try {
            const list = JSON.parse(text);
            return Array.isArray(list) ? list.map(String) : [];
        } catch {
            return [];
        }
    }
    return text.split('|').map((word) => word.trim());
}

/** The level a value is at, for the labels: 1 to max, 0 for none. @param {number} value */
export const levelOf = (value) => Math.ceil(value);
