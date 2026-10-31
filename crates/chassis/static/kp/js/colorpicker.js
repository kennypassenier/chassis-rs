// Colour picker, framework-free [TH57].
//
// Three sliders and a swatch, which is not interesting. What is
// interesting is the number beside it: the WCAG contrast ratio of the
// chosen colour against the current theme's own background, measured with
// the same function the contrast gate uses.
//
// That is the one thing a colour picker in a theme system can do that a
// general-purpose one cannot. A picker that shows you a colour and not
// whether anyone can read it is how the unreadable colours got into the
// themes this project spent a milestone repairing.
//
//   <div class="kp-colorpicker" data-kp-colorpicker data-kp-against="--background">
//     <input type="range" data-kp-channel="h" min="0" max="360" value="220" />
//     <input type="range" data-kp-channel="s" min="0" max="100" value="90" />
//     <input type="range" data-kp-channel="l" min="0" max="100" value="56" />
//     <span class="kp-colorpicker__swatch" data-kp-swatch></span>
//     <output data-kp-colorpicker-value></output>
//     <p data-kp-colorpicker-contrast role="status" aria-live="polite"></p>
//   </div>
//
// Sliders rather than a canvas gradient on purpose: a canvas needs a
// pointer, and three labelled ranges are operable from the keyboard, read
// aloud correctly, and give the exact numbers back.
//
// Since 3.0.0 [KT6]: the colour is settable through the handle — the
// first version measured only on 'input', so a saved colour could not be
// restored; the event carries the ratio and the verdict, which are the
// picker's whole point; nothing fires at attach; the theme listener is
// optional; and detach restores what it wrote.

import { contrast, formatHsl, hslToRgb, meets, parseHsl, tokenColour } from './contrast.js';
import { getStrings } from './strings.js';
import { Controller, attachOne, controllerOf } from './controller.js';

const PICKER = '[data-kp-colorpicker]';
/** The three channels of a picker, in the order their sliders are wired. */
const CHANNELS = ['h', 's', 'l'];
/** The decimals of the ratio the report shows. */
const RATIO_DECIMALS = 2;

/** @typedef {{ h: number, s: number, l: number }} Hsl */
/** @typedef {{ value: string, h: number, s: number, l: number, ratio: number | null, ok: boolean | null, against: string }} ColourDetail */

/** Fired when the colour changes. A contract value [TH26]. Detail: ColourDetail. */
export const COLOR_EVENT = 'kp-color-change';

/**
 * @typedef {object} ColorPickerHandle
 * @property {HTMLElement} element
 * @property {() => ColourDetail} get
 * @property {(colour: Hsl | string) => void} set an object, or an hsl() string
 * @property {() => void} measure re-run the contrast measurement (after a theme or target change)
 */

/** @type {WeakMap<Element, ColorPickerHandle>} */
const handles = new WeakMap();

/** The handle for an attached picker. @param {Element} element */
export function colorPicker(element) {
    return handles.get(element) ?? null;
}

