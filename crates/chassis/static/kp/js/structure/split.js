// The split pane [TH55]: a separator that resizes with the arrow keys and the pointer, vertically too, folding on a
// double click when asked, its place remembered.

import { Controller } from '../controller.js';
import { paintRemembered } from '../remember.js';
import { DEFAULTS, SPLIT_EVENT } from './shared.js';

/** @typedef {import('../structure.js').SplitHandle} SplitHandle */

/** The separator's range and start when its ARIA values say none [percent]. */
const MIN = '10';
const MAX = '90';
const START = '50';
/** A share of the pane's size, in percent. */
const PERCENT = 100;

export class SplitControl extends Controller {
    /** Whether the element is already wired: it carries the mark connect() stamps. @param {HTMLElement} element */
    static isAttached(element) {
        return element.dataset.kpSplitAttached !== undefined;
    }

    /** @param {HTMLElement} split @param {import('./shared.js').StructureOptions} [options] */
    constructor(split, options = DEFAULTS) {
        super(split, options);
        this.o = options;
        /** @type {HTMLElement | null} */
        this.separator = null;
        this.value = 0;
        this.initial = 0;
        /** The value before a double click folded the first pane away. */
        this.lastOpen = 0;
        /** @type {ReturnType<typeof paintRemembered>} */
        this.memory = null;
        /** Read from the pane and its separator at attach. */
        this.horizontal = false;
        this.step = options.splitStep;
        this.largeStep = options.splitLargeStep;
        this.collapses = false;
        this.min = Number(MIN);
        this.max = Number(MAX);
        /** @type {SplitHandle | null} null when the pane has no separator */
        this.handle = null;
    }

    connect() {
        const split = this.host;
        split.dataset.kpSplitAttached = '';
        // Where the divider was left, when the pane asked to be remembered [Kenny, 2026-09-16]. The painter writes
        // aria-valuenow, which is where the starting position is read from below.
        this.memory = paintRemembered(split, 'split');
        const separator = /** @type {HTMLElement | null} */ (split.querySelector('[role="separator"]'));
        // A pane without a separator stays marked and is left alone, as it always was.
        if (separator === null) return;
        this.separator = separator;
        // A separator between left and right is "vertical" in ARIA terms; a top/bottom split says data-kp-orientation="horizontal".
        this.horizontal = (split.dataset.kpOrientation ?? separator.getAttribute('aria-orientation') ?? 'vertical') === 'horizontal';
        this.step = Number.parseInt(split.dataset.kpStep ?? '', 10) || this.o.splitStep;
        this.largeStep = Number.parseInt(split.dataset.kpLargeStep ?? '', 10) || this.o.splitLargeStep;
        this.collapses = split.dataset.kpCollapse !== undefined || this.o.collapseOnDoubleClick;
        this.min = Number.parseInt(separator.getAttribute('aria-valuemin') ?? MIN, 10);
        this.max = Number.parseInt(separator.getAttribute('aria-valuemax') ?? MAX, 10);
        this.initial = Number.parseInt(separator.getAttribute('aria-valuenow') ?? START, 10);
        this.value = this.lastOpen = this.initial;
        const hadVar = split.style.getPropertyValue('--kp-split');
        this.setValue(this.value);
        this.own(() => {
            separator.setAttribute('aria-valuenow', String(this.initial));
            if (hadVar === '') split.style.removeProperty('--kp-split');
            else split.style.setProperty('--kp-split', hadVar);
            delete split.dataset.kpSplitAttached;
        });
        this.listen(separator, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(separator, 'pointerdown', (event) => this.onPointerDown(/** @type {PointerEvent} */ (event)));
        this.listen(separator, 'dblclick', () => this.onDoubleClick());
        this.handle = { element: split, value: () => this.value, setValue: (next) => this.setValue(next) };
    }

    /** @param {number} next */
    setValue(next) {
        this.value = Math.max(this.min, Math.min(this.max, Math.round(next)));
        this.host.style.setProperty('--kp-split', `${this.value}%`);
        // The value lives in aria-valuenow, not only in the style: a separator that moves silently is a separator only a
        // mouse can use.
        this.separator?.setAttribute('aria-valuenow', String(this.value));
        this.memory?.write('value', this.value);
        this.host.dispatchEvent(new CustomEvent(SPLIT_EVENT, { bubbles: true, detail: { value: this.value } }));
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const delta = event.shiftKey ? this.largeStep : this.step;
        const less = this.horizontal ? 'ArrowUp' : 'ArrowLeft';
        const more = this.horizontal ? 'ArrowDown' : 'ArrowRight';
        if (event.key === less) this.setValue(this.value - delta);
        else if (event.key === more) this.setValue(this.value + delta);
        else if (event.key === 'Home') this.setValue(this.min);
        else if (event.key === 'End') this.setValue(this.max);
        else return;
        event.preventDefault();
    }

    /** @param {PointerEvent} event */
    onPointerDown(event) {
        const separator = /** @type {HTMLElement} */ (this.separator);
        separator.setPointerCapture(event.pointerId);
        const move = (/** @type {PointerEvent} */ moved) => {
            const box = this.host.getBoundingClientRect();
            this.setValue(this.horizontal ? ((moved.clientY - box.top) / box.height) * PERCENT : ((moved.clientX - box.left) / box.width) * PERCENT);
        };
        const up = () => {
            separator.removeEventListener('pointermove', move);
            separator.removeEventListener('pointerup', up);
            separator.removeEventListener('pointercancel', up);
        };
        separator.addEventListener('pointermove', move);
        separator.addEventListener('pointerup', up);
        // A cancelled drag leaked its listeners in the first version.
        separator.addEventListener('pointercancel', up);
    }

    /** Double-click folds the first pane away and back again, when the pane says it collapses. */
    onDoubleClick() {
        if (!this.collapses) return;
        if (this.value > this.min) {
            this.lastOpen = this.value;
            this.setValue(this.min);
        } else this.setValue(this.lastOpen);
    }
}
