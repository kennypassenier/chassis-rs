// Attaches the side navigations of a page: one SidenavControl per panel.
import { attachOne, controllerOf } from '../controller.js';
import { SIDENAV_OWNED } from './constants.js';
import { SidenavControl } from './controller.js';

/**
 * Wire every `.kp-sidenav` under `root`.
 *
 * @param {ParentNode} root
 * @param {{ strings?: Partial<import('../strings.js').Strings>, ownedBy?: string, store?: Storage | null }} [options]
 * @returns {() => void} detach
 */
export function attachSidenavs(root = document, { strings, ownedBy = SIDENAV_OWNED, store } = {}) {
    const settings = { strings, ownedBy, store };
    // Below the root only, as before; a panel marked attached (by this module or a copy of it) is skipped.
    const made = [...root.querySelectorAll('.kp-sidenav')]
        .map((element) => /** @type {HTMLElement} */ (element))
        .filter((panel) => !('kpSidenavAttached' in panel.dataset) && !controllerOf(panel, SidenavControl))
        .map((panel) => attachOne(panel, SidenavControl, settings))
        .filter((control) => control !== undefined);
    return () => {
        for (const control of made) control.destroy();
    };
}