/** One colour picker: three sliders, a swatch, the value and the contrast report; its handle is what a page uses to set and measure. */
class ColorPickerController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        this.swatch = /** @type {HTMLElement | null} */ (host.querySelector('[data-kp-swatch]'));
        this.value = /** @type {HTMLElement | null} */ (host.querySelector('[data-kp-colorpicker-value]'));
        this.report = /** @type {HTMLElement | null} */ (host.querySelector('[data-kp-colorpicker-contrast]'));
        const followTheme = this.options.followTheme !== false;
        this.follow = host.dataset.kpFollowTheme === undefined ? followTheme : host.dataset.kpFollowTheme !== 'false';
        /** What the picker's parts held before it wrote into them, given back on destroy. */
        this.before = {
            swatch: this.swatch?.style.background ?? '',
            value: this.value?.textContent ?? '',
            report: this.report?.textContent ?? '',
        };
        /** @type {ColorPickerHandle} */
        this.handle = {
            element: host,
            get: () => this.update(false),
            set: (colour) => this.setColour(colour),
            measure: () => void this.update(false),
        };
    }

    connect() {
        const picker = this.host;
        picker.dataset.kpColorpickerAttached = '';
        this.own(() => {
            delete picker.dataset.kpColorpickerAttached;
        });
        this.own(() => handles.delete(picker));
        this.own(() => this.restore());
        const onInput = () => this.update(true);
        for (const channel of CHANNELS) {
            const input = this.slider(channel);
            if (input) this.listen(input, 'input', onInput);
        }
        // Remeasured when the document changes theme: the same colour is
        // readable on formal and invisible on terminal, which is the whole
        // reason this number is here.
        if (this.follow) this.listen(document, 'kp-theme-change', () => this.update(false));
        // Silently: nothing changed yet, so nothing is announced.
        this.update(false);
        handles.set(picker, this.handle);
    }

    /** Give the picker's parts back what they held before. */
    restore() {
        this.host.style.removeProperty('--kp-color');
        if (this.swatch !== null) this.swatch.style.background = this.before.swatch;
        if (this.value !== null) this.value.textContent = this.before.value;
        if (this.report !== null) this.report.textContent = this.before.report;
        delete this.host.dataset.kpContrastOk;
    }

    /**
     * Read on every update rather than captured at attach: a consumer may point the measurement at another token (the card instead of
     * the page) without detaching and reattaching the picker.
     */
    target() {
        return this.host.dataset.kpAgainst ?? '--background';
    }

    level() {
        return /** @type {'text' | 'large' | 'non-text'} */ (this.host.dataset.kpAgainstKind ?? 'text');
    }

    /** @param {string} channel */
    slider(channel) {
        return /** @type {HTMLInputElement | null} */ (this.host.querySelector(`[data-kp-channel="${channel}"]`));
    }

    /** @returns {Hsl} */
    read() {
        return {
            h: Number(this.slider('h')?.value ?? 0),
            s: Number(this.slider('s')?.value ?? 0),
            l: Number(this.slider('l')?.value ?? 0),
        };
    }

    /** @param {Hsl | string} colour an object, or an hsl() string */
    setColour(colour) {
        const hsl = typeof colour === 'string' ? parseHsl(colour) : colour;
        if (hsl === null) return;
        const h = this.slider('h');
        const s = this.slider('s');
        const l = this.slider('l');
        if (h) h.value = String(hsl.h);
        if (s) s.value = String(hsl.s);
        if (l) l.value = String(hsl.l);
        this.update(true);
    }

    /**
     * Paint the colour, measure it, and say the result.
     * @param {boolean} announce
     * @returns {ColourDetail}
     */
    update(announce) {
        const picker = this.host;
        const colour = this.read();
        const text = formatHsl(colour);
        picker.style.setProperty('--kp-color', text);
        if (this.swatch !== null) this.swatch.style.background = text;
        if (this.value !== null) this.value.textContent = text;
        const against = this.target();
        const { ratio, ok } = this.measure(colour, against);
        /** @type {ColourDetail} */
        const detail = { value: text, ...colour, ratio, ok, against };
        if (announce) picker.dispatchEvent(new CustomEvent(COLOR_EVENT, { bubbles: true, detail }));
        return detail;
    }

    /**
     * Measure the colour against the token and write the report and the ok mark.
     * @param {Hsl} colour
     * @param {string} against
     * @returns {{ ratio: number | null, ok: boolean | null }}
     */
    measure(colour, against) {
        const picker = this.host;
        const s = getStrings();
        const ground = tokenColour(against);
        if (ground === null) {
            // Said rather than left blank: a picker that silently
            // stops measuring looks exactly like one that says the
            // colour is fine.
            if (this.report !== null) this.report.textContent = s.contrastMissing(against);
            delete picker.dataset.kpContrastOk;
            return { ratio: null, ok: null };
        }
        const ratio = contrast(hslToRgb(colour), ground);
        const ok = meets(ratio, this.level());
        // The number AND the verdict: a bare 4.31 means nothing to
        // anyone who does not know the thresholds by heart.
        if (this.report !== null) {
            this.report.textContent = s.contrastReport(ratio.toFixed(RATIO_DECIMALS), against, ok ? s.contrastPasses : s.contrastFails);
        }
        if (ok) picker.dataset.kpContrastOk = '';
        else delete picker.dataset.kpContrastOk;
        return { ratio, ok };
    }
}

/**
 * @param {ParentNode} root
 * @param {{ followTheme?: boolean }} [options] re-measure on theme change (default true; per picker `data-kp-follow-theme="false"`)
 * @returns {(() => void) & { handles: ColorPickerHandle[] }} detach
 */
export function attachColorPickers(root = document, { followTheme = true } = {}) {
    // The root itself is never a picker host here: only what is under it, as before.
    const made = [...root.querySelectorAll(PICKER)]
        .map((found) => /** @type {HTMLElement} */ (found))
        .filter((picker) => !(picker.dataset.kpColorpickerAttached !== undefined || controllerOf(picker, ColorPickerController)))
        .map((picker) => attachOne(picker, ColorPickerController, { followTheme }))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.map((controller) => controller.handle) });
}
