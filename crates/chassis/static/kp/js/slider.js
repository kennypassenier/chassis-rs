// The slider: one value, or a range with two thumbs [kpadopt5-time; kp-soft's sketch controls, a thermostat, a volume].
//
// A styled `<input type="range">` (the native one carries the keyboard, the screen reader and the touch), with the value
// in a small box beside the track that can be typed in (Kenny, 2026-10-17: "Invulvak ernaast"):
//
//   <div class="kp-slider" data-kp-slider data-kp-min="10" data-kp-max="30" data-kp-step="0.5" data-kp-value="21"
//        data-kp-unit="°C" aria-label="Temperature"></div>
//
// The script builds the track, the thumbs, the value box and the unit from the attributes; a page that writes its own
// `input[type=range]` (one or two) inside the box keeps them and gets the rest. `data-kp-slider="range"` is two thumbs
// (`data-kp-value="20,60"`) that never cross: `data-kp-min-gap` (the step) is the least between them.
//
// Options (markup, each with a default [KT6]):
//   data-kp-min, data-kp-max, data-kp-step    0, 100, 1
//   data-kp-value / data-kp-default           the value at first, and the one a double-click on a thumb goes back to
//   data-kp-slider-value  field | bubble | both | none: how the number is shown      field
//   data-kp-unit          text after the number: "°C", "%", "min"                      none
//   data-kp-format        number | percent | bytes | duration (the value is seconds)    number
//   data-kp-ticks         auto, or a list "0,25,50,75,100", each as `value` or `value:Label`   none
//   data-kp-commit        change | input: when `kp-slider-change` fires                change (on release)
//   data-kp-orientation   horizontal | vertical                                         horizontal
//   data-kp-name          the inputs' name for a form (`-min` and `-max` for a range)
//   data-kp-disabled with data-kp-disabled-reason    off, and the sentence that says why
//   data-kp-state="loading"   the track and the box as the package's skeleton, at their final size
//
// A bubble over the thumb while it is dragged or has the focus (`bubble`, `both`). The arrow keys step, Shift with an arrow
// steps ten times as far, Page Up and Page Down a tenth of the range, Home and End the ends; a typed value is read on Enter or
// when the box loses the focus, snapped to the step, and refused with a line under the slider (the slider keeps its last valid
// value) when it is not a number in range; Escape in the box puts the last valid value back. `aria-valuetext` carries the
// unit ("21 °C"). Fires `kp-slider-input` on every move and `kp-slider-change` when it is committed:
// `{ values, value, thumb, text }`. Nothing runs on import; attachSliders(root) returns a detach.

import { getStrings } from './strings.js';
import { formatBytes, resolveLocale } from './locale.js';
import { humanDuration } from './freshness.js';

/** A slider. */
export const SLIDER = '[data-kp-slider]';
/** Fired on the slider on every move by a person: `{ values, value, thumb, text }`. */
export const SLIDER_INPUT_EVENT = 'kp-slider-input';
/** Fired on the slider when a value is committed (on release, or at once with `data-kp-commit="input"`). */
export const SLIDER_CHANGE_EVENT = 'kp-slider-change';
/** The states a slider can be in. */
export const SLIDER_STATES = /** @type {const} */ (['ready', 'loading']);

/** @param {number} n */
const decimalsOf = (n) => {
    const text = String(n);
    const at = text.indexOf('.');
    return at < 0 ? 0 : text.length - at - 1;
};

/**
 * A value snapped to the step from the minimum, clamped, and without floating-point dust. Pure.
 * @param {number} value @param {number} min @param {number} max @param {number} step
 */
export function snapSlider(value, min, max, step) {
    const digits = Math.max(decimalsOf(step), decimalsOf(min));
    const snapped = min + Math.round((value - min) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(digits));
}

/**
 * Where a value stands along the track, 0 to 100. Pure.
 * @param {number} value @param {number} min @param {number} max
 */
export function sliderPercent(value, min, max) {
    return max === min ? 0 : ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
}

