// One availability grid: presses, painting a row by dragging, the scroll memory, the keys, the heat grid and the live options.
import { Controller } from '../controller.js';
import { attachHeats, setHeatPick } from '../heat.js';
import { memoryFor } from '../remember.js';
import { attachDisabledReasons } from '../reason.js';
import { setAvailability } from './api.js';
import { AVAILABILITY_CHOOSE_EVENT, AVAILABILITY_RETRY_EVENT, AVAILABILITY_UNIT_EVENT } from './constants.js';
import { attr, availabilityBest, editable, stateOf } from './facts.js';
import { next, openMenu } from './menu.js';
import { render } from './paint.js';
import { request } from './request.js';
import { registerAvailabilityKeys } from './keys.js';
/** @typedef {import('./types.js').AvailabilityAnswer} AvailabilityAnswer */

/** A grid cell a person answers in (not a summary row's). */
const CELL = '.kp-availability__grid .kp-heat__cell[data-col-key]';
/** The options that draw the grid again when they change at run time. */
const LIVE_OPTIONS = [
    'data-kp-heat-edit',
    'data-kp-disabled-reason',
    ...[
        'answers',
        'press',
        'best',
        'best-rule',
        'window',
        'quorum',
        'sort',
        'summary',
        'locked',
        'narrow',
        'density',
        'disabled',
        'choose',
        'unit-switch',
    ].map((n) => `data-kp-availability-${n}`),
];

/** @param {Event} event */
const cellOf = (event) => {
    const t = event.target instanceof Element ? event.target : null;
    const c = /** @type {HTMLElement | null} */ (t?.closest(CELL) ?? null);
    return c && !c.closest('.kp-heat__row--summary') ? c : null;
};

