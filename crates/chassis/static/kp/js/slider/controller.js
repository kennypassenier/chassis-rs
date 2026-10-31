// One wired slider: its markup built and taken down, and the ways a value changes (drag, keys, a double click back to
// the default, a typed box). The state and the paint are in core.js.

import { buildFields, buildTrack } from './build.js';
import { SliderCore } from './core.js';
import { SLIDER_CHANGE_EVENT, parseSliderText, showOf, snapSlider } from './values.js';

/** A Shift step is this many steps; Page Up and Down move a tenth of the range, at least one step. */
const BIG_STEP = 10;
const PAGE_SHARE = 10;
/** The custom properties the slider writes on itself, taken off on detach. */
const KNOBS = ['--kp-slider-from', '--kp-slider-to', '--kp-slider-field-ch', '--kp-slider-at-0', '--kp-slider-at-1'];

export class SliderControl extends SliderCore {

    connect() {
        this.stamp();
        this.build();
        this.showReason();
        this.setState(this.host.dataset.kpState === 'loading' ? 'loading' : 'ready');
        this.paint();
        this.own(() => this.unbuild());
        const el = this.host;
        this.listen(el, 'input', (event) => this.onInput(event));
        this.listen(el, 'change', (event) => this.onChange(event));
        this.listen(el, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'keydown', (event) => this.onBoxKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(el, 'dblclick', (event) => this.onReset(event));
        this.listen(el, 'pointerdown', (event) => this.onDown(event));
        this.listen(this.doc, 'pointerup', () => this.onUp());
        for (const box of this.boxes) this.listen(box, 'blur', (event) => this.onBoxBlur(event));
    }

    /** The host's role, name and kind, and where the number shows (switchable at runtime). */
    stamp() {
        const el = this.host;
        el.classList.add('kp-slider');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', this.o.label);
        el.dataset.kpSliderKind = this.o.isRange ? 'range' : 'single';
        el.dataset.kpSliderShow = this.o.show;
        // The number's place is an option with a default (field), switchable at runtime: change `data-kp-slider-value` and the
        // box and the bubble follow [Kenny, 2026-10-17 22:09: "no by default, but it should be optional"].
        this.observe(
            new MutationObserver(() => {
                const next = showOf(el);
                if (el.dataset.kpSliderShow !== next) el.dataset.kpSliderShow = next;
            }),
        ).observe(el, { attributes: true, attributeFilter: ['data-kp-slider-value'] });
        if (this.o.vertical) el.dataset.kpVertical = '';
    }

    build() {
        const { track, bubbles } = buildTrack(this.doc, this.o, this.inputs, this.values, this.w, this.s);
        this.bubbles = bubbles;
        const { fields, boxes } = buildFields(this.host, this.o, this.inputs, this.w, this.s);
        this.boxes = boxes;
        const body = this.doc.createElement('div');
        body.className = 'kp-slider__body';
        body.append(track);
        if (boxes.length) body.append(fields);
        this.host.replaceChildren(body, this.why, this.skeleton);
    }

    unbuild() {
        const el = this.host;
        el.replaceChildren();
        for (const p of KNOBS) el.style.removeProperty(p);
        delete el.dataset.kpSliderKind;
        delete el.dataset.kpSliderShow;
    }

    /** A slider the page switched off says why on its line. */
    showReason() {
        const el = this.host;
        if (!this.o.disabledByPage || !el.dataset.kpDisabledReason) return;
        this.why.classList.remove('kp-field__error');
        this.why.classList.add('kp-slider__reason');
        this.why.setAttribute('role', 'note');
        this.why.textContent = el.dataset.kpDisabledReason;
        this.why.hidden = false;
    }

    /** @param {Event} event */
    onInput(event) {
        const input = /** @type {HTMLInputElement} */ (event.target);
        const thumb = this.inputs.indexOf(input);
        if (thumb < 0) return;
        const next = this.allowed(thumb, Number(input.value));
        if (next !== Number(input.value)) input.value = String(next);
        const changed = next !== this.values[thumb];
        this.values[thumb] = next;
        this.paint();
        this.clearWhy();
        if (changed) this.announce(thumb, this.o.commitOnInput);
    }

    /** @param {Event} event */
    onChange(event) {
        const thumb = this.inputs.indexOf(/** @type {HTMLInputElement} */ (event.target));
        if (thumb >= 0 && !this.o.commitOnInput) this.emit(SLIDER_CHANGE_EVENT, thumb);
    }

    /** Shift+arrow moves ten steps, Page Up and Down a tenth of the range. @param {KeyboardEvent} event */
    onKey(event) {
        const input = /** @type {HTMLInputElement} */ (event.target);
        const thumb = this.inputs.indexOf(input);
        if (thumb < 0 || input.disabled) return;
        const { min, max, step } = this.o;
        const page = Math.max(step, (max - min) / PAGE_SHARE);
        const up = event.key === 'ArrowRight' || event.key === 'ArrowUp';
        const down = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
        /** @type {number | null} */
        let delta = null;
        if (event.shiftKey && up) delta = step * BIG_STEP;
        else if (event.shiftKey && down) delta = -step * BIG_STEP;
        else if (event.key === 'PageUp') delta = page;
        else if (event.key === 'PageDown') delta = -page;
        if (delta === null) return;
        event.preventDefault();
        this.move(thumb, (this.values[thumb] ?? min) + delta, true);
    }

    /** A double click puts a thumb back on its default (`data-kp-default`). @param {Event} event */
    onReset(event) {
        const input = /** @type {HTMLInputElement} */ (event.target);
        const thumb = this.inputs.indexOf(input);
        const to = this.o.defaults[thumb];
        if (thumb < 0 || to === undefined || input.disabled) return;
        this.move(thumb, to, true);
    }

    /** The thumb last touched stays on top, so two thumbs at the ends can both be taken. @param {Event} event */
    onDown(event) {
        const input = /** @type {HTMLInputElement} */ (event.target);
        if (!this.inputs.includes(input)) return;
        for (const other of this.inputs) other.style.zIndex = other === input ? '2' : '1';
        this.host.toggleAttribute('data-kp-dragging', true);
        this.pressed = true;
    }

    onUp() {
        if (!this.pressed) return;
        this.pressed = false;
        this.host.removeAttribute('data-kp-dragging');
    }

    /** @param {HTMLInputElement} box @param {string} words */
    invalid(box, words) {
        box.setAttribute('aria-invalid', 'true');
        box.setAttribute('aria-describedby', this.why.id);
        this.why.textContent = words;
        this.why.hidden = false;
        return false;
    }

    /** A typed value, read on Enter or blur: out of range, or too close to the other thumb, says why. @param {HTMLInputElement} box */
    readBox(box) {
        const { min, max, step, gap, unit, isRange } = this.o;
        const thumb = this.boxes.indexOf(box);
        const n = parseSliderText(box.value, unit);
        if (Number.isNaN(n) || n < min || n > max) return this.invalid(box, this.s.sliderInvalid(this.w.plain(min), this.w.plain(max), unit));
        const next = this.allowed(thumb, n);
        if (isRange && next !== snapSlider(n, min, max, step)) return this.invalid(box, this.s.sliderGap(this.w.plain(gap), unit));
        this.move(thumb, next, true);
        box.value = this.w.plain(this.values[thumb] ?? next);
        return true;
    }

    /** @param {KeyboardEvent} event */
    onBoxKey(event) {
        const box = event.target;
        if (!(box instanceof HTMLInputElement) || !this.boxes.includes(box)) return;
        const thumb = this.boxes.indexOf(box);
        if (event.key === 'Enter') {
            event.preventDefault();
            this.readBox(box);
        } else if (event.key === 'Escape') {
            box.value = this.w.plain(this.values[thumb] ?? this.o.min);
            this.clearWhy();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const by = (event.key === 'ArrowUp' ? this.o.step : -this.o.step) * (event.shiftKey ? BIG_STEP : 1);
            this.move(thumb, (this.values[thumb] ?? this.o.min) + by, true);
        }
    }

    /** @param {Event} event */
    onBoxBlur(event) {
        const box = event.target;
        if (box instanceof HTMLInputElement && this.boxes.includes(box) && box.value !== this.w.plain(this.values[this.boxes.indexOf(box)] ?? this.o.min)) this.readBox(box);
    }

}
