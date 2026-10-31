// What a bar's fold decides, as pure arithmetic: which items do not fit, and which separators fold with them.

/**
 * Which items do not fit: pure, so the arithmetic is read on its own.
 *
 * Items are kept from the start for as long as they fit beside the More
 * button; the first that does not fit folds with everything after it. An
 * item marked to keep stays in the bar wherever it is. When everything fits
 * without the More button, nothing folds.
 *
 * @param {object} at
 * @param {readonly number[]} at.widths each item's natural width
 * @param {number} at.gap the space between two items
 * @param {number} at.room the width the list has
 * @param {number} at.moreWidth the More item's width
 * @param {readonly boolean[]} [at.keep] items that never fold
 * @returns {boolean[]} per item: true when it folds
 */
export function planFold({ widths, gap, room, moreWidth, keep = [] }) {
    const n = widths.length;
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, n - 1);
    if (total <= room) return widths.map(() => false);
    const budget = room - moreWidth - gap;
    const fits = widths.map((_, i) => keep[i] === true);
    let count = fits.filter(Boolean).length;
    let used = widths.reduce((sum, w, i) => (fits[i] ? sum + w : sum), 0) + gap * Math.max(0, count - 1);
    for (let i = 0; i < n; i += 1) {
        if (fits[i]) continue;
        const next = used + widths[i] + (count > 0 ? gap : 0);
        if (next > budget) break;
        fits[i] = true;
        used = next;
        count += 1;
    }
    return fits.map((f) => !f);
}

/**
 * Which separators fold with the links around them: pure, beside planFold().
 *
 * Nothing folds while no link folds. Once one does, a separator stays only
 * where a shown link stands both before and after it in the bar, so no rule
 * is left at the start of the bar or against the More button.
 *
 * @param {readonly boolean[]} plan per item: true when it folds (planFold)
 * @param {readonly boolean[]} seps per item: true when it is a separator
 * @returns {boolean[]} the plan with the separators decided
 */
export function planSeparators(plan, seps) {
    const shown = plan.map((folds, i) => !folds && !seps[i]);
    if (!plan.some((folds, i) => folds && !seps[i])) return plan.map((folds, i) => (seps[i] ? false : folds));
    return plan.map((folds, i) => {
        if (!seps[i]) return folds;
        return !(shown.slice(0, i).includes(true) && shown.slice(i + 1).includes(true));
    });
}
