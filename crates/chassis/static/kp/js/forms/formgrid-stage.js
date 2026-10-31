// Form grids that share rows: the stage writes `--kp-formgrid-rows`, the row count of its longest card [gapform-1019; HTTPSwitchboard 31].

import { Controller } from '../controller.js';
import { FORMGRID_BLOCK, FORMGRID_BLOCK_DEPTH } from './constants.js';

/**
 * The rows a row-sharing form grid lays on its stage: every shown child is a row, and a block (a key-value list, a
 * group, a list of form rows) counts its own children, one level of blocks deep, as the stylesheet flattens them.
 * @param {Element} grid
 * @param {number} [depth]
 * @returns {number}
 */
function formgridRows(grid, depth = 0) {
    let rows = 0;
    for (const child of grid.children) {
        if (child instanceof HTMLElement && child.hidden) continue;
        if (child.matches('template, script, style')) continue;
        rows += depth < FORMGRID_BLOCK_DEPTH && child.matches(FORMGRID_BLOCK) ? formgridRows(child, depth + 1) : 1;
    }
    return rows;
}

/** The controller of one `[data-kp-formgrid-stage]`. */
export class FormgridStageController extends Controller {
    connect() {
        const stage = this.host;
        this.count();
        const watch = this.observe(new MutationObserver(() => this.count()));
        watch.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-kp-formgrid-rows'] });
        this.own(() => stage.style.removeProperty('--kp-formgrid-rows'));
    }

    /** Write the row count of the longest card, when it changed. */
    count() {
        const stage = this.host;
        let rows = 0;
        for (const grid of stage.querySelectorAll(":scope > .kp-formgrid[data-kp-formgrid-rows='subgrid']")) {
            rows = Math.max(rows, formgridRows(grid));
        }
        const value = String(Math.max(rows, 1));
        if (stage.style.getPropertyValue('--kp-formgrid-rows') !== value) stage.style.setProperty('--kp-formgrid-rows', value);
    }
}
