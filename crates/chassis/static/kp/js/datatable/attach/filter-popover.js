// The filter panel as a popover under its Filters button: it opens over the table, the table does not move [ux-1101, table-filters].
// `data-kp-filters="inline"` on a table keeps the old panel that pushes the table down.
/** @typedef {import('./controller.js').DataTableControl} DataTableControl */

/** The package's own popover surface, so the panel wears every theme's plate. */
const SURFACE_CLASS = 'kp-popover';
/** The marker the stylesheet places and sizes the panel by. */
const MARK = 'data-kp-filters-popover';
/** Clicks inside these never close the panel: a date bound's calendar belongs to it. */
const KEEP_OPEN = '[data-kp-date-panel], [data-kp-datepicker]';

export class FilterPopover {
    /** @param {DataTableControl} t @param {HTMLElement} panel @param {HTMLElement} toggle */
    constructor(t, panel, toggle) {
        /** The table this part belongs to. */
        this.t = t;
        this.panel = panel;
        this.toggle = toggle;
        this.onPointer = this.closeOnOutside.bind(this);
        this.onKey = this.closeOnEscape.bind(this);
        this.dress();
        t.own(() => this.release());
    }

    /** Whether a table asked for the popover: the default, `data-kp-filters="inline"` is the old panel. @param {DataTableControl} t */
    static wanted(t) {
        return t.wrap.dataset.kpFilters !== 'inline';
    }

    /** Make the panel a popover anchored to the toggle; the detach puts the page's markup back. */
    dress() {
        const { panel, toggle } = this;
        const anchor = `--${panel.id}`;
        const addedClass = !panel.classList.contains(SURFACE_CLASS);
        if (addedClass) panel.classList.add(SURFACE_CLASS);
        panel.setAttribute('popover', 'manual');
        panel.setAttribute(MARK, '');
        panel.style.setProperty('position-anchor', anchor);
        toggle.style.setProperty('anchor-name', anchor);
        this.t.identity.undo.push(() => {
            this.close(false);
            if (addedClass) panel.classList.remove(SURFACE_CLASS);
            panel.removeAttribute('popover');
            panel.removeAttribute(MARK);
            panel.style.removeProperty('position-anchor');
            toggle.style.removeProperty('anchor-name');
        });
    }

    get isOpen() {
        return !this.panel.hidden;
    }

    /** @param {boolean} open @param {boolean} [focus]  move the focus in (a reader's press), not for a panel that opens with the page */
    setOpen(open, focus = false) {
        if (open) this.open(focus);
        else this.close(focus);
    }

    /** @param {boolean} focus */
    open(focus) {
        this.panel.hidden = false;
        if (this.panel.isConnected && !this.panel.matches(':popover-open')) this.panel.showPopover();
        this.toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', this.onPointer, true);
        document.addEventListener('keydown', this.onKey, true);
        if (focus) /** @type {HTMLElement | null} */ (this.panel.querySelector('input, button'))?.focus();
    }

    /** @param {boolean} giveFocusBack */
    close(giveFocusBack) {
        document.removeEventListener('pointerdown', this.onPointer, true);
        document.removeEventListener('keydown', this.onKey, true);
        if (this.panel.isConnected && this.panel.matches(':popover-open')) this.panel.hidePopover();
        this.panel.hidden = true;
        this.toggle.setAttribute('aria-expanded', 'false');
        if (giveFocusBack) this.toggle.focus();
    }

    /** Light dismiss: a press anywhere but the panel, its button or its calendar. @param {PointerEvent} event */
    closeOnOutside(event) {
        const target = /** @type {Element | null} */ (event.target instanceof Element ? event.target : null);
        if (target === null || this.panel.contains(target) || this.toggle.contains(target) || target.closest(KEEP_OPEN) !== null) return;
        this.close(false);
    }

    /** @param {KeyboardEvent} event */
    closeOnEscape(event) {
        if (event.key !== 'Escape' || !this.panel.contains(/** @type {Node} */ (document.activeElement))) return;
        event.stopPropagation();
        this.close(true);
    }

    /** Stop listening to the page. */
    release() {
        document.removeEventListener('pointerdown', this.onPointer, true);
        document.removeEventListener('keydown', this.onKey, true);
    }
}
