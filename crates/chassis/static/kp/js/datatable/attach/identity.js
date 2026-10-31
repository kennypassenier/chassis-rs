// The table's id, its undo list and the arrival mark.
import { datatableState } from '../state.js';
import { getStrings } from '../../strings.js';
import { attachTableRegions } from '../../tables.js';
/** @typedef {import('../../strings/types.js').Strings} Strings */
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableIdentity {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        this.id = `kp-datatable-${datatableState.instances}`;
        /** Everything this attach put into the page, taken out again by detach. @type {Element[]} */
        this.added = [];
        /** @type {(() => void)[]} */
        this.undo = [];
        // The table redraws its own chrome (the group toggles, the pager, the
        // card sort) on every render; under js/motion.js each redraw arrived
        // again, held the box's glide and made a group's fold wait seconds
        // for them (Kenny, 2026-10-05). Unless the page says otherwise, only
        // what is new arrives [port spec G]; rows shown again still do.
        if (!this.t.wrap.closest('[data-kp-arrive]')) {
            this.t.wrap.setAttribute('data-kp-arrive', 'new');
            this.undo.push(() => this.t.wrap.removeAttribute('data-kp-arrive'));
        }
        this.s0 = getStrings();
        // The scroll box is a region a keyboard can reach [TH95]. Here as
        // well as in auto.js, because a consumer who attaches only the
        // data tables should not have to know about a second call to make
        // their table operable.
        if (this.t.settings.regions) this.t.own(attachTableRegions(this.t.wrap));
    }

    /** @template {Element} T @param {T} node @returns {T} */
    add(node) {
        this.added.push(node);
        return node;
    }

    /** @param {string} tag @param {string} [className] */
    make(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }
}
