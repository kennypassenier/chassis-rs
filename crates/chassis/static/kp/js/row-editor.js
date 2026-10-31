// The repeating row editor: rows of controls that a person adds and removes [mc-1030; Medicine Cabinet "When to take it"].
//
// A medicine has one to several slots of a time, the days it runs on and a dose. The package has the parts (kp-time, kp-weekdays,
// kp-quantity); this is the container that repeats them. The columns run through every row and the labels stand once, in a head row
// over the first row; the remove button is the last cell of each row. A row is a copy of the template, so every row is the package's own
// controls attached as the page's boot attached the first (js/auto/loader.js).
//
//   <div class="kp-rows" data-kp-rows data-kp-rows-min="1" data-kp-rows-max="6" data-kp-rows-unit="time,times" aria-label="When to take it">
//       <ol class="kp-rows__list" data-kp-rows-list>
//           <li class="kp-rows__row">
//               <div class="kp-rows__cell" data-label="Time"><div class="kp-time" data-kp-time data-kp-value="08:00" data-kp-label="Time"></div></div>
//               …
//           </li>
//       </ol>
//       <template data-kp-rows-template> <li class="kp-rows__row"> … {n} … </li> </template>
//       <button type="button" class="kp-button" data-kp-rows-add></button>
//   </div>
//
// What it writes when the markup leaves it out: the head row (the first row's `data-label`s), the remove button in each row, the add
// button, the status line and, with no row held, the package's empty plate. `{n}` in the template is a number that is never reused, so
// ids and names stay unique. Options (attributes on the host, each with a default):
//   data-kp-rows-min      the fewest rows            0   (at the fewest, removing is off and the line says why)
//   data-kp-rows-max      the most rows              none (at the most, adding is off and the line says why)
//   data-kp-rows-unit     "time,times": the words    from the dictionary ("row,rows")
//   data-kp-rows-attach   "none": the page attaches the controls of a new row itself
//
// Events (bubbling, on the host): kp-rows-add and kp-rows-remove `{ row, index, count }`, kp-rows-change `{ count, rows }` after either.
// The page reads the values from each row's own controls. Calls: addEditorRow(host), removeEditorRow(host, row), editorRowsOf(host).
//
// Every word is in js/strings.js; nothing runs on import; attachRowEditors(root) returns a detach.

import { Controller, attachAll, controllerOf } from './controller.js';
import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';

export const ROWS = '[data-kp-rows]';

/** The focusable things a new row hands the focus to, first one wins. */
const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), button:not(:disabled), select:not(:disabled), [tabindex="0"]';

