// One popover form [ux-1101]: its button opens a small form on the menu's raised plate, under the button and whole on the
// screen (the menu button's placement); Enter accepts, Escape closes and gives the focus back, a press outside or the focus
// leaving closes it (light dismiss), and it closes as it opened, backwards.

import { Controller } from '../controller.js';
import { playClose, stopClose } from '../motion.js';
import { coveredEdges } from '../menu-button/covered.js';
import { lowerMenu, placeMenu, raiseMenu, unplaceMenu } from '../menu-button/placement.js';
import { acceptForm, writeProblem } from './accept.js';
import { FIELDS, POPOVER_FORM_CLOSE_EVENT, POPOVER_FORM_OPEN_EVENT, POPOVER_FORM_PANEL } from './constants.js';
/** @typedef {import('./constants.js').CloseReason} CloseReason */
/** @typedef {import('../menu-button/types.js').MenuState} MenuState */

/** A number for the ids this module writes. */
let idSeq = 0;

export class PopoverFormControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The opener and the form; null when the markup lacks one, and then nothing is wired. */
        this.opener = /** @type {HTMLButtonElement | null} */ (host.querySelector(':scope > button'));
        this.form = /** @type {HTMLFormElement | null} */ (host.querySelector(`:scope > ${POPOVER_FORM_PANEL}`));
        /** The placing state the menu button's placement reads and writes. @type {MenuState | null} */
        this.place = null;
        /** What an open form listens to, undone when it closes. @type {(() => void)[]} */
        this.off = [];
    }

    connect() {
        const { opener, form, host } = this;
        if (!opener || !form) {
            console.warn('kp-popover-form: the wrapper needs a <button> and a form.kp-popover-form__panel as its children', host);
            return;
        }
        if (!form.id) form.id = `kp-popover-form-${(idSeq += 1)}`;
        form.setAttribute('role', 'dialog');
        form.setAttribute('novalidate', '');
        form.hidden = true;
        opener.setAttribute('aria-haspopup', 'dialog');
        opener.setAttribute('aria-controls', form.id);
        opener.setAttribute('aria-expanded', 'false');
        this.place = { wrapper: host, button: opener, menu: form, decorate: undefined, strings: undefined, drawn: '', pending: null, open: false, empty: false, off: [], placing: 0 };
        this.listen(opener, 'click', () => (this.isOpen() ? this.close('toggle', true) : this.open()));
        this.listen(form, 'submit', (event) => {
            event.preventDefault();
            void this.accept();
        });
        this.own(() => this.close('script', false));
    }

    isOpen() {
        return this.opener?.getAttribute('aria-expanded') === 'true';
    }

    /** Open it under its button with the first field focused and selected; what was typed last time is gone. */
    open() {
        const { form, opener, host, place } = this;
        const view = host.ownerDocument.defaultView;
        if (!form || !opener || !place || !view || this.isOpen()) return;
        stopClose(form);
        form.inert = false;
        form.reset();
        writeProblem(form, '');
        form.hidden = false;
        opener.setAttribute('aria-expanded', 'true');
        place.open = true;
        placeMenu(place, view, coveredEdges(view, host, form));
        raiseMenu(place, view);
        this.listenWhileOpen(view);
        const field = /** @type {HTMLInputElement | null} */ (form.querySelector(FIELDS));
        field?.focus();
        if (field && typeof field.select === 'function' && field.type !== 'range') field.select();
        host.dispatchEvent(new CustomEvent(POPOVER_FORM_OPEN_EVENT, { bubbles: true }));
    }

    /** Escape, a press outside and the focus leaving close it; a resize places it again. @param {Window} view */
    listenWhileOpen(view) {
        const doc = view.document;
        const inside = (/** @type {EventTarget | null} */ target) => target instanceof Node && this.host.contains(target);
        /** @param {KeyboardEvent} event */
        const escape = (event) => {
            if (event.key !== 'Escape') return;
            // Its own Escape: a dialog the form stands in does not close as well.
            event.preventDefault();
            event.stopPropagation();
            this.close('escape', true);
        };
        /** @param {MouseEvent} event */
        const outside = (event) => !inside(event.target) && this.close('outside', false);
        /** @param {FocusEvent} event */
        const left = (event) => event.relatedTarget && !inside(event.relatedTarget) && this.close('outside', false);
        const again = () => this.place && placeMenu(this.place, view, coveredEdges(view, this.host, this.form ?? undefined));
        view.addEventListener('keydown', escape, true);
        doc.addEventListener('pointerdown', outside, true);
        this.host.addEventListener('focusout', left);
        view.addEventListener('resize', again);
        this.off.push(
            () => view.removeEventListener('keydown', escape, true),
            () => doc.removeEventListener('pointerdown', outside, true),
            () => this.host.removeEventListener('focusout', left),
            () => view.removeEventListener('resize', again),
        );
    }

    /** Accept: closes, the focus back on the button, when the fields are valid and the page agreed. */
    async accept() {
        const { form, opener, host } = this;
        if (!form || !opener || !this.isOpen()) return;
        if (await acceptForm(host, form, opener)) this.close('accept', true);
    }

    /**
     * Close it, backwards; with `focus` the focus goes back to the button (Escape, accept, the button itself).
     * @param {CloseReason} reason @param {boolean} focus
     */
    close(reason, focus) {
        const { form, opener, place, host } = this;
        if (!form || !opener || !place || !this.isOpen()) return;
        opener.setAttribute('aria-expanded', 'false');
        place.open = false;
        for (const off of this.off.splice(0)) off();
        if (focus) opener.focus();
        form.inert = true;
        void playClose(form).then((played) => {
            if (!played || this.isOpen()) return;
            form.hidden = true;
            form.inert = false;
            lowerMenu(place);
            stopClose(form);
            unplaceMenu(form);
        });
        host.dispatchEvent(new CustomEvent(POPOVER_FORM_CLOSE_EVENT, { bubbles: true, detail: { reason } }));
    }
}
