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

const PICKER = '[data-kp-colorpicker]';

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

/**
 * @param {ParentNode} root
 * @param {{ followTheme?: boolean }} [options] re-measure on theme change (default true; per picker `data-kp-follow-theme="false"`)
 * @returns {(() => void) & { handles: ColorPickerHandle[] }} detach
 */
export function attachColorPickers(root = document, { followTheme = true } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {ColorPickerHandle[]} */
    const created = [];

    for (const element of root.querySelectorAll(PICKER)) {
        const picker = /** @type {HTMLElement} */ (element);
        if (picker.dataset.kpColorpickerAttached !== undefined) continue;
        picker.dataset.kpColorpickerAttached = '';

        const swatch = /** @type {HTMLElement | null} */ (picker.querySelector('[data-kp-swatch]'));
        const value = /** @type {HTMLElement | null} */ (picker.querySelector('[data-kp-colorpicker-value]'));
        const report = /** @type {HTMLElement | null} */ (picker.querySelector('[data-kp-colorpicker-contrast]'));
        const follow = picker.dataset.kpFollowTheme === undefined ? followTheme : picker.dataset.kpFollowTheme !== 'false';
        // Read on every update rather than captured at attach: a consumer
        // may point the measurement at another token — the card instead of
        // the page — without detaching and reattaching the picker.
        const target = () => picker.dataset.kpAgainst ?? '--background';
        const level = () => /** @type {'text' | 'large' | 'non-text'} */ (picker.dataset.kpAgainstKind ?? 'text');

        /** @param {string} channel */
        const slider = (channel) => /** @type {HTMLInputElement | null} */ (picker.querySelector(`[data-kp-channel="${channel}"]`));
        const before = { swatch: swatch?.style.background ?? '', value: value?.textContent ?? '', report: report?.textContent ?? '' };

        /** @returns {Hsl} */
        const read = () => ({ h: Number(slider('h')?.value ?? 0), s: Number(slider('s')?.value ?? 0), l: Number(slider('l')?.value ?? 0) });

        /** @param {boolean} announce @returns {ColourDetail} */
        const update = (announce) => {
            const colour = read();
            const text = formatHsl(colour);
            picker.style.setProperty('--kp-color', text);
            if (swatch !== null) swatch.style.background = text;
            if (value !== null) value.textContent = text;

            const against = target();
            const kind = level();
            const ground = tokenColour(against);
            /** @type {number | null} */
            let ratio = null;
            /** @type {boolean | null} */
            let ok = null;
            const s = getStrings();
            if (ground === null) {
                // Said rather than left blank: a picker that silently
                // stops measuring looks exactly like one that says the
                // colour is fine.
                if (report !== null) report.textContent = s.contrastMissing(against);
                delete picker.dataset.kpContrastOk;
            } else {
                ratio = contrast(hslToRgb(colour), ground);
                ok = meets(ratio, kind);
                // The number AND the verdict: a bare 4.31 means nothing to
                // anyone who does not know the thresholds by heart.
                if (report !== null) report.textContent = s.contrastReport(ratio.toFixed(2), against, ok ? s.contrastPasses : s.contrastFails);
                if (ok) picker.dataset.kpContrastOk = '';
                else delete picker.dataset.kpContrastOk;
            }
            /** @type {ColourDetail} */
            const detail = { value: text, ...colour, ratio, ok, against };
            if (announce) picker.dispatchEvent(new CustomEvent(COLOR_EVENT, { bubbles: true, detail }));
            return detail;
        };

        const onInput = () => update(true);
        for (const channel of ['h', 's', 'l']) slider(channel)?.addEventListener('input', onInput);
        // Remeasured when the document changes theme: the same colour is
        // readable on formal and invisible on terminal, which is the whole
        // reason this number is here.
        const onTheme = () => update(false);
        if (follow) document.addEventListener('kp-theme-change', onTheme);
        // Silently: nothing changed yet, so nothing is announced.
        update(false);

        /** @type {ColorPickerHandle} */
        const handle = {
            element: picker,
            get: () => update(false),
            set: (colour) => {
                const hsl = typeof colour === 'string' ? parseHsl(colour) : colour;
                if (hsl === null) return;
                const h = slider('h');
                const s = slider('s');
                const l = slider('l');
                if (h) h.value = String(hsl.h);
                if (s) s.value = String(hsl.s);
                if (l) l.value = String(hsl.l);
                update(true);
            },
            measure: () => void update(false),
        };
        handles.set(picker, handle);
        created.push(handle);

        cleanups.push(() => {
            for (const channel of ['h', 's', 'l']) slider(channel)?.removeEventListener('input', onInput);
            document.removeEventListener('kp-theme-change', onTheme);
            picker.style.removeProperty('--kp-color');
            if (swatch !== null) swatch.style.background = before.swatch;
            if (value !== null) value.textContent = before.value;
            if (report !== null) report.textContent = before.report;
            delete picker.dataset.kpContrastOk;
            handles.delete(picker);
            delete picker.dataset.kpColorpickerAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}
