// The calls a page makes on a master-detail layout: attach, get its handle, set its state, select, open and close.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { MASTER_DETAIL } from './constants.js';
import { MasterDetailController } from './controller.js';
import { paneOf } from './parts.js';

/** The handle of an attached layout. @param {Element} element @returns {import('./constants.js').MasterDetailHandle | null} */
export const masterDetail = (element) => controllerOf(element, MasterDetailController)?.handle ?? null;

/**
 * Set the detail pane's state. A page that draws with the DOM calls this; the
 * detail pane keeps its place and size in every state.
 * @param {Element} root
 * @param {import('./constants.js').PaneState} state
 * @param {import('./constants.js').PaneStateOptions} [options]
 */
export function setPaneState(root, state, options) {
    masterDetail(root)?.setState(state, options);
}

/**
 * Select an item by its key (the arrow keys' move), without opening the detail.
 * @param {Element} root @param {string | null} key
 */
export function selectPane(root, key) {
    masterDetail(root)?.select(key);
}

/**
 * Open the detail of an item (narrow: the detail replaces the list).
 * @param {Element} root @param {string} key
 */
export function openPane(root, key) {
    masterDetail(root)?.open(key);
}

/** Show the list again. @param {Element} root */
export function closePane(root) {
    masterDetail(root)?.close();
}

/** Whether a layout has what it needs: a detail pane, a list pane or an aside (the detail + aside variant), and a window. @param {HTMLElement} el */
const wireable = (el) => Boolean((paneOf(el, 'list') || paneOf(el, 'aside')) && paneOf(el, 'detail') && el.ownerDocument.defaultView);

/**
 * Wire every master-detail layout under `root`; one without a detail pane, or with neither a list pane nor an aside, is left alone.
 * @param {ParentNode} [root]
 * @param {{ history?: boolean }} [options] `history: false` leaves the browser's history alone
 * @returns {() => void} detach
 */
export function attachMasterDetails(root = document, { history: useHistory } = {}) {
    const made = hostsOf(root, MASTER_DETAIL)
        .filter((el) => !controllerOf(el, MasterDetailController) && wireable(el))
        .map((el) => attachOne(el, MasterDetailController, useHistory === undefined ? {} : { history: useHistory }))
        .filter((layout) => layout !== undefined);
    return () => {
        for (const layout of made) layout.destroy();
    };
}
