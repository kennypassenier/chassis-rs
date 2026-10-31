// Two layout hooks of a table: the width where it turns into cards (`data-kp-cards-at`) and the actions column (`data-kp-col="actions"`).

import { Controller, attachAll } from '../controller.js';

/** A table that turns into cards at its own width. */
export const CARDS_AT = '[data-kp-cards-at]';
/** The card rules of the stylesheet answer a container query at this width; the hook can only lower it. */
const SHEET_THRESHOLD_REM = 40;
/** The attribute that tells the stylesheet this table is wider than its threshold and stays a table. */
const IDLE_ATTRIBUTE = 'data-kp-cards-idle';
/** The units a threshold is written in, as multiples of their own size in px (`rem` and `em` are read from the page). */
const PX_PER_UNIT = { px: 1 };

/**
 * The threshold in px, from "30rem", "480px" or a bare number of rem.
 * @param {string | null} text @param {number} rem the page's rem in px
 * @returns {number}
 */
export function thresholdPx(text, rem) {
    const match = /^\s*([\d.]+)\s*(rem|em|px)?\s*$/.exec(text ?? '');
    if (!match) return SHEET_THRESHOLD_REM * rem;
    const size = Number.parseFloat(match[1]);
    const unit = match[2] ?? 'rem';
    const px = unit === 'px' ? size * PX_PER_UNIT.px : size * rem;
    return Math.min(px, SHEET_THRESHOLD_REM * rem);
}

/**
 * Makes the browser ask the container queries again after a container changed its name. Firefox keeps the answers it gave under the
 * old name (the card rules of a table that was wide and became narrow stayed off) until the container is rebuilt; dropping its
 * containment for one style flush does that without moving anything.
 * @param {...HTMLElement} containers
 */
function askQueriesAgain(...containers) {
    for (const container of containers) container.style.containerType = 'normal';
    void containers[0]?.offsetHeight;
    for (const container of containers) container.style.removeProperty('container-type');
}

/** Watches one table's width and says in `data-kp-cards-idle` when it is wide enough to stay a table. */
export class CardsAt extends Controller {
    connect() {
        const host = this.host;
        const box = host.querySelector('.kp-table-wrap') ?? host;
        const view = host.ownerDocument.defaultView;
        if (!view || typeof ResizeObserver === 'undefined') return;
        const read = () => {
            const rem = Number.parseFloat(view.getComputedStyle(host.ownerDocument.documentElement).fontSize) || 16;
            const wide = box.getBoundingClientRect().width >= thresholdPx(host.getAttribute('data-kp-cards-at'), rem);
            if (host.hasAttribute(IDLE_ATTRIBUTE) === wide) return;
            host.toggleAttribute(IDLE_ATTRIBUTE, wide);
            askQueriesAgain(...new Set(/** @type {HTMLElement[]} */ ([host, box])));
        };
        this.observe(new ResizeObserver(read)).observe(box);
        // The width can be changed at runtime, like the other options.
        this.observe(new MutationObserver(read)).observe(host, { attributes: true, attributeFilter: ['data-kp-cards-at'] });
        this.own(() => host.removeAttribute(IDLE_ATTRIBUTE));
        read();
    }
}

/** Marks the cells under a header `data-kp-col="actions"` with the same kind, as rows come and go. */
export class ActionColumn extends Controller {
    connect() {
        const table = this.host;
        const mark = () => {
            const heads = [...table.querySelectorAll('thead th')];
            const at = heads.findIndex((th) => th.getAttribute('data-kp-col') === 'actions');
            if (at < 0) return;
            for (const row of table.querySelectorAll('tbody > tr')) {
                const cell = /** @type {HTMLTableRowElement} */ (row).cells[at];
                if (cell && cell.getAttribute('data-kp-col') !== 'actions') cell.setAttribute('data-kp-col', 'actions');
            }
        };
        const body = table.querySelector('tbody');
        if (body && typeof MutationObserver !== 'undefined') this.observe(new MutationObserver(mark)).observe(body, { childList: true });
        mark();
    }
}

/**
 * Wire every `data-kp-cards-at` under `root`: the table stays a table until it is narrower than that width.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCardsAt(root = document) {
    return attachAll(root, CARDS_AT, CardsAt);
}

/**
 * Wire every table with an `actions` column under `root`: its cells get `data-kp-col="actions"`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachTableActionColumns(root = document) {
    return attachAll(root, 'table:has(th[data-kp-col="actions"])', ActionColumn);
}
