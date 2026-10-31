// Attaches the secrets of a page: one SecretControl per display field, one SecretInputControl per input field.
import { attachOne } from '../controller.js';
import { CLEAR_AFTER_MS, COPIED_MS, SECRET } from './constants.js';
import { secrets } from './secret-api.js';
import { SecretControl } from './secret-display.js';
import { SecretInputControl } from './secret-input.js';
/** @typedef {import('./types.js').SecretLoad} SecretLoad */

/**
 * Attach every secret field under `root`.
 * @param {ParentNode} [root]
 * @param {{ load?: SecretLoad, copiedMs?: number, clearAfterMs?: number | false }} [options]
 * @returns {() => void} detach
 */
export function attachSecrets(root = document, { load, copiedMs = COPIED_MS, clearAfterMs = CLEAR_AFTER_MS } = {}) {
    const fields = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SECRET) ? [root] : []),
        ...root.querySelectorAll(SECRET),
    ]);
    // A field in the registry is wired already, by this call's controller or an earlier one. The mode is read when it attaches.
    const made = fields
        .filter((field) => !secrets.has(field))
        .map((field) =>
            field.dataset.kpSecretMode === 'input'
                ? attachOne(field, SecretInputControl, { copiedMs, clearAfterMs })
                : attachOne(field, SecretControl, { copiedMs, clearAfterMs, ...(load ? { load } : {}) }),
        );
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
