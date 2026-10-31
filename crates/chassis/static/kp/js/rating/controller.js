// One rating: its model (value, draft, preview, busy), the stars it draws, and its pointer, key, button and attribute handling.

import { Controller, attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { DEFAULT_STARS, DISPLAY_STEP, MAX_STARS, MIN_STARS, RATING_RETRY_EVENT } from './constants.js';
import { buildRating } from './build.js';
import { choose, commit, valueAt } from './commit.js';
import { onKey } from './keys.js';
import { clamp, parseLabels, snapRating } from './math.js';
import { paint } from './paint.js';
import { attr, interactive, state } from './read.js';

/** The attributes whose change draws the row again, rather than just reading the new value. */
const REDRAW = ['data-kp-rating-max', 'data-kp-rating-step', 'data-kp-rating-mode'];
/** The attributes the rating follows. */
const WATCHED = [
    ...REDRAW,
    'data-kp-rating-value',
    'data-kp-rating-labels',
    'data-kp-rating-size',
    'data-kp-rating-unrated-text',
    'data-kp-rating-clear',
    'data-kp-state',
    'data-kp-disabled',
    'data-kp-disabled-reason',
    'data-kp-readonly',
    'data-kp-rating-for',
    'aria-label',
    'data-kp-rating-count',
];

/** A star rating, to set or to read. */
export class RatingController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {import('./constants.js').RatingOptions} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        this.el = host;
        // The scale, the step, the mode and the value, read in `connect()`.
        this.max = DEFAULT_STARS;
        /** @type {1 | 0.5} */
        this.step = 1;
        /** @type {'input' | 'display'} */
        this.mode = 'input';
        this.value = 0;
        /** The pick held back by commit confirm, else the value. */
        this.draft = 0;
        /** The value under the pointer, or null. @type {number | null} */
        this.preview = null;
        /** @type {string[]} */
        this.labels = [];
        this.busy = false;
        this.flashTimer = 0;
        /** What the element held before the rating drew into it. @type {ChildNode[]} */
        this.before = [];
        // The parts, made in `connect()`.
        this.parts = /** @type {ReturnType<typeof buildRating>} */ (/** @type {unknown} */ (null));
        this.row = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.stars = /** @type {HTMLElement[]} */ ([]);
        this.caption = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.reason = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.flash = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.live = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        this.actions = /** @type {HTMLElement} */ (/** @type {unknown} */ (null));
        /** @type {HTMLInputElement | null} */
        this.field = null;
    }

    /** A number attribute, or the fallback. @param {string} name @param {number} fallback */
    num(name, fallback) {
        const raw = this.el.getAttribute(`data-kp-rating-${name}`);
        const n = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }

    /** The value's snap step: a display row shows a fraction of a star as it is. */
    get valueStep() {
        return this.mode === 'display' ? DISPLAY_STEP : this.step;
    }

    connect() {
        const { el } = this;
        const options = /** @type {import('./constants.js').RatingOptions} */ (this.options);
        this.max = Math.round(clamp(this.num('max', options.max ?? DEFAULT_STARS), MIN_STARS, MAX_STARS));
        this.step = el.getAttribute('data-kp-rating-step') === '0.5' || options.step === 0.5 ? 0.5 : 1;
        this.mode = (el.getAttribute('data-kp-rating-mode') ?? options.mode) === 'display' ? 'display' : 'input';
        this.value = this.draft = snapRating(this.num('value', 0), this.max, this.valueStep);
        this.before = [...el.childNodes];
        this.own(() => this.release());
        const parts = (this.parts = buildRating(el, this.max));
        Object.assign(this, {
            row: parts.row,
            stars: parts.stars,
            caption: parts.caption,
            reason: parts.reason,
            flash: parts.flash,
            live: parts.live,
            actions: parts.actions,
            field: parts.field,
        });
        this.labels = parseLabels(el.getAttribute('data-kp-rating-labels') ?? undefined);
        this.syncState();
        this.listen(parts.row, 'pointerover', (event) => this.onOver(/** @type {PointerEvent} */ (event)));
        this.listen(parts.row, 'pointerleave', () => this.onLeave());
        this.listen(parts.row, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        this.listen(parts.row, 'keydown', (event) => onKey(this, /** @type {KeyboardEvent} */ (event)));
        this.listen(parts.actions, 'click', (event) => this.onActions(/** @type {MouseEvent} */ (event)));
        this.listen(parts.retry, 'click', () => el.dispatchEvent(new CustomEvent(RATING_RETRY_EVENT, { bubbles: true })));
        this.observe(new MutationObserver((records) => this.onAttributes(records))).observe(el, { attributes: true, attributeFilter: WATCHED });
        this.own(() => window.clearTimeout(this.flashTimer));
    }

    /** Give the element back what it held before the rating drew into it. */
    release() {
        const { el } = this;
        el.replaceChildren(...this.before);
        el.removeAttribute('aria-busy');
        el.style.removeProperty('--kp-rating-max');
    }

    /** Show the failed-read plate or the loading look, and paint. */
    syncState() {
        const { failure, failureText, retry, row, foot } = this.parts;
        const st = state(this);
        const s = getStrings();
        failure.hidden = st !== 'error';
        failureText.textContent = s.ratingFailedRead;
        retry.textContent = s.ratingRetry;
        // The stars and their words stay laid out (hidden from sight and from the keyboard), so the plate that stands over them is exactly their size.
        row.inert = foot.inert = st === 'error';
        this.el.toggleAttribute('data-kp-loading', st === 'loading');
        paint(this);
    }

    /** A change of the scale, the step or the mode draws the row again; the other options are read as they are used. @param {MutationRecord[]} records */
    onAttributes(records) {
        if (records.some((r) => REDRAW.includes(r.attributeName ?? ''))) return this.redraw();
        this.labels = parseLabels(this.el.getAttribute('data-kp-rating-labels') ?? undefined);
        if (records.some((r) => r.attributeName === 'data-kp-rating-value'))
            this.value = this.draft = snapRating(this.num('value', this.value), this.max, this.valueStep);
        this.syncState();
    }

    /** Undo this rating and draw it again from the element's attributes, keeping the value. */
    redraw() {
        const { el, options } = this;
        const value = this.num('value', this.value);
        this.destroy();
        const next = attachOne(el, RatingController, options);
        if (!next) return;
        next.value = next.draft = snapRating(value, next.max, next.valueStep);
        paint(next);
    }

    /** @param {Event} event @returns {number} the star's number, 0 when none */
    starOf(event) {
        const star = event.target instanceof Element ? event.target.closest('.kp-rating__star') : null;
        return star instanceof HTMLElement ? Number(star.dataset.kpStar) : 0;
    }

    /** @param {PointerEvent} event */
    onOver(event) {
        if (attr(this, 'preview') === 'off' || event.pointerType !== 'mouse' || !interactive(this)) return;
        const n = this.starOf(event);
        if (!n) return;
        this.preview = valueAt(this, n, event);
        paint(this);
    }

    onLeave() {
        if (this.preview === null) return;
        this.preview = null;
        paint(this);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const n = this.starOf(event);
        if (!n || !interactive(this)) return;
        this.preview = null;
        choose(this, valueAt(this, n, event), 'pointer');
    }

    /** Clear, Save and Cancel. @param {MouseEvent} event */
    onActions(event) {
        const { clear, save, drop } = this.parts;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button) return;
        if (button === clear) commit(this, 0, 'clear');
        else if (button === save) commit(this, this.draft, 'pointer');
        else if (button === drop) {
            this.draft = this.value;
            paint(this);
        }
    }
}
