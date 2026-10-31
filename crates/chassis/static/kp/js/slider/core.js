// A slider's state on the instance, and what every way of changing it shares: the paint that keeps the inputs, fill,
// bubbles and boxes in step, the allowed value, the events, the line under it, the state and setting values.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { buildLines } from './build.js';
import { SLIDER_CHANGE_EVENT, SLIDER_INPUT_EVENT, readOptions, sliderPercent, snapSlider, startValues, writers } from './values.js';

/** @typedef {import('../slider.js').SliderHandle} SliderHandle */

/** Numbers the sliders of a page that have no id, for the id of their line. */
let seq = 0;

export class SliderCore extends Controller {
    /** @param {HTMLElement} el */
    constructor(el) {
        super(el);
        this.s = getStrings();
        this.doc = el.ownerDocument;
        this.id = el.id || `kp-slider-${++seq}`;
        this.o = readOptions(el, this.s);
        this.w = writers(this.o, this.s);
        /** The page's inputs, or new ones: two for a range. @type {HTMLInputElement[]} */
        this.inputs = this.o.authored.slice(0, this.o.isRange ? 2 : 1);
        while (this.inputs.length < (this.o.isRange ? 2 : 1)) {
            const input = this.doc.createElement('input');
            input.type = 'range';
            this.inputs.push(input);
        }
        this.values = startValues(this.o, this.inputs.length);
        /** @type {HTMLElement[]} */
        this.bubbles = [];
        /** @type {HTMLInputElement[]} */
        this.boxes = [];
        this.pressed = false;
        const { why, skeleton } = buildLines(this.doc, this.id);
        this.why = why;
        this.skeleton = skeleton;
        /** @type {SliderHandle} */
        this.handle = { element: el, values: () => this.values.slice(), set: (next) => this.setValues(next), setState: (state) => this.setState(state), text: () => this.fullText() };
    }

    fullText() {
        const { min, max } = this.o;
        const v = this.values;
        return this.o.isRange ? `${this.w.text(v[0] ?? min)} – ${this.w.text(v[1] ?? max)}` : this.w.text(v[0] ?? min);
    }
    /** The field boxes, the fill, the bubbles and the unit text, in step with the values. */
    paint() {
        const { min, max, isRange } = this.o;
        const [a, b] = this.values;
        const el = this.host;
        el.style.setProperty('--kp-slider-from', String(isRange ? sliderPercent(a, min, max) / 100 : 0));
        el.style.setProperty('--kp-slider-to', String(sliderPercent(isRange ? b : a, min, max) / 100));
        for (const [i, input] of this.inputs.entries()) {
            const v = this.values[i] ?? 0;
            if (input.value !== String(v)) input.value = String(v);
            input.setAttribute('aria-valuetext', this.w.text(v));
            el.style.setProperty(`--kp-slider-at-${i}`, String(sliderPercent(v, min, max) / 100));
            const bubble = this.bubbles[i];
            if (bubble) bubble.textContent = this.w.text(v);
            const box = this.boxes[i];
            if (box && this.doc.activeElement !== box) box.value = this.w.plain(v);
        }
    }
    /** The value that is allowed for a thumb: snapped, and a range's thumbs kept the gap apart. @param {number} thumb @param {number} want */
    allowed(thumb, want) {
        const { min, max, step, gap } = this.o;
        const v = snapSlider(want, min, max, step);
        if (!this.o.isRange) return v;
        return thumb === 0 ? Math.min(v, snapSlider(this.values[1] - gap, min, max, step)) : Math.max(v, snapSlider(this.values[0] + gap, min, max, step));
    }
    /** @param {number} thumb */
    detailOf(thumb) {
        const v = this.values;
        return {
            values: v.slice(),
            value: v[thumb] ?? v[0],
            thumb: this.o.isRange ? (thumb === 0 ? 'low' : 'high') : 'only',
            text: this.o.isRange ? `${this.w.text(v[0])} – ${this.w.text(v[1])}` : this.w.text(v[0]),
        };
    }
    /** @param {string} type @param {number} thumb */
    emit(type, thumb) {
        this.host.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: this.detailOf(thumb) }));
    }
    /** @param {number} thumb @param {boolean} commit */
    announce(thumb, commit) {
        this.emit(SLIDER_INPUT_EVENT, thumb);
        if (commit) this.emit(SLIDER_CHANGE_EVENT, thumb);
    }
    clearWhy() {
        this.why.hidden = true;
        this.why.textContent = '';
        for (const box of this.boxes) {
            box.removeAttribute('aria-invalid');
            box.removeAttribute('aria-describedby');
        }
    }
    /** @param {number} thumb @param {number} want @param {boolean} commit */
    move(thumb, want, commit) {
        const next = this.allowed(thumb, want);
        const changed = next !== this.values[thumb];
        this.values[thumb] = next;
        this.paint();
        this.clearWhy();
        if (changed || commit) this.announce(thumb, commit);
    }
    /** `loading` shows the skeleton and switches the slider off. @param {'ready' | 'loading'} state */
    setState(state) {
        const loading = state === 'loading';
        this.skeleton.hidden = !loading;
        this.host.toggleAttribute('aria-busy', loading);
        if (loading) this.host.dataset.kpState = 'loading';
        else delete this.host.dataset.kpState;
        for (const control of [...this.inputs, ...this.boxes]) control.disabled = loading || this.o.disabledByPage;
    }
    /** Replace the values from a script, without the event. @param {readonly number[]} next */
    setValues(next) {
        const { min, max, step, gap, isRange } = this.o;
        this.values = this.inputs.map((_, i) => snapSlider(next[i] ?? this.values[i] ?? min, min, max, step));
        if (isRange && this.values[0] > this.values[1] - gap) this.values = [Math.min(this.values[0], this.values[1] - gap), this.values[1]];
        this.paint();
        this.clearWhy();
    }
}
