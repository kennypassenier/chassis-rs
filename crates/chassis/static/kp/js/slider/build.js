// Building a slider's parts: the track with its inputs, bubbles and marks, the value boxes beside it, the line under it
// and the loading skeleton.

import { sliderPercent, snapSlider } from './values.js';

/** @typedef {import('./values.js').SliderOptions} SliderOptions */
/** @typedef {ReturnType<typeof import('./values.js').writers>} Writers */
/** @typedef {ReturnType<typeof import('../strings.js').getStrings>} Strings */

/** The marks `data-kp-ticks="auto"` draws: the ends and this many steps between. */
const AUTO_TICKS = 4;
/** The values sampled to find the longest text the box can show (a size reads "9.9 GB", not "10 GB"). */
const WIDTH_SAMPLES = 20;
/** The least width of a box [ch], before the one character of room it gets. */
const MIN_FIELD_CH = 2;

/** @param {Document} doc @param {string} tag @param {string} className */
function make(doc, tag, className) {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
}

/** @param {HTMLElement} node */
const hidden = (node) => {
    node.setAttribute('aria-hidden', 'true');
    return node;
};

/** What a thumb is called: the low or high end of a range, or the slider itself. @param {SliderOptions} o @param {Strings} s @param {number} i */
const thumbName = (o, s, i) => (o.isRange ? (i === 0 ? s.sliderMin(o.label) : s.sliderMax(o.label)) : o.label);

/**
 * The track: the rail and its fill, each input with its bubble (built for every slider and shown by `data-kp-slider-show`,
 * so the option switches at runtime without a rebuild), and the marks.
 * @param {Document} doc @param {SliderOptions} o @param {HTMLInputElement[]} inputs @param {number[]} values @param {Writers} w @param {Strings} s
 */
export function buildTrack(doc, o, inputs, values, w, s) {
    const track = make(doc, 'div', 'kp-slider__track');
    const rail = hidden(make(doc, 'span', 'kp-slider__rail'));
    rail.append(make(doc, 'span', 'kp-slider__fill'));
    track.append(rail);
    /** @type {HTMLElement[]} */
    const bubbles = [];
    for (const [i, input] of inputs.entries()) {
        input.classList.add('kp-slider__input');
        input.min = String(o.min);
        input.max = String(o.max);
        input.step = String(o.step);
        input.value = String(values[i]);
        input.dataset.kpThumb = o.isRange ? (i === 0 ? 'low' : 'high') : 'only';
        if (o.name) input.name = o.isRange ? `${o.name}-${i === 0 ? 'min' : 'max'}` : o.name;
        input.setAttribute('aria-label', thumbName(o, s, i));
        if (o.vertical) input.setAttribute('aria-orientation', 'vertical');
        track.append(input);
        const bubble = make(doc, 'output', 'kp-slider__bubble');
        bubble.dataset.kpThumb = String(i);
        track.append(hidden(bubble));
        bubbles.push(bubble);
    }
    const ticks = buildTicks(doc, o, w);
    if (ticks) {
        track.dataset.kpTicks = '';
        track.append(ticks);
    }
    return { track, bubbles };
}

/**
 * The marks along the track, with their labels: `auto`, or a list of `value` or `value:label`.
 * @param {Document} doc @param {SliderOptions} o @param {Writers} w
 */
function buildTicks(doc, o, w) {
    const spec = o.ticks;
    /** @type {{ at: number, label: string }[]} */
    const marks = [];
    if (spec === 'auto') {
        for (let i = 0; i <= AUTO_TICKS; i++) {
            const v = snapSlider(o.min + ((o.max - o.min) * i) / AUTO_TICKS, o.min, o.max, o.step);
            marks.push({ at: v, label: w.text(v) });
        }
    } else if (spec) {
        for (const part of spec.split(',')) {
            const [raw, ...rest] = part.split(':');
            const v = Number(raw);
            if (Number.isFinite(v) && v >= o.min && v <= o.max) marks.push({ at: v, label: rest.length ? rest.join(':').trim() : w.text(v) });
        }
    }
    if (!marks.length) return null;
    const ticks = hidden(make(doc, 'div', 'kp-slider__ticks'));
    for (const m of marks) {
        const tick = make(doc, 'span', 'kp-slider__tick');
        tick.style.setProperty('--kp-slider-at', String(sliderPercent(m.at, o.min, o.max) / 100));
        const word = make(doc, 'span', 'kp-slider__tick-label');
        word.textContent = m.label;
        tick.append(word);
        ticks.append(tick);
    }
    return ticks;
}

/**
 * The value boxes beside the track (a dash between a range's two), sized to the longest text they can show.
 * @param {HTMLElement} el @param {SliderOptions} o @param {HTMLInputElement[]} inputs @param {Writers} w @param {Strings} s
 */
export function buildFields(el, o, inputs, w, s) {
    const doc = el.ownerDocument;
    const fields = make(doc, 'div', 'kp-slider__fields');
    /** @type {HTMLInputElement[]} */
    const boxes = [];
    let longest = 0;
    for (let i = 0; i <= WIDTH_SAMPLES; i++) longest = Math.max(longest, w.plain(snapSlider(o.min + ((o.max - o.min) * i) / WIDTH_SAMPLES, o.min, o.max, o.step)).length);
    el.style.setProperty('--kp-slider-field-ch', String(Math.max(longest, MIN_FIELD_CH) + 1));
    for (const [i, input] of inputs.entries()) {
        if (i === 1) {
            const dash = hidden(make(doc, 'span', 'kp-slider__dash'));
            dash.textContent = '–';
            fields.append(dash);
        }
        const wrap = make(doc, 'span', 'kp-slider__field-wrap');
        const box = /** @type {HTMLInputElement} */ (make(doc, 'input', 'kp-field__input kp-slider__field'));
        box.type = 'text';
        box.inputMode = 'decimal';
        box.autocomplete = 'off';
        box.readOnly = !o.typed;
        box.setAttribute('aria-label', o.isRange ? thumbName(o, s, i) : s.sliderValue(o.label));
        box.dataset.kpThumb = input.dataset.kpThumb ?? 'only';
        wrap.append(box);
        if (o.typed && o.unit) {
            const u = hidden(make(doc, 'span', 'kp-slider__unit'));
            u.textContent = o.unit;
            wrap.append(u);
        }
        fields.append(wrap);
        boxes.push(box);
    }
    return { fields, boxes };
}

/** The line under the slider (an error, or the reason it is off) and the loading skeleton. @param {Document} doc @param {string} id */
export function buildLines(doc, id) {
    const why = make(doc, 'p', 'kp-field__error kp-slider__why');
    why.id = `${id}-why`;
    why.setAttribute('role', 'alert');
    why.hidden = true;
    const skeleton = hidden(make(doc, 'span', 'kp-slider__skeleton'));
    skeleton.hidden = true;
    skeleton.append(make(doc, 'span', 'kp-skeleton kp-skeleton--block kp-slider__bar'));
    return { why, skeleton };
}
