// Small helpers: the label of an option and the status slot of a box.

/**
 * What an option reads as once chosen: its `data-kp-label` when it has one (an option drawn in two lines, a name and
 * its detail, is chosen by its name alone), else its text [kpadopt5-time].
 * @param {HTMLElement | null | undefined} option
 * @param {string} [fallback]
 */
export const labelOf = (option, fallback = '') => option?.dataset.kpLabel ?? (option?.textContent ?? fallback).trim();

/**
 * In a form-grid row the status line is the row's value text [combo-range-1019, N16]. Under the input it made a combobox row
 * taller than its label and kept its first line level with the label only because the input came first; the grid has a
 * column for exactly this (the value track), so the status moves into the row, right after the control cell, as a
 * `.kp-formgrid__value`, and the row stays one line high with the status on the input's baseline. It stays under the
 * input when the combobox is not the control of a form-grid row, when the row has value text of its own, and for a
 * combobox with `data-kp-usual` (js/usual-picker.js draws its own status). Returns what puts the status back.
 * @param {HTMLElement} box @param {HTMLElement | null} status
 * @returns {() => void}
 */
export function slotStatus(box, status) {
    if (status === null || box.hasAttribute('data-kp-usual')) return () => {};
    const control = box.parentElement;
    const row = control?.parentElement;
    if (!control?.matches('.kp-formgrid__control, .kp-formrow__control') || !row?.matches('.kp-formgrid__row, .kp-formrow')) return () => {};
    if (row.closest('.kp-formgrid') === null || row.querySelector(':scope > .kp-formgrid__value, :scope > .kp-formrow__aside')) return () => {};
    const home = status.parentElement;
    const next = status.nextSibling;
    control.after(status);
    status.classList.add('kp-formgrid__value');
    return () => {
        status.classList.remove('kp-formgrid__value');
        home?.insertBefore(status, next);
    };
}
