// What a picker writes on the page: the save-failed word and the selection marks on its options.

import { getStrings } from '../strings.js';
import { OPTION, STATUS } from './values.js';

/**
 * Storage refused, so the choice will not survive a reload. Said out loud
 * rather than swallowed [AR6]: in a server-rendered dashboard every click
 * is a new page load, and a preference that quietly fails to save looks
 * exactly like a broken picker.
 */
const saveFailedText = () => getStrings().themeSaveFailed;

/** @param {ParentNode} root @param {boolean} failed */
export function showSaveState(root, failed) {
    for (const el of root.querySelectorAll(STATUS)) {
        el.textContent = failed ? saveFailedText() : '';
        /** @type {HTMLElement} */ (el).hidden = !failed;
    }
}

/** @param {ParentNode} root @param {string} theme */
export function markSelection(root, theme) {
    for (const el of root.querySelectorAll(OPTION)) {
        const button = /** @type {HTMLElement} */ (el);
        const selected = button.dataset.kpTheme === theme;
        button.setAttribute('aria-pressed', String(selected));
        // data-selected is the observable both channels share, so one
        // behaviour suite can assert against either mount [AR7]. The ARIA
        // state beside it is each channel's own idiom.
        button.dataset.selected = String(selected);
        // A class as well as the ARIA state: the state is for assistive
        // technology, the class is what CSS can style without relying on
        // an attribute selector a consumer may not expect.
        button.classList.toggle('is-selected', selected);
    }
}

/** @param {ParentNode} root */
export function clearMarks(root) {
    for (const el of root.querySelectorAll(OPTION)) {
        el.removeAttribute('aria-pressed');
        el.removeAttribute('data-selected');
        el.classList.remove('is-selected');
    }
}
