// One entity grid: its least card width, its narrow fold, and the cards drawn again when its width or an option changes.
import { Controller } from '../controller.js';
import { DRAWN } from './helpers.js';
import { redraw, setEntity } from './set.js';

/** Below this grid width in px the cards put every action in "More". */
const NARROW_BELOW = 480;
/** The cards of a grid. */
const CARDS = ':scope > .kp-card--entity';
/** The options of a grid that are live: change the attribute and every card is drawn again. */
const LIVE_OPTIONS = [
    'data-kp-entity-meters',
    'data-kp-entity-flags-max',
    'data-kp-entity-inline',
    'data-kp-entity-link',
    'data-kp-selectable',
    'data-kp-entity-mark',
    'data-kp-entity-min',
    'data-kp-entity-narrow',
    'data-kp-entity-kind',
    'data-kp-entity-trend',
    'data-kp-entity-star',
    'data-kp-entity-star-key',
];

export class EntityGridControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The width the cards were last fitted for. */
        this.lastWidth = 0;
    }

    connect() {
        const grid = this.host;
        this.applyMin();
        this.lastWidth = grid.clientWidth;
        this.fold();
        if (typeof ResizeObserver === 'function') {
            this.observe(
                new ResizeObserver(() => {
                    this.fold();
                    this.refit();
                }),
            ).observe(grid);
        }
        this.observe(new MutationObserver(() => this.onOption())).observe(grid, { attributes: true, attributeFilter: LIVE_OPTIONS });
        // The fold is read once more now that the cards listen for it.
        this.fold();
    }

    /** The least card width the grid asks for. */
    applyMin() {
        const grid = this.host;
        const min = grid.getAttribute('data-kp-entity-min');
        if (min) grid.style.setProperty('--kp-entity-min', min);
        else grid.style.removeProperty('--kp-entity-min');
    }

    /** A narrow grid puts every action in "More". */
    fold() {
        const grid = this.host;
        grid.toggleAttribute('data-kp-entity-narrow', grid.clientWidth > 0 && grid.clientWidth < NARROW_BELOW);
    }

    /** A new width: forget what fitted before and draw the flags and actions again. */
    refit() {
        const grid = this.host;
        if (grid.clientWidth === this.lastWidth) return;
        this.lastWidth = grid.clientWidth;
        delete grid.dataset.kpEntityFit;
        const cards = /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(CARDS)]);
        for (const card of cards) delete card.dataset.kpFlagsFit;
        redraw(cards, ['flags', 'actions']);
    }

    /** An option changed: every card is drawn again from its last data. */
    onOption() {
        const grid = this.host;
        this.applyMin();
        delete grid.dataset.kpEntityFit;
        for (const card of /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(CARDS)])) {
            const was = DRAWN.get(card);
            if (!was) continue;
            was.drawn = {};
            setEntity(card, was.data);
        }
    }
}
