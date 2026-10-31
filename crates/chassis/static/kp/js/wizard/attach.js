// wireWizards() (the body of attachWizards()) and the handle of an attached wizard.

import { controllerOf, attachOne } from '../controller.js';
import { WizardController } from './controller.js';
import { WIZARD } from './values.js';

/** @typedef {import('../wizard.js').WizardHandle} WizardHandle */
/** @typedef {import('../wizard.js').WizardOptions} WizardOptions */

/**
 * The handle for an attached wizard.
 * @param {Element} element
 * @returns {WizardHandle | null}
 */
export function wizard(element) {
    return controllerOf(element, WizardController)?.api ?? null;
}

/**
 * Wire every wizard under `root` (not `root` itself) that is not wired yet.
 * @param {ParentNode} root
 * @param {WizardOptions} options
 * @returns {(() => void) & { handles: WizardHandle[] }} detach
 */
export function wireWizards(root, options) {
    const made = [...root.querySelectorAll(WIZARD)]
        .filter((host) => /** @type {HTMLElement} */ (host).dataset.kpWizardAttached === undefined && !controllerOf(host, WizardController))
        .map((host) => attachOne(/** @type {HTMLElement} */ (host), WizardController, options))
        .filter((controller) => controller !== undefined);
    const detach = () => {
        for (const controller of made) controller.destroy();
    };
    return Object.assign(detach, { handles: made.map((controller) => controller.handle()) });
}
