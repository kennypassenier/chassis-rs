// The plate an empty or a failed palette list shows in the list's footprint, never a line in a corner.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { setHidden } from './intent-dom.js';

/** One palette's plate: the element, the list's height while it had commands, and the list's own height cap while we cap it. */
export class ListPlate {
    /** @param {HTMLDialogElement} dialog @param {HTMLElement} list */
    constructor(dialog, list) {
        this.dialog = dialog;
        this.list = list;
        /** @type {HTMLElement | null} */
        this.plate = null;
        /** The list's own height while it had commands, the footprint a plate keeps. */
        this.footprint = 0;
        /** What the list's own height cap was before a failed plate capped it; null while it is not capped by us. @type {string | null} */
        this.ownListCap = null;
    }

    /** The footprint is read from a list that shows commands, never from the few that stay under a failed plate. */
    measure() {
        const list = this.list;
        if (!list.hidden && list.offsetHeight > 0 && (this.plate === null || this.plate.hidden)) this.footprint = list.offsetHeight;
    }

    ensure() {
        if (this.plate) return this.plate;
        this.plate = this.dialog.ownerDocument.createElement('div');
        this.plate.className = 'kp-palette__nomatch';
        this.plate.hidden = true;
        this.list.after(this.plate);
        return this.plate;
    }

    /** `max-height` counts the padding and the border unless the list is border-box. @param {number} px */
    capList(px) {
        const list = this.list;
        this.ownListCap = list.style.getPropertyValue('--kp-palette-list-max-height');
        const cs = getComputedStyle(list);
        const frame =
            cs.boxSizing === 'border-box'
                ? 0
                : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        list.style.setProperty('--kp-palette-list-max-height', `${Math.max(px - frame, 0)}px`);
    }

    releaseListCap() {
        if (this.ownListCap === null) return;
        if (this.ownListCap) this.list.style.setProperty('--kp-palette-list-max-height', this.ownListCap);
        else this.list.style.removeProperty('--kp-palette-list-max-height');
        this.ownListCap = null;
    }

    hide() {
        if (this.plate) this.plate.hidden = true;
        this.releaseListCap();
        setHidden(this.list, false);
    }

    /**
     * Stand the plate in the list's footprint. A plate that replaces the list is as high as the list was. A plate above the commands
     * that stay (the failed one) is as high as the list was minus those commands, so the palette keeps its loaded footprint in a
     * failed state too [t56-shared3-1018].
     * @param {'empty' | 'error'} kind @param {string} title @param {string} text @param {boolean} replacesList
     */
    show(kind, title, text, replacesList) {
        const { dialog, list } = this;
        const holder = this.ensure();
        const s = getStrings();
        const retry = { actionLabel: s.paletteRetry, onAction: () => dialog.dispatchEvent(new CustomEvent('kp-palette-retry', { bubbles: true })) };
        holder.replaceChildren(statePlate(dialog.ownerDocument, { kind, title, text, ...(kind === 'error' ? retry : {}) }));
        holder.toggleAttribute('data-kp-above', !replacesList);
        holder.hidden = false;
        setHidden(list, replacesList);
        this.releaseListCap();
        const staying = replacesList || list.hidden ? 0 : list.offsetHeight;
        holder.style.setProperty('--kp-palette-plate-height', '0px');
        // The plate needs room for its words and its action; when the commands that stay take more than what is left, they scroll.
        const needed = holder.offsetHeight;
        const room = Math.max(this.footprint - staying, needed);
        holder.style.setProperty('--kp-palette-plate-height', `${room}px`);
        if (staying > 0 && staying + room > this.footprint) this.capList(Math.max(this.footprint - room, 0));
    }

    remove() {
        this.plate?.remove();
        this.plate = null;
        setHidden(this.list, false);
    }
}
