// The calls a page makes on forms: attach the forms, get a form's handle, and attach the form grids.

import { attachOne, controllerOf } from '../controller.js';
import { FORMGRID_STAGE, FORM, SUBMIT } from './constants.js';
import { FormController } from './form.js';
import { FormgridColumnsController } from './formgrid-columns.js';
import { FormgridStageController } from './formgrid-stage.js';
import { SubmitController } from './submit.js';

/** The handle for an attached form, for code that did not call attach. @param {Element} element @returns {import('./constants.js').FormHandle | null} */
export function form(element) {
    return controllerOf(element, FormController)?.handle ?? null;
}

/**
 * A controller for each element under `root` (never `root` itself) that matches `selector` and passes `allowed`; one detach for the ones made.
 * @template {import('../controller.js').Controller} C
 * @param {ParentNode} root
 * @param {string} selector
 * @param {new (host: HTMLElement, options?: any) => C} Ctor
 * @param {Record<string, unknown>} options
 * @param {(host: Element) => host is HTMLElement} allowed
 * @returns {C[]}
 */
function wireBelow(root, selector, Ctor, options, allowed) {
    return [...root.querySelectorAll(selector)]
        .filter((host) => allowed(host) && !controllerOf(host, Ctor))
        .map((host) => attachOne(/** @type {HTMLElement} */ (host), Ctor, options))
        .filter((controller) => controller !== undefined);
}

/** @param {Element} el @returns {el is HTMLFormElement} a form that nothing attached yet */
const freshForm = (el) => el instanceof HTMLFormElement && !(el.dataset.kpFormAttached !== undefined);
/** @param {Element} el @returns {el is HTMLElement} a submit button that nothing attached yet */
const freshButton = (el) => el instanceof HTMLElement && !(el.dataset.kpSubmitAttached !== undefined);
/** @param {Element} el @returns {el is HTMLElement} */
const isHtml = (el) => el instanceof HTMLElement;

/**
 * Attach every form under `root`.
 *
 * @param {ParentNode} root
 * @param {import('./constants.js').FormOptions} [options]
 *   Defaults, each also settable per form as `data-kp-validate-on`, `data-kp-revalidate-on`, `data-kp-focus-summary`, `data-kp-form-native-submit`.
 *   A valid submit is NOT sent by the browser: the form fires `kp-form-valid` and the page sends the data itself (`preventDefault()`),
 *   so a handler that saves with `fetch` is not followed by a reload of the page [wish-1028, Kitchen 5]. `nativeSubmit: true` (or
 *   `data-kp-form-native-submit` on the form) lets the browser submit a valid form as well, for a form whose `action` does the work.
 * @returns {(() => void) & { handles: import('./constants.js').FormHandle[] }} detach
 */
export function attachForms(root = document, options = {}) {
    const forms = wireBelow(root, FORM, FormController, options, freshForm);
    // A submit button that says it is working. Without it, a slow save
    // looks like a click that missed, and the second click sends the form
    // twice.
    const buttons = wireBelow(root, SUBMIT, SubmitController, {}, freshButton);
    const detach = () => {
        for (const made of [...forms, ...buttons]) made.destroy();
    };
    return Object.assign(detach, { handles: forms.map((made) => made.handle) });
}

/**
 * Form grids that share rows [gapform-1019; HTTPSwitchboard 31]. In a `[data-kp-formgrid-stage]`, a `.kp-formgrid` with
 * `data-kp-formgrid-rows="subgrid"` takes its rows from the stage, so "Source" in one card stands beside "Source" in
 * the next with one height. A subgrid has to say how many rows it spans, and a count kept by hand drifts the day a row
 * is added: this writes `--kp-formgrid-rows` on each stage, the row count of its longest card, and writes it again when
 * a card gains or loses a row or one is hidden.
 *
 *   <div data-kp-formgrid-stage>
 *     <section class="kp-card kp-formgrid" data-kp-formgrid-rows="subgrid">…</section>
 *     <section class="kp-card kp-formgrid" data-kp-formgrid-rows="subgrid">…</section>
 *   </div>
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops watching and removes the counts it wrote
 */
export function attachFormgridStages(root = document) {
    const stages = wireBelow(root, FORMGRID_STAGE, FormgridStageController, {}, isHtml);
    return () => {
        for (const stage of stages) stage.destroy();
    };
}

/**
 * Groups side by side [formgrid-columns-1019]. A `.kp-formgrid` whose children are all `.kp-formgrid__group` (facts and
 * settings, say) stands them in a row when the panel holds all of them: this puts `data-kp-formgrid-wide` on it while each
 * group, laid on tracks of its own, fits beside the others with `--kp-formgrid-group-gap` between. Without the attribute
 * the groups stand under each other on the grid's shared tracks (one label edge for all). `data-kp-formgrid-columns="never"`,
 * a row-sharing card (`data-kp-formgrid-rows="subgrid"`) and a stacked grid (`data-kp-formgrid-stack="always"`) are left alone.
 * Measured on the grid's own width, so a panel in a dialog or a column answers the same as a page.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops watching and removes the attribute it wrote
 */
export function attachFormgridColumns(root = document) {
    const grids = wireBelow(root, '.kp-formgrid', FormgridColumnsController, {}, isHtml);
    return () => {
        for (const grid of grids) grid.destroy();
    };
}
