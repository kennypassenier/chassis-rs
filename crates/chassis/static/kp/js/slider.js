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
//
// Each slider is one SliderControl controller (js/slider/controller.js over js/slider/core.js, on js/controller.js); the
// parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { SliderControl } from './slider/controller.js';
import { SLIDER } from './slider/values.js';

export { SLIDER, SLIDER_INPUT_EVENT, SLIDER_CHANGE_EVENT, SLIDER_STATES, snapSlider, sliderPercent, parseSliderText } from './slider/values.js';

/**
 * @typedef {object} SliderHandle
 * @property {HTMLElement} element
 * @property {() => number[]} values one value, or two for a range
 * @property {(values: readonly number[]) => void} set replace the values (no event)
 * @property {(state: 'ready' | 'loading') => void} setState
 * @property {() => string} text the value as the box shows it
 */

/** The handle of an attached slider. @param {Element} element @returns {SliderHandle | null} */
export function slider(element) {
    return controllerOf(element, SliderControl)?.handle ?? null;
}

/**
 * The values of a slider.
 * @param {Element} element
 */
export function sliderValues(element) {
    return slider(element)?.values() ?? [];
}

/**
 * Set the values of a slider from a script, without the event.
 * @param {Element} element @param {readonly number[]} values
 */
export function setSliderValues(element, values) {
    slider(element)?.set(values);
}

/**
 * Put a slider in a state: `loading` shows its skeleton and switches it off.
 * @param {Element} element @param {'ready' | 'loading'} state
 */
export function setSliderState(element, state) {
    slider(element)?.setState(state);
}

/**
 * Wire every slider under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachSliders(root = document) {
    return attachAll(root, SLIDER, SliderControl);
}
