// The row is the target on a phone [heatstates-1102; Habits' counters history, kp-gaps habits 01/11/2026: thirty days in a row
// on a 390 px phone are 5 x 22 px cells, which no finger hits one by one]. A tap on a row opens the list of that row's days, each a
// full-height button with its tone, its name and what it says; choosing one is the press its cell would have been (js/heat/pick.js
// pressCell), so picking a column stays in reach. When it opens is the grid's option `data-kp-heat-days`:
//
//   auto    (default) a touch on a row whose cells are smaller than a fingertip (`--kp-touch-target`, 2.75rem) opens the list; a
//           mouse, a pen and the keys press the cell as before, and so does a touch on cells big enough to hit
//   always  every pointer press on a row opens it (the keys still press the cell)
//   off     never; the cells only, as before
//
// The list stands on the menu's raised plate (`.kp-menu`), right after the grid (after its legend), hung under the row the way the
// menu button hangs its menu (js/menu-button/placement.js), and lifted over a container that would clip it. It is a non-modal
// dialog: the tapped day takes the focus, the arrows, Home and End move along the days, Escape closes and gives the focus back to the
// cell, a press outside or the focus leaving closes it, and it closes as it opened, backwards (js/motion.js). A redraw of the grid
// that takes the row away closes it too. `kp-heat-days` { rowKey, open } tells the page when it opens and closes.
import { coveredEdges } from '../menu-button/covered.js';
import { lowerMenu, placeMenu, raiseMenu, unplaceMenu } from '../menu-button/placement.js';
import { playClose, stopClose } from '../motion.js';
import { HEAT_CELL, HEAT_DAYS_ATTRIBUTE, HEAT_DAYS_EVENT } from './constants.js';
import { daysPanel, rowDays, rowName } from './days-list.js';
import { placeStop } from './draw.js';
import { pressCell } from './pick.js';
/** @typedef {import('../menu-button/types.js').MenuState} MenuState */

/** The space between the row and the list, as a menu hangs under its button; a knob, `--kp-heat-days-gap`. */
const GAP = 'var(--kp-heat-days-gap, var(--kp-space-xs, 0.25rem))';
/** A fingertip, when the page sets no `--kp-touch-target` (the token's own fallback). */
const FINGERTIP = 'var(--kp-touch-target, 2.75rem)';
let idSeq = 0;

/**
 * Whether a press on `row` opens its days, by the grid's option and the pointer that pressed.
 * @param {HTMLElement} el @param {HTMLElement} row @param {string} pointer `touch`, `mouse`, `pen`, or '' for the keys
 */
export function opensDays(el, row, pointer) {
    const mode = el.getAttribute(HEAT_DAYS_ATTRIBUTE);
    if (mode === 'off' || !pointer || !row.querySelector(HEAT_CELL)) return false;
    if (mode === 'always') return true;
    if (pointer !== 'touch') return false;
    const cell = /** @type {HTMLElement} */ (row.querySelector(HEAT_CELL));
    const box = cell.getBoundingClientRect();
    return Math.min(box.width, box.height) < lengthAt(el, FINGERTIP);
}

