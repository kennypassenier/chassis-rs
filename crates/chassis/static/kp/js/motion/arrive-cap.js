// How many elements of one batch of changes arrive: a note of 600 blocks must not play 600 entrances in one frame.

/** How many elements of one batch arrive when neither the attach nor the region names a number. */
export const ARRIVE_MAX = 12;
/** The attribute that sets the cap for a region of the page: a number, or `all` for no cap. */
export const ARRIVE_MAX_ATTRIBUTE = 'data-kp-arrive-max';

/**
 * The cap that applies under `el`: its closest `data-kp-arrive-max`, else `fallback`.
 * A value that is neither a whole number from 0 up nor `all` is a mistake in the page and is reported, then ignored.
 * @param {Element} el @param {number} fallback
 * @returns {number}
 */
export function arriveMaxOf(el, fallback) {
    const raw = el.closest(`[${ARRIVE_MAX_ATTRIBUTE}]`)?.getAttribute(ARRIVE_MAX_ATTRIBUTE)?.trim();
    if (raw === undefined || raw === '') return fallback;
    if (raw === 'all') return Infinity;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
    console.warn(`kp-themes: ${ARRIVE_MAX_ATTRIBUTE}="${raw}" is not a whole number or "all"; using ${fallback}.`);
    return fallback;
}

/**
 * The arrivals one batch may still play, per region: every region under its own closest cap, counted apart. A node that is
 * no longer connected (added and removed in the same batch) spends nothing, and an element is counted once however many
 * records of the batch name it (unhidden and added), so neither starves a real arrival [ovfix-1102 #5].
 *
 * The budget belongs to ONE batch of records: a note streamed in many callbacks gets its cap in each, by design (the cap
 * limits what plays in one frame, not what plays in total).
 * @param {number} fallback the cap where no region says another
 * @returns {(el: Element) => boolean} whether `el` may arrive; each yes uses one of its region's arrivals
 */
export function arriveBudget(fallback) {
    /** @type {Map<Element | null, number>} */
    const left = new Map();
    /** @type {WeakSet<Element>} */
    const counted = new WeakSet();
    return (el) => {
        if (!el.isConnected || counted.has(el)) return false;
        counted.add(el);
        const region = el.closest(`[${ARRIVE_MAX_ATTRIBUTE}]`);
        const rest = left.get(region) ?? arriveMaxOf(el, fallback);
        left.set(region, rest - 1);
        return rest > 0;
    };
}