/**
 * A number typed in the box: the unit and spaces dropped, a comma read as the decimal; NaN when it is not a number. Pure.
 * @param {string} text @param {string} [unit]
 */
export function parseSliderText(text, unit = '') {
    let t = text.trim();
    if (unit && t.endsWith(unit)) t = t.slice(0, -unit.length);
    t = t.replace(/[\s ]/g, '').replace(',', '.');
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * @typedef {object} SliderHandle
 * @property {HTMLElement} element
 * @property {() => number[]} values one value, or two for a range
 * @property {(values: readonly number[]) => void} set replace the values (no event)
 * @property {(state: 'ready' | 'loading') => void} setState
 * @property {() => string} text the value as the box shows it
 */

/** @type {WeakMap<Element, SliderHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached slider. @param {Element} element */
export function slider(element) {
    return HANDLES.get(element) ?? null;
}

/**
 * The values of a slider.
 * @param {Element} element
 */
export function sliderValues(element) {
    return HANDLES.get(element)?.values() ?? [];
}

/**
 * Set the values of a slider from a script, without the event.
 * @param {Element} element @param {readonly number[]} values
 */
export function setSliderValues(element, values) {
    HANDLES.get(element)?.set(values);
}

/**
 * Put a slider in a state: `loading` shows its skeleton and switches it off.
 * @param {Element} element @param {'ready' | 'loading'} state
 */
export function setSliderState(element, state) {
    HANDLES.get(element)?.setState(state);
}

let seq = 0;

/**
 * Wire every slider under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSliders(root = document) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SLIDER) ? [root] : []),
        ...root.querySelectorAll(SLIDER),
    ]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const s = getStrings();
        const doc = el.ownerDocument;
        const id = el.id || `kp-slider-${++seq}`;
        const authored = /** @type {HTMLInputElement[]} */ ([...el.querySelectorAll('input[type="range"]')]);
        const isRange = el.dataset.kpSlider === 'range' || authored.length === 2;
        const first = authored[0];
        const min = Number(el.dataset.kpMin ?? first?.min ?? 0);
        const max = Number(el.dataset.kpMax ?? first?.max ?? 100);
        const step = Number(el.dataset.kpStep ?? first?.step ?? 1) || 1;
        const gap = Math.max(step, Number(el.dataset.kpMinGap) || step);
        const unit = el.dataset.kpUnit ?? (el.dataset.kpFormat === 'percent' ? '%' : '');
        const format = ['percent', 'bytes', 'duration'].includes(el.dataset.kpFormat ?? '') ? el.dataset.kpFormat : 'number';
        const show = ['bubble', 'both', 'none'].includes(el.dataset.kpSliderValue ?? '') ? el.dataset.kpSliderValue : 'field';
        const commitOnInput = el.dataset.kpCommit === 'input';
        const vertical = el.dataset.kpOrientation === 'vertical';
        const locale = resolveLocale(el.dataset.kpLocale, el);
        const label = el.getAttribute('aria-label') ?? s.sliderGroup;
        const name = el.dataset.kpName ?? '';
        const disabledByPage = el.hasAttribute('data-kp-disabled');
        const digits = Math.max(decimalsOf(step), decimalsOf(min));
        el.classList.add('kp-slider');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
        if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', label);
        el.dataset.kpSliderKind = isRange ? 'range' : 'single';
        el.dataset.kpSliderShow = show;
        // The number's place is an option with a default (field), switchable at runtime: change `data-kp-slider-value`
        // and the box and the bubble follow [Kenny, 2026-10-17 22:09: "no by default, but it should be optional"].
        const showWatch = new MutationObserver(() => {
            const next = ['bubble', 'both', 'none'].includes(el.dataset.kpSliderValue ?? '') ? el.dataset.kpSliderValue : 'field';
            if (el.dataset.kpSliderShow !== next) el.dataset.kpSliderShow = next;
        });
        showWatch.observe(el, { attributes: true, attributeFilter: ['data-kp-slider-value'] });
        if (vertical) el.dataset.kpVertical = '';

        /** Text of a value for the field's readout, the bubble and `aria-valuetext`. @param {number} v */
        const text = (v) => {
            if (format === 'bytes') return formatBytes(v, locale);
            if (format === 'duration') return humanDuration(v, s);
            const n = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(v);
            return unit ? `${n} ${unit}` : n;
        };
        /** The number alone, for the box (the unit stands beside it). @param {number} v */
        const plain = (v) =>
            format === 'number' || format === 'percent'
                ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(v)
                : text(v);
        const typed = format === 'number' || format === 'percent';

        // The inputs: the page's own, or built from the attributes.
        const wanted = isRange ? 2 : 1;
        /** @type {HTMLInputElement[]} */
        const inputs = authored.slice(0, wanted);
        while (inputs.length < wanted) {
            const input = doc.createElement('input');
            input.type = 'range';
            inputs.push(input);
        }
        const initial = (el.dataset.kpValue ?? '')
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number)
            .filter(Number.isFinite);
        const defaults = (el.dataset.kpDefault ?? '')
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number)
            .filter(Number.isFinite);
        /** @type {number[]} */
        let values = inputs.map((input, i) => {
            const own =
                initial[i] ??
                (authored[i]
                    ? Number(authored[i].value)
                    : isRange
                      ? i === 0
                          ? min + (max - min) * 0.25
                          : min + (max - min) * 0.75
                      : min + (max - min) / 2);
            return snapSlider(own, min, max, step);
        });
        if (isRange && values[0] > values[1] - gap) values = [values[0], Math.min(max, values[0] + gap)];

        const track = doc.createElement('div');
        track.className = 'kp-slider__track';
        const rail = doc.createElement('span');
        rail.className = 'kp-slider__rail';
        rail.setAttribute('aria-hidden', 'true');
        const fill = doc.createElement('span');
        fill.className = 'kp-slider__fill';
        rail.append(fill);
        track.append(rail);
        /** @type {HTMLElement[]} */
        const bubbles = [];
        for (const [i, input] of inputs.entries()) {
            input.classList.add('kp-slider__input');
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(values[i]);
            input.dataset.kpThumb = isRange ? (i === 0 ? 'low' : 'high') : 'only';
            if (name) input.name = isRange ? `${name}-${i === 0 ? 'min' : 'max'}` : name;
            input.setAttribute('aria-label', isRange ? (i === 0 ? s.sliderMin(label) : s.sliderMax(label)) : label);
            if (vertical) input.setAttribute('aria-orientation', 'vertical');
            track.append(input);
            // Built for every slider and shown by `data-kp-slider-show` (stamped from `data-kp-slider-value`), so the option
            // switches at runtime without a rebuild.
            {
                const bubble = doc.createElement('output');
                bubble.className = 'kp-slider__bubble';
                bubble.dataset.kpThumb = String(i);
                bubble.setAttribute('aria-hidden', 'true');
                track.append(bubble);
                bubbles.push(bubble);
            }
        }
        // Marks along the track, with their labels.
        const tickSpec = el.dataset.kpTicks;
        /** @type {{ at: number, label: string }[]} */
        const marks = [];
        if (tickSpec === 'auto') {
            const count = 4;
            for (let i = 0; i <= count; i++) {
                const v = snapSlider(min + ((max - min) * i) / count, min, max, step);
                marks.push({ at: v, label: text(v) });
            }
        } else if (tickSpec) {
            for (const part of tickSpec.split(',')) {
                const [raw, ...rest] = part.split(':');
                const v = Number(raw);
                if (Number.isFinite(v) && v >= min && v <= max) marks.push({ at: v, label: rest.length ? rest.join(':').trim() : text(v) });
            }
        }
        if (marks.length) {
            track.dataset.kpTicks = '';
            const ticks = doc.createElement('div');
            ticks.className = 'kp-slider__ticks';
            ticks.setAttribute('aria-hidden', 'true');
            for (const m of marks) {
                const tick = doc.createElement('span');
                tick.className = 'kp-slider__tick';
                tick.style.setProperty('--kp-slider-at', String(sliderPercent(m.at, min, max) / 100));
                const word = doc.createElement('span');
                word.className = 'kp-slider__tick-label';
                word.textContent = m.label;
                tick.append(word);
                ticks.append(tick);
            }
            track.append(ticks);
        }

        // The value boxes beside the track.
        /** @type {HTMLInputElement[]} */
        const boxes = [];
        const fields = doc.createElement('div');
        fields.className = 'kp-slider__fields';
        const why = doc.createElement('p');
        why.className = 'kp-field__error kp-slider__why';
        why.id = `${id}-why`;
        why.setAttribute('role', 'alert');
        why.hidden = true;
        {
            let longest = 0;
            // The longest text the box can show: the ends and twenty values between them (a size reads "9.9 GB", not "10 GB").
            for (let i = 0; i <= 20; i++) longest = Math.max(longest, plain(snapSlider(min + ((max - min) * i) / 20, min, max, step)).length);
            el.style.setProperty('--kp-slider-field-ch', String(Math.max(longest, 2) + 1));
            for (const [i, input] of inputs.entries()) {
                if (i === 1) {
                    const dash = doc.createElement('span');
                    dash.className = 'kp-slider__dash';
                    dash.setAttribute('aria-hidden', 'true');
                    dash.textContent = '–';
                    fields.append(dash);
                }
                const wrap = doc.createElement('span');
                wrap.className = 'kp-slider__field-wrap';
                const box = doc.createElement('input');
                box.type = 'text';
                box.className = 'kp-field__input kp-slider__field';
                box.inputMode = 'decimal';
                box.autocomplete = 'off';
                box.readOnly = !typed;
                box.setAttribute('aria-label', isRange ? (i === 0 ? s.sliderMin(label) : s.sliderMax(label)) : s.sliderValue(label));
                box.dataset.kpThumb = input.dataset.kpThumb ?? 'only';
                wrap.append(box);
                if (typed && unit) {
                    const u = doc.createElement('span');
                    u.className = 'kp-slider__unit';
                    u.setAttribute('aria-hidden', 'true');
                    u.textContent = unit;
                    wrap.append(u);
                }
                fields.append(wrap);
                boxes.push(box);
            }
        }
        const skeleton = doc.createElement('span');
        skeleton.className = 'kp-slider__skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        skeleton.hidden = true;
        const bar = doc.createElement('span');
        bar.className = 'kp-skeleton kp-skeleton--block kp-slider__bar';
        skeleton.append(bar);
        const body = doc.createElement('div');
        body.className = 'kp-slider__body';
        body.append(track);
        if (boxes.length) body.append(fields);
        el.replaceChildren(body, why, skeleton);

        /** The field boxes, the fill, the bubbles and the unit text, in step with `values`. */
        const paint = () => {
            const [a, b] = values;
            const from = isRange ? sliderPercent(a, min, max) / 100 : 0;
            const to = sliderPercent(isRange ? b : a, min, max) / 100;
            el.style.setProperty('--kp-slider-from', String(from));
            el.style.setProperty('--kp-slider-to', String(to));
            for (const [i, input] of inputs.entries()) {
                const v = values[i] ?? 0;
                if (input.value !== String(v)) input.value = String(v);
                input.setAttribute('aria-valuetext', text(v));
                el.style.setProperty(`--kp-slider-at-${i}`, String(sliderPercent(v, min, max) / 100));
                const bubble = bubbles[i];
                if (bubble) bubble.textContent = text(v);
                const box = boxes[i];
                if (box && doc.activeElement !== box) box.value = plain(v);
            }
        };

        /** @param {number} thumb @param {number} want @returns {number} the value that is allowed for that thumb */
        const allowed = (thumb, want) => {
            let v = snapSlider(want, min, max, step);
            if (isRange) {
                if (thumb === 0) v = Math.min(v, snapSlider(values[1] - gap, min, max, step));
                else v = Math.max(v, snapSlider(values[0] + gap, min, max, step));
            }
            return v;
        };
        const detailOf = (/** @type {number} */ thumb) => ({
            values: values.slice(),
            value: values[thumb] ?? values[0],
            thumb: isRange ? (thumb === 0 ? 'low' : 'high') : 'only',
            text: isRange ? `${text(values[0])} – ${text(values[1])}` : text(values[0]),
        });
        /** @param {number} thumb @param {boolean} commit */
        const announce = (thumb, commit) => {
            el.dispatchEvent(new CustomEvent(SLIDER_INPUT_EVENT, { bubbles: true, detail: detailOf(thumb) }));
            if (commit) el.dispatchEvent(new CustomEvent(SLIDER_CHANGE_EVENT, { bubbles: true, detail: detailOf(thumb) }));
        };
        const clearWhy = () => {
            why.hidden = true;
            why.textContent = '';
            for (const box of boxes) {
                box.removeAttribute('aria-invalid');
                box.removeAttribute('aria-describedby');
            }
        };

        /** @param {number} thumb @param {number} want @param {boolean} commit */
        const move = (thumb, want, commit) => {
            const next = allowed(thumb, want);
            const changed = next !== values[thumb];
            values[thumb] = next;
            paint();
            clearWhy();
            if (changed || commit) announce(thumb, commit);
        };

        /** @param {Event} event */
        const onInput = (event) => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            const thumb = inputs.indexOf(input);
            if (thumb < 0) return;
            const next = allowed(thumb, Number(input.value));
            if (next !== Number(input.value)) input.value = String(next);
            const changed = next !== values[thumb];
            values[thumb] = next;
            paint();
            clearWhy();
            if (changed) announce(thumb, commitOnInput);
        };
        /** @param {Event} event */
        const onChange = (event) => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            const thumb = inputs.indexOf(input);
            if (thumb < 0) return;
            if (!commitOnInput) el.dispatchEvent(new CustomEvent(SLIDER_CHANGE_EVENT, { bubbles: true, detail: detailOf(thumb) }));
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            const thumb = inputs.indexOf(input);
            if (thumb < 0 || input.disabled) return;
            const range = max - min;
            /** @type {number | null} */
            let delta = null;
            if (event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowUp')) delta = step * 10;
            else if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowDown')) delta = -step * 10;
            else if (event.key === 'PageUp') delta = Math.max(step, range / 10);
            else if (event.key === 'PageDown') delta = -Math.max(step, range / 10);
            if (delta === null) return;
            event.preventDefault();
            move(thumb, (values[thumb] ?? min) + delta, true);
        };
        /** @param {Event} event */
        const onReset = (event) => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            const thumb = inputs.indexOf(input);
            const to = defaults[thumb];
            if (thumb < 0 || to === undefined || input.disabled) return;
            move(thumb, to, true);
        };
        let pressed = false;
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            const input = /** @type {HTMLInputElement} */ (event.target);
            if (!inputs.includes(input)) return;
            // The thumb last touched stays on top, so two thumbs at the ends can both be taken.
            for (const other of inputs) other.style.zIndex = other === input ? '2' : '1';
            el.toggleAttribute('data-kp-dragging', true);
            pressed = true;
        };
        const onUp = () => {
            if (!pressed) return;
            pressed = false;
            el.removeAttribute('data-kp-dragging');
        };

        // The boxes: typed values are read on Enter or blur.
        /** @param {HTMLInputElement} box */
        const readBox = (box) => {
            const thumb = boxes.indexOf(box);
            const n = parseSliderText(box.value, unit);
            if (Number.isNaN(n) || n < min || n > max) {
                box.setAttribute('aria-invalid', 'true');
                box.setAttribute('aria-describedby', why.id);
                why.textContent = s.sliderInvalid(plain(min), plain(max), unit);
                why.hidden = false;
                return false;
            }
            const next = allowed(thumb, n);
            if (isRange && next !== snapSlider(n, min, max, step)) {
                box.setAttribute('aria-invalid', 'true');
                box.setAttribute('aria-describedby', why.id);
                why.textContent = s.sliderGap(plain(gap), unit);
                why.hidden = false;
                return false;
            }
            move(thumb, next, true);
            box.value = plain(values[thumb] ?? next);
            return true;
        };
        /** @param {KeyboardEvent} event */
        const onBoxKey = (event) => {
            const box = event.target;
            if (!(box instanceof HTMLInputElement) || !boxes.includes(box)) return;
            if (event.key === 'Enter') {
                event.preventDefault();
                readBox(box);
            } else if (event.key === 'Escape') {
                box.value = plain(values[boxes.indexOf(box)] ?? min);
                clearWhy();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                const thumb = boxes.indexOf(box);
                move(thumb, (values[thumb] ?? min) + (event.key === 'ArrowUp' ? step : -step) * (event.shiftKey ? 10 : 1), true);
            }
        };
        /** @param {FocusEvent} event */
        const onBoxBlur = (event) => {
            const box = event.target;
            if (box instanceof HTMLInputElement && boxes.includes(box) && box.value !== plain(values[boxes.indexOf(box)] ?? min)) readBox(box);
        };

        /** @param {'ready' | 'loading'} state */
        const setState = (state) => {
            const loading = state === 'loading';
            skeleton.hidden = !loading;
            el.toggleAttribute('aria-busy', loading);
            if (loading) el.dataset.kpState = 'loading';
            else delete el.dataset.kpState;
            const off = loading || disabledByPage;
            for (const control of [...inputs, ...boxes]) control.disabled = off;
        };

        /** @type {SliderHandle} */
        const handle = {
            element: el,
            values: () => values.slice(),
            set(next) {
                values = inputs.map((_, i) => snapSlider(next[i] ?? values[i] ?? min, min, max, step));
                if (isRange && values[0] > values[1] - gap) values = [Math.min(values[0], values[1] - gap), values[1]];
                paint();
                clearWhy();
            },
            setState,
            text: () => (isRange ? `${text(values[0] ?? min)} – ${text(values[1] ?? max)}` : text(values[0] ?? min)),
        };
        HANDLES.set(el, handle);

        if (disabledByPage && el.dataset.kpDisabledReason) {
            why.classList.remove('kp-field__error');
            why.classList.add('kp-slider__reason');
            why.setAttribute('role', 'note');
            why.textContent = el.dataset.kpDisabledReason;
            why.hidden = false;
        }
        setState(el.dataset.kpState === 'loading' ? 'loading' : 'ready');
        paint();

        el.addEventListener('input', onInput);
        el.addEventListener('change', onChange);
        el.addEventListener('keydown', onKey);
        el.addEventListener('keydown', onBoxKey);
        el.addEventListener('dblclick', onReset);
        el.addEventListener('pointerdown', onDown);
        doc.addEventListener('pointerup', onUp);
        for (const box of boxes) box.addEventListener('blur', onBoxBlur);

        cleanups.push(() => {
            el.removeEventListener('input', onInput);
            el.removeEventListener('change', onChange);
            el.removeEventListener('keydown', onKey);
            el.removeEventListener('keydown', onBoxKey);
            el.removeEventListener('dblclick', onReset);
            el.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('pointerup', onUp);
            for (const box of boxes) box.removeEventListener('blur', onBoxBlur);
            showWatch.disconnect();
            HANDLES.delete(el);
            el.replaceChildren();
            for (const p of ['--kp-slider-from', '--kp-slider-to', '--kp-slider-field-ch', '--kp-slider-at-0', '--kp-slider-at-1'])
                el.style.removeProperty(p);
            delete el.dataset.kpSliderKind;
            delete el.dataset.kpSliderShow;
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
