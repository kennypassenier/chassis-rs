// One swatch picker [parts-1102]: a grid of the theme's categorical colours as toggle buttons, one tab stop that the arrow keys walk
// (← → along a row, ↑ ↓ across rows, Home and End), the current one pressed with a check on it, its name under the grid, and a
// pick that fires `kp-swatch-change`. Under a coarse pointer every swatch is 44 px.

import { Controller } from '../controller.js';
import { watchOptions } from '../live-options.js';
import { getStrings } from '../strings.js';
import { CATEGORICAL_COUNT, COLUMNS_ATTRIBUTE, NAME_ATTRIBUTE, SWATCH_CHANGE_EVENT } from './constants.js';

/** @typedef {import('./constants.js').Swatch} Swatch */

/** The CSS colour of a swatch: a categorical one by number (its place by default), else the text as given. @param {Swatch} swatch @param {number} index */
export function colourOf(swatch, index) {
    const own = swatch.colour ?? ((index % CATEGORICAL_COUNT) + 1);
    const n = Number(own);
    return Number.isInteger(n) && n >= 1 && n <= CATEGORICAL_COUNT ? `var(--kp-cat-${n})` : String(own);
}

/** The keys that walk the grid, and how far. @type {Record<string, (at: number, cols: number, count: number) => number>} */
const WALK = {
    ArrowRight: (at, _c, n) => Math.min(n - 1, at + 1),
    ArrowLeft: (at) => Math.max(0, at - 1),
    ArrowDown: (at, c, n) => (at + c < n ? at + c : at),
    ArrowUp: (at, c) => (at - c >= 0 ? at - c : at),
    Home: () => 0,
    End: (_a, _c, n) => n - 1,
};

export class SwatchesControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const doc = host.ownerDocument;
        this.grid = doc.createElement('div');
        this.grid.className = 'kp-swatches__grid';
        this.name = doc.createElement('p');
        this.name.className = 'kp-swatches__name';
        this.name.setAttribute('aria-hidden', 'true');
        /** @type {Swatch[]} */
        this.swatches = [];
        /** @type {string | null} */
        this.current = null;
    }

    connect() {
        const { host, grid } = this;
        if (!host.hasAttribute('role')) host.setAttribute('role', 'group');
        if (!host.hasAttribute('aria-label') && !host.hasAttribute('aria-labelledby')) host.setAttribute('aria-label', getStrings().swatchesLabel);
        host.replaceChildren(grid, this.name);
        this.listen(grid, 'click', (e) => this.onClick(/** @type {MouseEvent} */ (e)));
        this.listen(grid, 'keydown', (e) => this.onKey(/** @type {KeyboardEvent} */ (e)));
        this.own(watchOptions(host, [COLUMNS_ATTRIBUTE, NAME_ATTRIBUTE], () => this.paint()));
        this.paint();
    }

    /** @param {readonly Swatch[]} swatches @param {string | null} current */
    set(swatches, current) {
        this.swatches = swatches.map((swatch) => ({ ...swatch }));
        this.current = current;
        this.paint();
    }

    /** Draw the swatches; the one that held the focus keeps it. */
    paint() {
        const doc = this.host.ownerDocument;
        const had = doc.activeElement instanceof HTMLElement && this.grid.contains(doc.activeElement) ? doc.activeElement.dataset.kpValue : undefined;
        const cols = Math.max(1, Number.parseInt(this.host.getAttribute(COLUMNS_ATTRIBUTE) ?? '', 10) || 6);
        this.host.style.setProperty('--kp-swatches-columns', String(cols));
        const found = this.swatches.findIndex((swatch) => swatch.value === this.current);
        this.grid.replaceChildren(...this.swatches.map((swatch, i) => this.button(swatch, i, i === (found === -1 ? 0 : found))));
        const chosen = this.swatches[found];
        this.name.hidden = this.host.getAttribute(NAME_ATTRIBUTE) === 'off';
        this.name.textContent = chosen ? getStrings().swatchesChosen(chosen.label) : getStrings().swatchesNone;
        if (had !== undefined) this.buttonOf(had)?.focus();
    }

    /** @param {Swatch} swatch @param {number} index @param {boolean} stop whether it is the tab stop */
    button(swatch, index, stop) {
        const button = this.host.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'kp-swatches__swatch';
        button.dataset.kpValue = swatch.value;
        button.style.setProperty('--kp-swatch', colourOf(swatch, index));
        button.setAttribute('aria-pressed', String(swatch.value === this.current));
        button.setAttribute('aria-label', swatch.label);
        button.title = swatch.label;
        button.tabIndex = stop ? 0 : -1;
        return button;
    }

    /** @param {string} value */
    buttonOf(value) {
        return /** @type {HTMLButtonElement | undefined} */ ([...this.grid.children].find((b) => b instanceof HTMLElement && b.dataset.kpValue === value));
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const button = event.target instanceof Element ? event.target.closest('.kp-swatches__swatch') : null;
        if (button instanceof HTMLElement) this.pick(button.dataset.kpValue ?? '', event.detail === 0 ? 'keyboard' : 'pointer');
    }

    /** @param {KeyboardEvent} event */
    onKey(event) {
        const step = WALK[event.key];
        const buttons = /** @type {HTMLElement[]} */ ([...this.grid.children]);
        const at = buttons.indexOf(/** @type {HTMLElement} */ (event.target));
        if (!step || at === -1 || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        const next = buttons[step(at, this.columns(buttons), buttons.length)];
        for (const b of buttons) b.tabIndex = b === next ? 0 : -1;
        next?.focus();
    }

    /** The swatches on the first row as drawn (the grid may wrap sooner than its columns on a narrow picker). @param {HTMLElement[]} buttons */
    columns(buttons) {
        const top = buttons[0]?.offsetTop ?? 0;
        return Math.max(1, buttons.filter((b) => b.offsetTop === top).length);
    }

    /** A person picked a swatch. @param {string} value @param {'pointer' | 'keyboard'} source */
    pick(value, source) {
        const swatch = this.swatches.find((one) => one.value === value);
        if (!swatch) return;
        this.current = value;
        this.paint();
        this.buttonOf(value)?.focus();
        this.host.dispatchEvent(new CustomEvent(SWATCH_CHANGE_EVENT, { bubbles: true, detail: { value, label: swatch.label, source } }));
    }
}