/** @param {string | null} value @param {number} fallback */
const whole = (value, fallback) => {
    const n = Number.parseInt(value ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** One editor: its rows, its template and its head, add button and status line. */
export class RowEditor extends Controller {
    /** @param {HTMLElement} host */
    constructor(host) {
        super(host);
        /** The number the next row's `{n}` takes. */
        this.serial = 0;
        /** The detach of the controls inside each row. @type {Map<Element, () => void>} */
        this.inside = new Map();
        /** The plate shown while no row is held. @type {HTMLElement | null} */
        this.plate = null;
    }

    get list() {
        return /** @type {HTMLElement} */ (this.host.querySelector('[data-kp-rows-list]') ?? this.makeList());
    }

    get min() {
        return whole(this.host.getAttribute('data-kp-rows-min'), 0);
    }

    /** The most rows, or Infinity. */
    get max() {
        return whole(this.host.getAttribute('data-kp-rows-max'), Number.POSITIVE_INFINITY);
    }

    /** The unit's two words, from the markup or the dictionary. @returns {[string, string]} */
    get units() {
        const [one, many] = (this.host.getAttribute('data-kp-rows-unit') ?? '').split(',').map((word) => word.trim());
        const s = getStrings();
        return [one || s.rowsUnitOne, many || one || s.rowsUnitMany];
    }

    connect() {
        this.serial = this.rows().length;
        this.ensureParts();
        this.listen(this.host, 'click', (event) => this.onClick(event));
        // The fewest, the most and the unit are options that can change at runtime, like the other options.
        this.observe(new MutationObserver(() => this.sync())).observe(this.host, {
            attributes: true,
            attributeFilter: ['data-kp-rows-min', 'data-kp-rows-max', 'data-kp-rows-unit'],
        });
        this.own(() => this.release());
        this.sync();
    }

    /** The rows, in order. @returns {HTMLElement[]} */
    rows() {
        return /** @type {HTMLElement[]} */ ([...this.list.children]).filter((el) => el.classList.contains('kp-rows__row'));
    }

    /** @returns {HTMLElement} */
    makeList() {
        const list = this.host.ownerDocument.createElement('ol');
        list.className = 'kp-rows__list';
        list.setAttribute('data-kp-rows-list', '');
        this.host.prepend(list);
        return list;
    }

    /** The parts the markup left out: the head row, the add button and the status line. */
    ensureParts() {
        const doc = this.host.ownerDocument;
        if (!this.host.querySelector(':scope > .kp-rows__head')) this.makeHead(doc);
        if (!this.host.querySelector('[data-kp-rows-add]')) {
            const add = doc.createElement('button');
            add.type = 'button';
            add.className = 'kp-button';
            add.setAttribute('data-kp-rows-add', '');
            this.host.append(add);
        }
        if (!this.host.querySelector('.kp-rows__status')) {
            const status = doc.createElement('p');
            status.className = 'kp-rows__status';
            status.setAttribute('role', 'status');
            this.host.append(status);
        }
    }

    /** The labels once, over the columns, from the labels of the first row (or of the template). @param {Document} doc */
    makeHead(doc) {
        const sample = this.rows()[0] ?? this.template()?.content.firstElementChild;
        const labels = [...(sample?.querySelectorAll(':scope > [data-label]') ?? [])];
        if (labels.length === 0) return;
        const head = doc.createElement('div');
        head.className = 'kp-rows__head';
        head.setAttribute('aria-hidden', 'true');
        for (const cell of labels) {
            const label = doc.createElement('span');
            label.className = 'kp-rows__label';
            label.textContent = cell.getAttribute('data-label');
            head.append(label);
        }
        this.host.insertBefore(head, this.list);
    }

    /** @returns {HTMLTemplateElement | null} */
    template() {
        return this.host.querySelector('template[data-kp-rows-template]');
    }

    /** @param {Event} event */
    onClick(event) {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-kp-rows-add]')) this.add();
        else {
            const remove = target?.closest('[data-kp-rows-remove]');
            const row = remove?.closest('.kp-rows__row');
            if (row instanceof HTMLElement && row.parentElement === this.list) this.remove(row);
        }
    }

    /** Add a row from the template. @returns {HTMLElement | null} */
    add() {
        const template = this.template();
        if (!template || this.rows().length >= this.max) return null;
        const row = /** @type {HTMLElement} */ (template.content.firstElementChild?.cloneNode(true));
        this.serial += 1;
        this.number(row, this.serial);
        this.list.append(row);
        this.wire(row);
        const index = this.rows().length;
        this.sync();
        this.emit('kp-rows-add', row, index);
        /** @type {HTMLElement | null} */ (row.querySelector(FOCUSABLE))?.focus();
        this.say(getStrings().rowsAdded(this.units[0], index, index));
        return row;
    }

    /** Take a row away; the focus goes to the row now in its place, else to the add button. @param {HTMLElement} row */
    remove(row) {
        const rows = this.rows();
        const at = rows.indexOf(row);
        if (at < 0 || rows.length <= this.min) return;
        this.inside.get(row)?.();
        this.inside.delete(row);
        row.remove();
        const left = this.rows();
        this.sync();
        this.emit('kp-rows-remove', row, at + 1);
        const next = left[Math.min(at, left.length - 1)];
        const focus = next?.querySelector(FOCUSABLE) ?? this.host.querySelector('[data-kp-rows-add]');
        /** @type {HTMLElement | null} */ (focus)?.focus();
        this.say(getStrings().rowsRemoved(this.units[0], at + 1, left.length));
    }

    /** Give `{n}` in a new row's attributes and text its number. @param {Element} row @param {number} n */
    number(row, n) {
        for (const el of [row, ...row.querySelectorAll('*')]) {
            for (const attribute of el.getAttributeNames()) {
                const value = el.getAttribute(attribute) ?? '';
                if (value.includes('{n}')) el.setAttribute(attribute, value.replaceAll('{n}', String(n)));
            }
            for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('{n}')) node.textContent = node.textContent.replaceAll('{n}', String(n));
        }
    }

    /** Attach the package's controls inside a new row, as the boot attached the first rows'. @param {HTMLElement} row */
    wire(row) {
        if (this.host.getAttribute('data-kp-rows-attach') === 'none') return;
        import('./auto/loader.js').then(({ AutoLoader }) => {
            if (this.destroyed || !row.isConnected) return;
            this.inside.set(row, new AutoLoader(row).start());
        });
    }

    /** Write what depends on the count: the remove buttons, the add button, the plate and the line under the rows. */
    sync() {
        const doc = this.host.ownerDocument;
        const s = getStrings();
        const rows = this.rows();
        const [unit, units] = this.units;
        const atMin = rows.length <= this.min;
        const atMax = rows.length >= this.max;
        for (const [at, row] of rows.entries()) {
            let button = row.querySelector('[data-kp-rows-remove]');
            if (!button) {
                button = doc.createElement('button');
                button.className = 'kp-button kp-rows__remove';
                button.setAttribute('data-kp-rows-remove', '');
                button.setAttribute('type', 'button');
                button.textContent = '×';
                row.append(button);
            }
            button.setAttribute('aria-label', s.rowsRemove(unit, at + 1));
            button.toggleAttribute('aria-disabled', atMin);
            if (atMin) button.setAttribute('aria-disabled', 'true');
        }
        const add = this.host.querySelector('[data-kp-rows-add]');
        if (add) {
            if (!add.textContent?.trim() || add.hasAttribute('data-kp-rows-written')) {
                add.textContent = s.rowsAdd(unit);
                add.setAttribute('data-kp-rows-written', '');
            }
            add.toggleAttribute('aria-disabled', atMax);
            if (atMax) add.setAttribute('aria-disabled', 'true');
        }
        const status = this.host.querySelector('.kp-rows__status');
        if (status) status.textContent = atMax ? s.rowsAtMax(this.max, units) : atMin && this.min > 0 ? s.rowsAtMin(this.min, this.min === 1 ? unit : units) : '';
        this.host.toggleAttribute('data-kp-rows-empty', rows.length === 0);
        this.paintPlate(rows.length === 0);
    }

    /** The package's empty plate while no row is held, in the room the rows had. @param {boolean} empty */
    paintPlate(empty) {
        if (!empty) {
            this.plate?.remove();
            this.plate = null;
            return;
        }
        if (this.plate) return;
        const s = getStrings();
        this.plate = statePlate(this.host.ownerDocument, { kind: 'empty', title: s.rowsEmptyTitle(this.units[1]), text: s.rowsEmptyText(this.units[0]) });
        this.plate.classList.add('kp-rows__empty');
        this.list.after(this.plate);
    }

    /** Say something to a screen reader, in the status line. @param {string} words */
    say(words) {
        const live = this.host.querySelector('.kp-rows__live') ?? this.host.appendChild(this.makeLive());
        live.textContent = '';
        queueMicrotask(() => {
            live.textContent = words;
        });
    }

    /** @returns {HTMLElement} */
    makeLive() {
        const live = this.host.ownerDocument.createElement('span');
        live.className = 'kp-sr-only kp-rows__live';
        live.setAttribute('role', 'status');
        return live;
    }

    /** @param {string} type @param {HTMLElement} row @param {number} index */
    emit(type, row, index) {
        const rows = this.rows();
        this.host.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { row, index, count: rows.length } }));
        this.host.dispatchEvent(new CustomEvent('kp-rows-change', { bubbles: true, detail: { count: rows.length, rows } }));
    }

    /** Let go of the controls inside the rows and of what this wrote. */
    release() {
        for (const detach of this.inside.values()) detach();
        this.inside.clear();
        this.plate?.remove();
        this.host.removeAttribute('data-kp-rows-empty');
    }
}

/**
 * Wire every row editor under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachRowEditors(root = document) {
    return attachAll(root, ROWS, RowEditor);
}

/**
 * The rows an editor holds, in order.
 * @param {Element} host
 * @returns {HTMLElement[]}
 */
export function editorRowsOf(host) {
    return controllerOf(/** @type {HTMLElement} */ (host), RowEditor)?.rows() ?? [];
}

/**
 * Add a row from the template, as the add button does.
 * @param {Element} host
 * @returns {HTMLElement | null} the new row, or null when the editor is at its most
 */
export function addEditorRow(host) {
    return controllerOf(/** @type {HTMLElement} */ (host), RowEditor)?.add() ?? null;
}

/**
 * Remove a row, as its remove button does (nothing happens at the fewest rows).
 * @param {Element} host
 * @param {HTMLElement} row
 */
export function removeEditorRow(host, row) {
    controllerOf(/** @type {HTMLElement} */ (host), RowEditor)?.remove(row);
}
