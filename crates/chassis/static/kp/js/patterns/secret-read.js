// Reads a secret field's value from the page, only when it is shown or copied.
import { SECRET_REQUEST_EVENT } from './constants.js';
/** @typedef {import('./types.js').SecretLoad} SecretLoad */
/** @typedef {import('../strings.js').Strings} Strings */

/**
 * The value, asked of the page: a `kp-secret-request` it answers (preventDefault, then respond or fail), else the `load` option,
 * else `data-kp-secret-value`. The first answer counts.
 * @param {HTMLElement} field
 * @param {'reveal' | 'copy'} purpose
 * @param {SecretLoad | undefined} load
 * @param {Strings} s
 * @returns {Promise<string>}
 */
export function readSecret(field, purpose, load, s) {
    return new Promise((resolve, reject) => {
        let answered = false;
        const respond = (/** @type {string} */ v) => {
            if (answered) return;
            answered = true;
            resolve(String(v));
        };
        const fail = (/** @type {unknown} */ why) => {
            if (answered) return;
            answered = true;
            reject(why);
        };
        const event = new CustomEvent(SECRET_REQUEST_EVENT, { bubbles: true, cancelable: true, detail: { respond, fail, purpose } });
        field.dispatchEvent(event);
        if (event.defaultPrevented) return;
        if (load) {
            Promise.resolve()
                .then(() => load(field, purpose))
                .then(respond, fail);
            return;
        }
        const inline = field.dataset.kpSecretValue;
        if (inline !== undefined) respond(inline);
        else fail(new Error(s.secretNoSource));
    });
}

/** The words for why a read failed. @param {unknown} error @param {Strings} s */
export const reasonOf = (error, s) => (error instanceof Error ? error.message : typeof error === 'string' ? error : s.secretNoSource);
