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
//
// A task that failed is a state of the bar [kyu-plates-1019]: `setProgressFailed(bar, { title, text, art })` takes the bar's row
// (its `.kp-progress__wrap`, label and reading with it) out of sight and puts the package's failed plate in its place, set at the
// heading size with a normal-size Retry that fires `kp-progressbar-retry` on the bar (bubbling); `setProgressFailed(bar, null)`,
// `setProgress()` and `setIndeterminate(bar, true)` bring the bar back. A bar is one line high, so the plate is as wide as the row
// and as high as its words need: the one state of a one-line component that cannot keep its height.

import { hostStatePlate } from './state-plate.js';
import { getStrings } from './strings.js';
import { Controller, attachAll } from './controller.js';

/** The bars this module looks after. */
export const PROGRESSBAR_SELECTOR = '.kp-progressbar';

/** The custom property the bar paints from, 0 to 1. */
export const VALUE_PROPERTY = '--kp-value';

/** Fired on a bar, bubbling, when the Retry of its failed state is pressed [kyu-plates-1019]. */
export const PROGRESSBAR_RETRY_EVENT = 'kp-progressbar-retry';

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
    clearFailure(el);
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
    if (on) clearFailure(el);
    if (on) {
        el.setAttribute(INDETERMINATE_ATTRIBUTE, '');
        el.removeAttribute('aria-valuenow');
    } else {
        el.removeAttribute(INDETERMINATE_ATTRIBUTE);
        syncProgressbar(el);
    }
}

/** The plate of each failed bar, and the row it replaced. @type {WeakMap<Element, { plate: HTMLElement, row: HTMLElement }>} */
const FAILED = new WeakMap();

/** @param {HTMLElement} el */
function clearFailure(el) {
    const failed = FAILED.get(el);
    if (!failed) return;
    FAILED.delete(el);
    failed.plate.remove();
    failed.row.hidden = false;
    el.removeAttribute('data-kp-state');
    el.removeAttribute('aria-valuetext');
}

/**
 * @typedef {object} ProgressFailure
 * @property {string} [title] what failed, in one line (the plate's heading); else the dictionary's
 * @property {string} [text] one sentence more: why (else the package's own)
 * @property {Node | string | null} [art] a picture over the heading
 */

/**
 * The bar's task failed (`failure`), or did not any more (`null`). The bar's row is out of sight and the package's failed plate
 * stands in its place with a Retry (`kp-progressbar-retry` on the bar, bubbling); the bar says the title as its `aria-valuetext`.
 * Called again it rewrites the plate, never a second one.
 *
 * @param {HTMLElement} el
 * @param {ProgressFailure | null} failure
 */
export function setProgressFailed(el, failure) {
    if (failure === null) return clearFailure(el);
    const had = FAILED.get(el);
    const row = had?.row ?? /** @type {HTMLElement} */ (el.closest('.kp-progress__wrap') ?? el);
    const width = row.getBoundingClientRect().width;
    const height = row.getBoundingClientRect().height;
    had?.plate.remove();
    const title = failure.title ?? getStrings().progressFailed;
    const plate = hostStatePlate(el, {
        kind: 'error',
        title,
        ...(failure.text ? { text: failure.text } : {}),
        art: failure.art,
        retryEvent: PROGRESSBAR_RETRY_EVENT,
    });
    plate.classList.add('kp-progressbar__plate');
    if (width > 0 && !had) plate.style.setProperty('max-inline-size', `${Math.round(width)}px`);
    else if (had) plate.style.setProperty('max-inline-size', had.plate.style.getPropertyValue('max-inline-size'));
    if (height > 0 && !had) plate.style.setProperty('min-block-size', `${Math.round(height)}px`);
    row.after(plate);
    row.hidden = true;
    el.setAttribute('data-kp-state', 'error');
    el.setAttribute('aria-valuetext', title);
    FAILED.set(el, { plate, row });
}

/** One progress bar: built and synced, then kept in step with its ARIA. */
class ProgressbarController extends Controller {
    connect() {
        const bar = this.host;
        syncProgressbar(buildProgressbar(bar));
        if (typeof MutationObserver === 'undefined') return;
        this.observe(new MutationObserver((records) => this.onAria(records))).observe(bar, {
            attributes: true,
            attributeFilter: ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
        });
    }

    /** @param {MutationRecord[]} records */
    onAria(records) {
        for (const record of records) syncProgressbar(/** @type {HTMLElement} */ (record.target));
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
    return attachAll(root, PROGRESSBAR_SELECTOR, ProgressbarController);
}
