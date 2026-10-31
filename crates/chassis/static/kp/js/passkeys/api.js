// The calls a page makes on a passkey list: draw it with setPasskeys(), or let attachPasskeys() draw the ones that carry JSON.

import { attachOne, controllerOf } from '../controller.js';
import { PASSKEYS } from './constants.js';
import { PasskeysController } from './controller.js';

/**
 * Draw (or redraw) a passkey list.
 * @param {HTMLElement} el the root, a `.kp-passkeys`
 * @param {import('./constants.js').PasskeysSpec} spec
 */
export function setPasskeys(el, spec) {
    el.classList.add('kp-passkeys');
    el.setAttribute('data-kp-passkeys', el.getAttribute('data-kp-passkeys') ?? '');
    const list = controllerOf(el, PasskeysController) ?? attachOne(el, PasskeysController, { spec });
    list?.update(spec);
}

/**
 * Fill every `[data-kp-passkeys]` under `root` that carries its spec as JSON in
 * the attribute (a page that draws with setPasskeys() needs nothing).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachPasskeys(root = document) {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(PASSKEYS))) {
        const json = el.getAttribute('data-kp-passkeys') ?? '';
        if (json.trim().startsWith('{') && !controllerOf(el, PasskeysController)) {
            try {
                setPasskeys(el, JSON.parse(json));
            } catch (error) {
                console.error(error);
            }
        }
    }
    return () => {};
}
