// Attaches the date pickers of a page and hands back their handles.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { PICKER } from './constants.js';
import { DatePickerController, partsOf } from './controller.js';

/** The handle for an attached picker. @param {Element} element */
export function datePicker(element) {
    return controllerOf(element, DatePickerController)?.handle ?? null;
}

/**
 * Whether a picker can be wired now: it is not wired yet and its markup has the field, the open button and the panel.
 * @param {HTMLElement} picker
 */
function wireable(picker) {
    const wired = picker.dataset.kpDatepickerAttached !== undefined;
    return !wired && partsOf(picker) !== null;
}

/**
 * @param {ParentNode} root
 * @param {import('./constants.js').DatePickerOptions} [options]
 *   Defaults; per picker: `data-kp-locale`, `data-kp-date-format` (`rule52`, the default: dd/mm/yyyy whatever the locale; `locale`: the locale's own numeric order), `data-kp-week-starts-on`, `data-kp-min`, `data-kp-max` (ISO), `data-kp-disabled-days` (0-6, comma-separated), `data-kp-close-on-select="false"`, `data-kp-previous-glyph`, `data-kp-next-glyph`.
 * @returns {(() => void) & { handles: import('./constants.js').DatePickerHandle[] }} detach
 */
export function attachDatePickers(root = document, options = {}) {
    const made = hostsOf(root, PICKER)
        .filter(wireable)
        .map((picker) => attachOne(picker, DatePickerController, options))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.flatMap((controller) => (controller.handle ? [controller.handle] : [])) });
}