/** One availability grid; its answers stay in the STATE registry the setters read before attach. */
export class AvailabilityControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options = {}) {
        super(host, options);
        /** A row being painted by a drag. @type {{ person: string, first: HTMLElement, answer: AvailabilityAnswer | null, keys: Set<string>, pointer: number } | null} */
        this.drag = null;
        /** Whether the click that ends a painted stroke is swallowed. */
        this.suppress = false;
    }

    connect() {
        const el = this.host;
        // Registered first, so it runs last, as before.
        this.own(attachDisabledReasons(el));
        this.listen(el, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)), true);
        this.listen(el, 'pointerdown', (event) => this.onDown(/** @type {PointerEvent} */ (event)));
        this.listen(el, 'pointermove', (event) => this.onMove(/** @type {PointerEvent} */ (event)));
        this.listen(document, 'pointerup', () => this.onUp());
        this.listen(el, 'scroll', (event) => this.onScroll(event), true);
        if (el.getAttribute('data-kp-availability-keys') !== 'false') this.own(registerAvailabilityKeys(el));
        this.own(attachHeats(el));
        // Every option is live: change the attribute and the grid is drawn again.
        this.observe(new MutationObserver(() => render(el))).observe(el, { attributes: true, attributeFilter: LIVE_OPTIONS });
        render(el);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (this.suppress) {
            this.suppress = false;
            event.stopPropagation();
            event.preventDefault();
            return;
        }
        if (this.plateClick(target) || this.pickClick(target)) return;
        const cell = cellOf(event);
        if (!cell) return;
        event.stopPropagation();
        const el = this.host;
        const person = cell.getAttribute('data-row-key') ?? '';
        const column = cell.getAttribute('data-col-key') ?? '';
        if (!editable(el, person, column)) return;
        if (attr(el, 'press', 'menu') === 'menu') return openMenu(el, cell);
        void request(el, person, [column], next(el, stateOf(el).set.answers[person]?.[column]));
    }

    /**
     * Retry (or Add on the empty plate), the unit switch and Choose.
     * @param {Element} target
     * @returns {boolean} whether the press was one of them
     */
    plateClick(target) {
        const el = this.host;
        if (target.closest('[data-kp-availability-retry]')) {
            const detail = { action: stateOf(el).spec.state === 'empty' ? 'add' : 'retry' };
            el.dispatchEvent(new CustomEvent(AVAILABILITY_RETRY_EVENT, { bubbles: true, detail }));
            return true;
        }
        const unit = target.closest('.kp-availability__unit [data-value]');
        if (unit) {
            const value = unit.getAttribute('data-value') === 'day' ? 'day' : 'range';
            if (value === stateOf(el).unit) return true;
            setAvailability(el, { ...stateOf(el).spec, unit: value });
            el.dispatchEvent(new CustomEvent(AVAILABILITY_UNIT_EVENT, { bubbles: true, detail: { unit: value } }));
            return true;
        }
        if (!target.closest('.kp-availability__choose')) return false;
        el.dispatchEvent(new CustomEvent(AVAILABILITY_CHOOSE_EVENT, { bubbles: true, detail: { keys: availabilityBest(el) } }));
        return true;
    }

    /**
     * An answer in the menu, or a column head that picks its column.
     * @param {Element} target
     * @returns {boolean} whether the press was one of them
     */
    pickClick(target) {
        const el = this.host;
        const pick = target.closest('.kp-availability__pick');
        if (pick instanceof HTMLElement) {
            const answer = /** @type {AvailabilityAnswer} */ (pick.getAttribute('data-answer'));
            const person = pick.getAttribute('data-person') ?? '';
            const column = pick.getAttribute('data-column') ?? '';
            const was = stateOf(el).set.answers[person]?.[column];
            void request(el, person, [column], was === answer ? null : answer);
            return true;
        }
        const colHead = target.closest('.kp-availability__grid .kp-heat__col');
        if (!colHead) return false;
        const key = colHead.getAttribute('data-col-key');
        const grid = /** @type {HTMLElement} */ (el.querySelector('.kp-availability__grid'));
        if (key) setHeatPick(grid, grid.getAttribute('data-kp-heat-picked') === key ? null : key);
        return true;
    }

    /** A mouse or pen press on an editable cell may start painting its row. @param {PointerEvent} event */
    onDown(event) {
        const el = this.host;
        if (event.button !== 0 || event.pointerType === 'touch' || attr(el, 'paint', 'on') === 'false' || attr(el, 'press', 'menu') === 'menu') return;
        const cell = cellOf(event);
        if (!cell) return;
        const person = cell.getAttribute('data-row-key') ?? '';
        const column = cell.getAttribute('data-col-key') ?? '';
        if (!editable(el, person, column)) return;
        const answer = next(el, stateOf(el).set.answers[person]?.[column]);
        this.drag = { person, first: cell, answer, keys: new Set([column]), pointer: event.pointerId };
    }

    /** The stroke takes in every editable cell of its row it passes. @param {PointerEvent} event */
    onMove(event) {
        const drag = this.drag;
        if (!drag || event.buttons !== 1) return;
        const under = document.elementFromPoint(event.clientX, event.clientY);
        const cell = /** @type {HTMLElement | null} */ (under?.closest(CELL) ?? null);
        if (!cell || cell.getAttribute('data-row-key') !== drag.person) return;
        const column = cell.getAttribute('data-col-key') ?? '';
        if (drag.keys.has(column) || !editable(this.host, drag.person, column)) return;
        drag.keys.add(column);
        cell.setAttribute('data-kp-availability-painting', '');
        drag.first.setAttribute('data-kp-availability-painting', '');
    }

    /** A stroke over two cells or more answers them all; the click that follows it is swallowed. */
    onUp() {
        const el = this.host;
        const d = this.drag;
        this.drag = null;
        for (const c of el.querySelectorAll('[data-kp-availability-painting]')) c.removeAttribute('data-kp-availability-painting');
        if (!d || d.keys.size < 2) return;
        this.suppress = true;
        setTimeout(() => (this.suppress = false), 0);
        void request(el, d.person, [...d.keys], d.answer, { stroke: true });
    }

    /** The grid's sideways scroll is remembered. @param {Event} event */
    onScroll(event) {
        const t = event.target;
        if (t instanceof HTMLElement && t.classList.contains('kp-availability__grid')) memoryFor(this.host, 'availability')?.write('scroll', t.scrollLeft);
    }
}
