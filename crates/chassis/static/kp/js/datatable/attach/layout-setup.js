// The grid mode, the held height, the cover box and the page-size select.
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

export class TableLayoutSetup {
    /** @param {DataTableControl} t */
    constructor(t) {
        /** The table this part belongs to. */
        this.t = t;
        // ── The grid's position line (#keyboard) ───────────────────────
        this.gridMode = this.t.wrap.dataset.kpGrid !== undefined;
        /** @type {HTMLElement | null} */
        this.gridReadout = null;
        if (this.gridMode) this.makeGridReadout();
        this.ensureFailedSlot();
        this.ensureEmptySlot();
        this.dressEmptySlot();
        if (this.t.controls.failedSlot !== null && this.t.controls.failedSlot.querySelector('.kp-stateplate__title') === null) this.titleFailedSlot();
        // ── The plate takes the table's place ───────────────────────────
        // A failed table, and a table with nothing to show, is not a notice under a table that is still drawn: the rows are
        // covered and the plate fills the height the table had with its rows (the last height it was measured at while it showed
        // rows), centred, with its normal-size action. Covered, not removed: the rows and their state stay in the document.
        // [state-plates-1019, Kenny 2026-10-16 "de hele grootte van de component gebruiken"]
        this.heldHeight = 0;
        this.coverBox = /** @type {HTMLElement} */ (this.t.chrome.tableBlock);
        this.coverSizes = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => {
                      if (this.coverBox.hasAttribute('data-kp-state-covered')) return;
                      const height = this.coverBox.getBoundingClientRect().height;
                      if (height > 0 && this.t.model.state === 'ready' && this.t.model.all.length > 0) this.heldHeight = height;
                  })
                : null;
        this.coverSizes?.observe(this.coverBox);
        this.t.identity.undo.push(() => {
            this.coverSizes?.disconnect();
            this.coverBox.removeAttribute('data-kp-state-covered');
            this.t.wrap.removeAttribute('data-kp-state-covered');
            for (const slot of [this.t.controls.failedSlot, this.t.controls.empty]) slot?.style.removeProperty('--kp-datatable-held');
        });
        // ── The page-size choice ───────────────────────────────────────
        /** @type {HTMLLabelElement | null} */
        this.sizeLabel = null;
        /** @type {HTMLSelectElement | null} */
        this.sizeSelect = null;
        if (this.t.controls.pager !== null && this.t.controls.sizes.length > 0) this.makeSizeSelect();
    }

    /** The grid's position line (#keyboard), under the table. */
    makeGridReadout() {
        this.gridReadout = this.t.identity.add(this.t.identity.make('p', 'kp-datatable__status kp-datatable__grid-readout'));
        this.gridReadout.dataset.kpDatatableGridReadout = '';
        this.gridReadout.setAttribute('aria-live', 'polite');
        this.gridReadout.textContent = this.t.identity.s0.tableGridStart;
        this.t.chrome.putUnder(this.gridReadout);
    }

    /** A failed slot for any table that wrote none, else the page's slot dressed as the package's failed plate. */
    ensureFailedSlot() {
        // Every table can fail, not only one that asks a server: a page that
        // loads its own rows and calls state('failed') or fail() showed only
        // "Showing 0 of 0" [fix-85]. The reason goes in the words.
        if (this.t.controls.failedSlot === null) {
            // The package's failed plate: the reason at heading size and a normal Retry, filling the table's footprint
            // while the rows are covered (syncCover) [state-plates-1019].
            this.t.controls.failedSlot = this.t.identity.add(this.t.identity.make('div', 'kp-alert kp-alert--destructive kp-stateplate kp-stateplate--error'));
            this.t.controls.failedSlot.dataset.kpDatatableFailed = '';
            this.t.controls.failedSlot.setAttribute('role', 'alert');
            this.t.controls.failedSlot.hidden = true;
            const text = this.t.identity.make('p', 'kp-stateplate__title');
            text.dataset.kpDatatableFailedReason = '';
            text.textContent = this.t.identity.s0.tableFailed;
            const retry = /** @type {HTMLButtonElement} */ (this.t.identity.make('button', 'kp-button kp-stateplate__action'));
            retry.type = 'button';
            retry.dataset.kpDatatableRetry = '';
            retry.textContent = this.t.identity.s0.tableRetry;
            this.t.controls.failedSlot.append(text, retry);
            this.t.wrap.insertBefore(this.t.controls.failedSlot, this.t.chrome.tableBlock);
        } else if (!this.t.controls.failedSlot.classList.contains('kp-stateplate')) {
            // A slot the page wrote is the same plate [state-plates-1019].
            const authored = this.t.controls.failedSlot;
            authored.classList.add('kp-stateplate', 'kp-stateplate--error');
            this.t.identity.undo.push(() => authored.classList.remove('kp-stateplate', 'kp-stateplate--error'));
        }
    }

    /** The empty plate: the package's for a table that wrote no slot, else the page's slot dressed as one. */
    ensureEmptySlot() {
        if (this.t.controls.empty === null) {
            // The package's empty plate for a table that wrote no slot: with no rows it showed nothing, a 43 px strip under the
            // header, not the plate [states-check-1019]. Hidden until there is nothing to show (showEmpty).
            this.t.controls.empty = this.t.identity.add(this.t.identity.make('div', 'kp-empty kp-stateplate kp-stateplate--empty'));
            this.t.controls.empty.dataset.kpDatatableEmpty = '';
            this.t.controls.empty.setAttribute('role', 'status');
            this.t.controls.empty.hidden = true;
            this.t.busy.emptyHidden = true;
            const none = this.t.identity.make('strong', 'kp-empty__title');
            none.textContent = this.t.identity.s0.tableEmpty;
            this.t.controls.empty.append(none);
            this.t.wrap.insertBefore(this.t.controls.empty, this.t.chrome.tableBlock);
        } else if (!this.t.controls.empty.classList.contains('kp-stateplate')) {
            const authored = this.t.controls.empty;
            authored.classList.add('kp-stateplate', 'kp-stateplate--empty');
            this.t.identity.undo.push(() => authored.classList.remove('kp-stateplate', 'kp-stateplate--empty'));
        }
    }

    /** The empty slot as a plate: hidden while the table is not ready, with a heading, and the page's bare words as its body text. */
    dressEmptySlot() {
        if (this.t.controls.empty !== null && this.t.model.state !== 'ready') {
            // A table that starts loading (or failed) has not found "nothing": an authored, visible empty slot is hidden at once.
            // Left visible, the first render withered it with leave(), about a second of a false claim [HL 145]. Detach restores it.
            this.t.controls.empty.hidden = true;
            this.t.busy.emptyHidden = true;
        }
        if (this.t.controls.empty !== null && this.t.controls.empty.querySelector('.kp-empty__title, .kp-stateplate__title') === null) {
            // A slot with words but no title gets the plate's heading (the dictionary's "Nothing found."), the words below it.
            const authored = this.t.controls.empty;
            const heading = this.t.identity.make('strong', 'kp-empty__title');
            heading.textContent = this.t.identity.s0.tableEmpty;
            authored.prepend(heading);
            this.t.identity.undo.push(() => heading.remove());
        }
        if (this.t.controls.empty !== null) {
            // Words a page wrote bare in the slot are the plate's body text, so the plate centres them with its title.
            for (const node of [...this.t.controls.empty.childNodes]) {
                if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
                const words = this.t.identity.make('span', 'kp-stateplate__text');
                node.replaceWith(words);
                words.append(node);
                this.t.identity.undo.push(() => words.replaceWith(node));
            }
        }
    }

    /** A failed slot a page wrote gets the plate's heading: its reason element, else the dictionary's words [states-check-1019]. */
    titleFailedSlot() {
        // A failed slot a page wrote gets the plate's heading: its reason element, else the dictionary's words [states-check-1019].
        const authoredFailed = /** @type {HTMLElement} */ (this.t.controls.failedSlot);
        const reason = authoredFailed.querySelector('[data-kp-datatable-failed-reason]');
        if (reason !== null) {
            reason.classList.add('kp-stateplate__title');
            this.t.identity.undo.push(() => reason.classList.remove('kp-stateplate__title'));
        } else {
            const heading = this.t.identity.make('strong', 'kp-stateplate__title');
            heading.dataset.kpDatatableFailedReason = '';
            heading.textContent = this.t.identity.s0.tableFailed;
            authoredFailed.prepend(heading);
            this.t.identity.undo.push(() => heading.remove());
        }
    }

    /** The page-size choice, beside the pager. */
    makeSizeSelect() {
        this.sizeLabel = /** @type {HTMLLabelElement} */ (this.t.identity.make('label', 'kp-datatable__label'));
        this.sizeSelect = /** @type {HTMLSelectElement} */ (this.t.identity.make('select', 'kp-field__input kp-datatable__select kp-datatable__page-size'));
        this.sizeSelect.dataset.kpDatatablePageSize = '';
        this.sizeSelect.setAttribute('aria-label', this.t.identity.s0.tableRowsPerPage);
        for (const n of this.t.controls.sizes) {
            const option = /** @type {HTMLOptionElement} */ (this.t.identity.make('option'));
            option.value = String(n);
            option.textContent = String(n);
            this.sizeSelect.append(option);
        }
        this.sizeSelect.value = String(this.t.controls.size);
        this.sizeLabel.append(this.t.identity.s0.tableRowsPerPage, ' ', this.sizeSelect);
    }

    syncCover() {
        const failedNow = this.t.model.state === 'failed' && this.t.controls.failedSlot !== null;
        const emptyNow = !failedNow && this.t.controls.empty !== null && !this.t.busy.emptyHidden;
        this.coverBox.toggleAttribute('data-kp-state-covered', failedNow || emptyNow);
        // js/footprint.js holds the whole table's loaded height while a plate stands in the rows' place.
        if (failedNow || emptyNow) this.t.wrap.setAttribute('data-kp-state-covered', failedNow ? 'error' : 'empty');
        else this.t.wrap.removeAttribute('data-kp-state-covered');
        for (const slot of [this.t.controls.failedSlot, this.t.controls.empty]) {
            if (slot === null) continue;
            const mine = (slot === this.t.controls.failedSlot && failedNow) || (slot === this.t.controls.empty && emptyNow);
            if (mine && this.heldHeight > 0) slot.style.setProperty('--kp-datatable-held', `${Math.round(this.heldHeight)}px`);
            else slot.style.removeProperty('--kp-datatable-held');
        }
    }
}
