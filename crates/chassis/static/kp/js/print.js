// Lists that print well: the words a sheet needs [kpadopt6-media; kp-soft's packing list and shopping list, on kp-checklist].
//
// The look of a printed list is css/_print.css (black on white, drawn boxes, no controls, only `@media print`). This module adds the
// few things CSS cannot: the date of printing, a title where the page gives one, the sentence a list that has no rows would
// otherwise print as a blank sheet, folded groups opened for the paper, and a Print button.
//
//   <div class="kp-checklist" data-kp-checklist data-kp-print-title="Packing list" data-kp-print-done="show"></div>
//   <button class="kp-button" data-kp-print-action>Print this list</button>
//
// Options (markup, each with a default [KT6]; the same names are the options of `attachPrint(root, options)`):
//   data-kp-print            include | exclude: a part the sheet keeps or drops          include for a checklist, exclude for controls
//   data-kp-print-done       show | hide | strike: a ticked item                           show (a filled box and a tick, the text kept)
//   data-kp-print-box        square | round                                               square
//   data-kp-print-groups     keep | columns: group headings stay with their first items; two columns for a long list   keep
//   data-kp-print-title      text, or auto: the page's <h1>                               auto
//   data-kp-print-date       on | off: "Printed dd/mm/yyyy HH:MM" at the foot             on
//   data-kp-print-notes      show | hide: the detail line of an item                      show
//   data-kp-print-notes-lines  present: a dotted leader for handwritten notes              off
//   data-kp-print-links      url | none: the address after a link                         none inside a checklist
//   --kp-print-box           the drawn box (1.1em, never under 4 mm)
//
// On `beforeprint` the folded groups open and the title, the date and the state sentence are put in; on `afterprint` everything is
// put back, so the screen is as it was. Nothing runs on import.

import { getStrings } from './strings.js';
import { agoMoment } from './freshness.js';

/** A part this module looks after. */
export const PRINT_ACTION = '[data-kp-print-action]';
/** The lists whose sheet this module dresses. */
export const PRINT_SHEETS = '[data-kp-checklist], [data-kp-print-sheet]';
/** Fired on the document just before the sheet is built: `{ sheets }`. */
export const PRINT_EVENT = 'kp-print-prepare';

/**
 * @typedef {object} PrintOptions
 * @property {() => number} [now] the clock (a test fixes it)
 * @property {string} [timeZone]
 */

/**
 * Put in the words a sheet needs, and return what takes them out again.
 * @param {Document} doc @param {PrintOptions} [options]
 * @returns {() => void}
 */
export function preparePrint(doc, { now = () => Date.now(), timeZone } = {}) {
    const strings = getStrings();
    /** @type {(() => void)[]} */
    const undo = [];
    const sheets = /** @type {HTMLElement[]} */ ([...doc.querySelectorAll(PRINT_SHEETS)]);
    doc.dispatchEvent(new CustomEvent(PRINT_EVENT, { detail: { sheets } }));
    for (const sheet of sheets) {
        // Folded groups are opened for the paper.
        for (const folded of sheet.querySelectorAll('details:not([open])')) {
            folded.setAttribute('open', '');
            undo.push(() => folded.removeAttribute('open'));
        }
        // A title the sheet names itself; "auto" is the page's own <h1>, which prints.
        const title = sheet.getAttribute('data-kp-print-title');
        if (title && title !== 'auto') {
            const heading = doc.createElement('p');
            heading.className = 'kp-print-title';
            heading.textContent = title;
            sheet.before(heading);
            undo.push(() => heading.remove());
        }
        // A list that has no rows prints why, never a blank sheet.
        const state = sheet.getAttribute('data-kp-state');
        const hasRows = sheet.querySelector('.kp-checklist__item') !== null;
        if (!hasRows && (state === 'loading' || sheet.hasAttribute('aria-busy'))) {
            const line = doc.createElement('p');
            line.className = 'kp-print-state';
            line.textContent = strings.printLoading;
            sheet.append(line);
            undo.push(() => line.remove());
        }
    }
    // The date of printing, once at the foot of every page.
    if (sheets.length > 0 && sheets.some((sheet) => sheet.getAttribute('data-kp-print-date') !== 'off') && !doc.querySelector('.kp-print-stamp')) {
        const stamp = doc.createElement('p');
        stamp.className = 'kp-print-stamp';
        stamp.textContent = strings.printStamp(agoMoment(now(), timeZone));
        doc.body.append(stamp);
        undo.push(() => stamp.remove());
    }
    return () => {
        for (const fn of undo.reverse()) fn();
    };
}

/**
 * Wire the Print buttons and the before/after print hooks of the page.
 * @param {ParentNode} [root]
 * @param {PrintOptions} [options]
 * @returns {() => void} detach
 */
export function attachPrint(root = document, options = {}) {
    const doc = root instanceof Document ? root : /** @type {Element} */ (root).ownerDocument;
    const view = doc.defaultView;
    /** @type {(() => void)[]} */
    const cleanups = [];
    for (const button of root.querySelectorAll(PRINT_ACTION)) {
        if (!(button instanceof HTMLElement) || button.dataset.kpPrintAttached !== undefined) continue;
        button.dataset.kpPrintAttached = '';
        const onClick = () => view?.print();
        button.addEventListener('click', onClick);
        cleanups.push(() => {
            button.removeEventListener('click', onClick);
            delete button.dataset.kpPrintAttached;
        });
    }
    if (view && !HOOKED.has(doc)) {
        HOOKED.add(doc);
        /** @type {(() => void) | null} */
        let restore = null;
        const before = () => {
            restore?.();
            restore = preparePrint(doc, options);
        };
        const after = () => {
            restore?.();
            restore = null;
        };
        view.addEventListener('beforeprint', before);
        view.addEventListener('afterprint', after);
        cleanups.push(() => {
            view.removeEventListener('beforeprint', before);
            view.removeEventListener('afterprint', after);
            after();
            HOOKED.delete(doc);
        });
    }
    return () => {
        for (const clean of cleanups) clean();
    };
}

/** Documents whose print hooks are in. @type {WeakSet<Document>} */
const HOOKED = new WeakSet();
