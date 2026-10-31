// Groups side by side: `data-kp-formgrid-wide` on a grid whose groups all fit beside each other [formgrid-columns-1019].

import { Controller } from '../controller.js';
import { FIT_SLACK_PX, WIDE_BLOCKS } from './constants.js';

/** The controller of one `.kp-formgrid`. */
export class FormgridColumnsController extends Controller {
    connect() {
        const grid = this.host;
        // Every group is watched too: a time field or a stepper that builds itself after the first look makes a group wider.
        const watch = this.observe(new ResizeObserver(() => this.decide()));
        this.decide();
        watch.observe(grid);
        for (const group of grid.children) watch.observe(group);
        this.own(() => grid.removeAttribute('data-kp-formgrid-wide'));
    }

    /** The shown children of the grid: no templates, scripts, styles or hidden elements. */
    kids() {
        return [...this.host.children].filter((c) => !c.matches('template, script, style') && !(c instanceof HTMLElement && c.hidden));
    }

    /** Whether the grid's groups may stand side by side at all. */
    eligible() {
        const grid = this.host;
        const groups = this.kids();
        return (
            groups.length > 1 &&
            groups.every((c) => c.matches('.kp-formgrid__group')) &&
            grid.getAttribute('data-kp-formgrid-columns') !== 'never' &&
            grid.getAttribute('data-kp-formgrid-rows') !== 'subgrid' &&
            grid.getAttribute('data-kp-formgrid-stack') !== 'always' &&
            // A grid with a wide block (a code block, a JSON field, a text area, a refresh bar, a spanning cell) keeps its stretching tracks.
            !grid.querySelector(WIDE_BLOCKS)
        );
    }

    /** Measure with the groups side by side, and put them back when they do not fit (one task, nothing is painted between). */
    decide() {
        const grid = this.host;
        const was = grid.hasAttribute('data-kp-formgrid-wide');
        if (!this.eligible()) {
            grid.removeAttribute('data-kp-formgrid-wide');
            return;
        }
        grid.setAttribute('data-kp-formgrid-wide', '');
        // What each group needs is its own tracks' width, not the equal column it is given.
        grid.style.gridAutoColumns = 'max-content';
        const groups = this.kids();
        const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
        const need = groups.reduce((sum, g) => sum + g.getBoundingClientRect().width, 0) + gap * (groups.length - 1);
        const have = grid.getBoundingClientRect().width;
        grid.style.gridAutoColumns = '';
        if (need > have + FIT_SLACK_PX) grid.removeAttribute('data-kp-formgrid-wide');
        else if (!was) grid.setAttribute('data-kp-formgrid-wide', '');
    }
}
