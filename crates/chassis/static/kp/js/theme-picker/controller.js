// One picker: the choice a press makes, the preview on hover and keyboard focus, and the marks that follow the theme.

import { applyTheme, currentTheme, initializeTheme, onThemeChange, pendingTheme, storeTheme } from '../theme-core.js';
import { OPTION, PICK_EVENT } from './values.js';
import { clearMarks, markSelection, showSaveState } from './marks.js';
import { PickerPreview } from './preview.js';

/**
 * A labelled trigger names the theme worn (themeMenuMarkup's `trigger: 'label'`) [kitchen-1101, chassis-rs gap 24].
 * @param {Element} picker @param {string} theme
 */
function nameTrigger(picker, theme) {
    const trigger = picker.closest('.kp-theme-menu')?.querySelector('[data-kp-theme-trigger="label"]');
    const name = picker.querySelector(`[data-kp-theme="${CSS.escape(theme)}"]`)?.textContent?.trim();
    if (!(trigger instanceof HTMLElement) || !name) return;
    const current = trigger.querySelector('.kp-theme-menu__current');
    if (current) current.textContent = name;
    trigger.setAttribute('aria-label', `${trigger.dataset.kpThemeLabel ?? ''}: ${name}`);
}

/**
 * Name the menu's trigger and tie its popover to that name through CSSOM, which a `style-src 'self'` policy allows
 * and a parsed `style` attribute in the markup would not [csp-1103].
 * @param {Element} picker
 */
function anchorMenu(picker) {
    const popover = picker.closest('[popover]');
    if (!(popover instanceof HTMLElement) || !popover.id) return;
    const trigger = popover.closest('.kp-theme-menu')?.querySelector(`[popovertarget="${CSS.escape(popover.id)}"]`);
    if (!(trigger instanceof HTMLElement)) return;
    trigger.style.setProperty('anchor-name', `--${popover.id}`);
    popover.style.setProperty('position-anchor', `--${popover.id}`);
}

export class ThemePicker extends PickerPreview {
    connect() {
        const picker = this.host;
        anchorMenu(picker);
        picker.dataset.kpThemeAttached = '1';
        // Registered first, so it runs last on detach: the mark and the selection marks go after everything else.
        this.own(() => {
            delete picker.dataset.kpThemeAttached;
            clearMarks(picker);
        });
        this.listen(picker, 'click', (event) => this.onClick(event));
        // A preview: a theme shown while the pointer or the keyboard rests on its button, never chosen by it.
        this.listen(picker, 'pointerover', (event) => this.onEnter(/** @type {PointerEvent} */ (event)));
        this.listen(picker, 'pointerleave', () => this.leaveSoon());
        this.listen(picker, 'focusin', (event) => this.onFocusIn(/** @type {FocusEvent} */ (event)));
        this.listen(picker, 'focusout', () => this.leaveSoon());
        // A menu that closes ends the look.
        const popover = /** @type {HTMLElement | null} */ (picker.closest('[popover]'));
        if (popover) this.listen(popover, 'toggle', (event) => this.onToggle(event));
        // The no-flash snippet copies the stored name onto <html> without
        // reading it, because knowing the theme list is not its job
        // [TH23]. This is the first moment anything can check it, so an
        // unknown value becomes the default here rather than surviving as
        // a data-theme no stylesheet answers to.
        markSelection(picker, initializeTheme(currentTheme()));
        // A change from anywhere (another menu, applyTheme, another tab) renames a labelled trigger too [k420-1102].
        this.own(onThemeChange((theme) => nameTrigger(picker, theme)));
        nameTrigger(picker, currentTheme());
        this.own(() => this.stopPreview());
    }

    /** A press on an option: end the look, apply the theme, store it, say so, and close an enclosing menu. @param {Event} event */
    onClick(event) {
        const picker = this.host;
        const { persist = true, closePopover = true, status = null } = this.options;
        const option = /** @type {HTMLElement} */ (event.target).closest(OPTION);
        if (!option || !picker.contains(option)) return;
        const next = /** @type {HTMLElement} */ (option).dataset.kpTheme;
        if (!next) return;
        // A choice ends the look: a preview on the root is made real by applyTheme itself (no step back to the old theme in
        // between), one on a sample element is taken off it.
        this.settlePreview();
        // A change held for its register [scope-50] leaves the root on
        // the previous theme for now; the choice is still this one, and
        // storing the theme still worn would undo it on the next load.
        const applied = applyTheme(next);
        const chosen = pendingTheme() ?? applied;
        const stored = persist ? storeTheme(chosen) : true;
        showSaveState(/** @type {ParentNode} */ (status ?? picker.parentNode ?? document), !stored);
        nameTrigger(picker, chosen);
        picker.dispatchEvent(new CustomEvent(PICK_EVENT, { bubbles: true, detail: { theme: chosen, stored } }));
        // A picker inside a menu closes it: leaving the menu open
        // after a choice makes it look as though the click missed.
        /** @type {HTMLElement | null} */
        const popover = closePopover ? picker.closest('[popover]') : null;
        if (popover && popover.matches(':popover-open')) popover.hidePopover();
    }

    /** @param {PointerEvent} event */
    onEnter(event) {
        if (!this.wantsPreview() || event.pointerType === 'touch') return;
        const theme = this.optionOf(event)?.dataset.kpTheme;
        if (theme) void this.startPreview(theme);
    }

    /** @param {FocusEvent} event */
    onFocusIn(event) {
        if (!this.wantsPreview()) return;
        const option = this.optionOf(event);
        // The keyboard only: a press focuses the button too, and that press is a choice, not a look.
        if (!option || !option.matches(':focus-visible')) return;
        if (option.dataset.kpTheme) void this.startPreview(option.dataset.kpTheme);
    }

    /** @param {Event} event */
    onToggle(event) {
        if (/** @type {ToggleEvent} */ (event).newState === 'closed') this.stopPreview();
    }
}