/** A CSS length in px, as it resolves at `el` (its tokens and font size). @param {HTMLElement} el @param {string} length */
function lengthAt(el, length) {
    const probe = el.ownerDocument.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;inline-size:${length}`;
    el.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
}

/** Scroll the list (only the list, never the page) so the day stands in its middle. @param {HTMLElement} button */
function centreIn(button) {
    const list = button.closest('.kp-heat__days-list');
    if (!(list instanceof HTMLElement)) return;
    const at = button.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTop = Math.max(0, at - (list.clientHeight - button.offsetHeight) / 2);
}

/** One grid's list of a row's days: at most one open at a time. */
export class HeatDays {
    /** @param {HTMLElement} el the grid */
    constructor(el) {
        this.el = el;
        /** @type {{ panel: HTMLElement, row: HTMLElement, cell: HTMLElement, place: MenuState, off: (() => void)[] } | null} */
        this.now = null;
    }

    /**
     * Open the days of `row` under it, the day of `cell` focused (else the picked one, else the newest).
     * @param {HTMLElement} row @param {HTMLElement | null} cell
     */
    open(row, cell) {
        const el = this.el;
        const view = el.ownerDocument.defaultView;
        if (!view) return;
        this.close(false);
        const days = rowDays(el, row);
        if (days.length === 0) return;
        const panel = daysPanel(el.ownerDocument, rowName(row), days, `kp-heat-days-${(idSeq += 1)}`);
        const anchor = el.nextElementSibling?.matches('.kp-heat__legend') ? el.nextElementSibling : el;
        anchor.after(panel);
        const at = days.find((d) => d.cell === cell) ?? days.find((d) => d.picked) ?? days[days.length - 1];
        /** @type {MenuState} */
        const place = { wrapper: el, button: row, menu: panel, decorate: undefined, strings: undefined, drawn: '', pending: null, open: true, empty: false, off: [], placing: 0 };
        this.now = { panel, row, cell: at.cell, place, off: [] };
        this.hang(view);
        this.listen(view);
        const button = /** @type {HTMLElement | null} */ (panel.querySelector(`.kp-heat__day[data-col-key="${CSS.escape(at.key)}"]`));
        button?.focus({ preventScroll: true });
        if (button) centreIn(button);
        el.dispatchEvent(new CustomEvent(HEAT_DAYS_EVENT, { bubbles: true, detail: { rowKey: row.dataset.rowKey, open: true } }));
    }

    /** Hang the panel under its row: its laid-out top moved to the row's bottom plus the gap, then placed whole on the screen. @param {Window} view */
    hang(view) {
        if (!this.now) return;
        const { panel, row, place } = this.now;
        panel.style.setProperty('margin-block-start', '0px');
        const gap = lengthAt(this.el, GAP);
        const drop = row.getBoundingClientRect().bottom + gap - panel.getBoundingClientRect().top;
        panel.style.setProperty('margin-block-start', `${drop}px`);
        placeMenu(place, view, coveredEdges(view, this.el, panel));
        raiseMenu(place, view);
    }

    /** Escape, the keys along the days, a press outside, the focus leaving, a resize and a redraw. @param {Window} view */
    listen(view) {
        const now = /** @type {NonNullable<HeatDays['now']>} */ (this.now);
        const { panel } = now;
        const inside = (/** @type {EventTarget | null} */ t) => t instanceof Node && panel.contains(t);
        const outside = (/** @type {Event} */ event) => !inside(event.target) && this.close(false);
        const left = (/** @type {FocusEvent} */ event) => event.relatedTarget && !inside(event.relatedTarget) && this.close(false);
        const keys = (/** @type {KeyboardEvent} */ event) => this.onKey(event);
        const choose = (/** @type {MouseEvent} */ event) => this.onChoose(event);
        const again = () => this.now && (lowerMenu(this.now.place), this.hang(view));
        const redraw = new MutationObserver(() => !now.row.isConnected && this.close(false));
        redraw.observe(this.el, { childList: true });
        view.document.addEventListener('pointerdown', outside, true);
        panel.addEventListener('focusout', left);
        panel.addEventListener('keydown', keys);
        panel.addEventListener('click', choose);
        view.addEventListener('resize', again);
        now.off.push(
            () => view.document.removeEventListener('pointerdown', outside, true),
            () => panel.removeEventListener('focusout', left),
            () => panel.removeEventListener('keydown', keys),
            () => panel.removeEventListener('click', choose),
            () => view.removeEventListener('resize', again),
            () => redraw.disconnect(),
        );
    }

    /** Arrows, Home and End move along the days; Escape closes with the focus back on the cell. @param {KeyboardEvent} event */
    onKey(event) {
        if (!this.now) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            return this.close(true);
        }
        const buttons = /** @type {HTMLElement[]} */ ([...this.now.panel.querySelectorAll('.kp-heat__day')]);
        const at = buttons.indexOf(/** @type {HTMLElement} */ (event.target));
        const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key];
        if (to === undefined || at < 0) return;
        event.preventDefault();
        buttons[Math.max(0, Math.min(buttons.length - 1, to))]?.focus();
    }

    /** A day chosen: its cell pressed, the list closed, the focus on that cell. @param {MouseEvent} event */
    onChoose(event) {
        const now = this.now;
        const button = event.target instanceof Element ? event.target.closest('.kp-heat__day') : null;
        if (!now || !(button instanceof HTMLElement) || button.getAttribute('aria-disabled') === 'true') return;
        const cell = /** @type {HTMLElement | null} */ (now.row.querySelector(`${HEAT_CELL}[data-col-key="${CSS.escape(button.dataset.colKey ?? '')}"]`));
        if (!cell) return this.close(false);
        now.cell = cell;
        this.close(true);
        pressCell(this.el, cell, 'days');
    }

    /** Close it, backwards; with `focus` the focus goes back to its cell. @param {boolean} focus */
    close(focus) {
        const now = this.now;
        if (!now) return;
        this.now = null;
        for (const off of now.off.splice(0)) off();
        const { panel, cell, place, row } = now;
        if (focus && cell.isConnected) {
            placeStop(this.el, HEAT_CELL, { r: Number(cell.dataset.r), c: Number(cell.dataset.c) });
            cell.focus({ preventScroll: true });
        }
        panel.inert = true;
        void playClose(panel).then(() => {
            stopClose(panel);
            lowerMenu(place);
            unplaceMenu(panel);
            panel.remove();
        });
        this.el.dispatchEvent(new CustomEvent(HEAT_DAYS_EVENT, { bubbles: true, detail: { rowKey: row.dataset.rowKey, open: false } }));
    }
}
