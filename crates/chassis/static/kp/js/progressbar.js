// The progress bar's value, kept in one place [scope-140].
//
// `.kp-progressbar` draws from `--kp-value`, the share done from 0 to 1, and
// a screen reader reads `aria-valuenow` against `aria-valuemin` and
// `aria-valuemax`. Two numbers for one fact drift the first time a consumer
// updates one of them, so this module makes the ARIA the source: a consumer
// sets `aria-valuenow` (or calls `setProgress`) and the paint follows.
//
// It also writes the bar's inner parts when the markup carries only the
// outer element, so a consumer's markup can stay one line:
//
//   <div class="kp-progressbar" role="progressbar" aria-label="Export" aria-valuenow="35"></div>
//
// Without this module the bar still paints: `--kp-value` in the style
// attribute is the whole contract, and the parts are plain spans.

/** The bars this module looks after. */
export const PROGRESSBAR_SELECTOR = '.kp-progressbar';

/** The custom property the bar paints from, 0 to 1. */
export const VALUE_PROPERTY = '--kp-value';

/** The attribute that says "busy, no idea how far". */
export const INDETERMINATE_ATTRIBUTE = 'data-kp-indeterminate';

/** @param {Element} el @param {string} name @param {number} fallback */
const numberAttribute = (el, name, fallback) => {
    const raw = el.getAttribute(name);
    const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

/**
 * Write the track, the fill and the head into a bar that has no track yet.
 * A bar that has one is left alone, so markup a framework owns is never
 * written twice.
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement} the bar
 */
export function buildProgressbar(el) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'progressbar');
    if (el.querySelector(':scope > .kp-progressbar__track')) return el;
    const track = document.createElement('span');
    track.className = 'kp-progressbar__track';
    track.setAttribute('aria-hidden', 'true');
    for (const part of ['fill', 'head']) {
        const span = document.createElement('span');
        span.className = `kp-progressbar__${part}`;
        track.append(span);
    }
    el.append(track);
    return el;
}

/**
 * Bring `--kp-value` in step with the bar's ARIA. A bar with no
 * `aria-valuenow` keeps whatever `--kp-value` it was given, so a consumer
 * who writes only the custom property is not overruled.
 *
 * @param {HTMLElement} el
 * @returns {number | null} the share written, or null when there was none to read
 */
export function syncProgressbar(el) {
    if (el.hasAttribute(INDETERMINATE_ATTRIBUTE) || !el.hasAttribute('aria-valuenow')) return null;
    const min = numberAttribute(el, 'aria-valuemin', 0);
    const max = numberAttribute(el, 'aria-valuemax', 100);
    const now = numberAttribute(el, 'aria-valuenow', min);
    const share = max > min ? Math.min(1, Math.max(0, (now - min) / (max - min))) : 0;
    el.style.setProperty(VALUE_PROPERTY, String(share));
    return share;
}

/**
 * Set how far the bar is, in the bar's own range (`aria-valuemin` to
 * `aria-valuemax`, 0 to 100 when they are absent). It leaves the busy state.
 *
 * @param {HTMLElement} el
 * @param {number} value
 */
export function setProgress(el, value) {
    const min = numberAttribute(el, 'aria-valuemin', 0);
    const max = numberAttribute(el, 'aria-valuemax', 100);
    el.removeAttribute(INDETERMINATE_ATTRIBUTE);
    el.setAttribute('aria-valuenow', String(Math.min(max, Math.max(min, value))));
    syncProgressbar(el);
}

/**
 * Turn "busy, no idea how far" on or off. On removes `aria-valuenow`, which
 * is how a screen reader learns the amount is unknown; off leaves the bar
 * at the value it is given next (or at `--kp-value`, until then).
 *
 * @param {HTMLElement} el
 * @param {boolean} on
 */
export function setIndeterminate(el, on) {
    if (on) {
        el.setAttribute(INDETERMINATE_ATTRIBUTE, '');
        el.removeAttribute('aria-valuenow');
    } else {
        el.removeAttribute(INDETERMINATE_ATTRIBUTE);
        syncProgressbar(el);
    }
}

/**
 * Build and sync every `.kp-progressbar` under `root`, and keep each in step
 * when its `aria-valuenow`, `aria-valuemin` or `aria-valuemax` changes
 * later. A bar rendered after this ran is attached by calling it again on
 * that subtree.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops following the attributes
 */
export function attachProgressbars(root = document) {
    const bars = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(PROGRESSBAR_SELECTOR) ? [root] : []),
        ...root.querySelectorAll(PROGRESSBAR_SELECTOR),
    ]);
    for (const bar of bars) syncProgressbar(buildProgressbar(bar));
    if (typeof MutationObserver === 'undefined' || bars.length === 0) return () => {};
    const watch = new MutationObserver((records) => {
        for (const record of records) syncProgressbar(/** @type {HTMLElement} */ (record.target));
    });
    for (const bar of bars) watch.observe(bar, { attributes: true, attributeFilter: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'] });
    return () => watch.disconnect();
}
