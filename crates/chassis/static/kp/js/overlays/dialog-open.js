// Opening a dialog: modal, non-modal, or a drawer beside the list it edits [uxdialogs1101]; and opening it at the top.
import { DIALOG_OPEN_EVENT } from './constants.js';
import { forgetDialogEdits, requestDialogClose, whenDialogFree } from './dialog-guard.js';

/** A drawer that stands beside the page instead of over it. */
const BESIDE = 'dialog.kp-drawer[data-kp-drawer-mode="beside"]';
/** Under this width a beside drawer opens modal: there is no room beside anything (the package's phone width). */
const PHONE = '(max-width: 40rem)';
/** The row a drawer's opener sits in, marked while the drawer shows it. */
const ROW = '[data-kp-drawer-row], tr, li, [role="row"]';

/** The opener and the row a beside drawer shows. @type {WeakMap<HTMLDialogElement, { trigger: HTMLElement | null, row: Element | null }>} */
const shown = new WeakMap();

/**
 * Put a dialog that has just opened, and its `.kp-dialog__body`, back at
 * the top [scope-96]. A closed dialog keeps its scroll position, so a
 * long dialog scrolled and closed reopened where it was left (Kenny,
 * 2026-09-15: "Bovenaan openen"). Called after showModal()/show(), because
 * a closed dialog has no box to scroll. The one exception is focus: when
 * the element the dialog focused on opening lies below the fold, it is
 * scrolled back into view, as far as needed and no further, so focus is
 * never hidden.
 *
 * @param {HTMLDialogElement} dialog
 */
export function openAtTop(dialog) {
    const body = dialog.querySelector(':scope > .kp-dialog__body');
    for (const box of [dialog, body]) if (box) box.scrollTop = 0;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== dialog && dialog.contains(focused))
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Take the mark off the row the drawer showed. @param {HTMLDialogElement} dialog */
function unmark(dialog) {
    const was = shown.get(dialog) ?? { trigger: null, row: null };
    was.row?.removeAttribute('data-kp-drawer-current');
    was.trigger?.setAttribute('aria-expanded', 'false');
    shown.delete(dialog);
    return was;
}

/** Mark the row whose control opened the drawer, and say on the control that it is open. @param {HTMLDialogElement} dialog @param {HTMLElement | null} trigger */
function mark(dialog, trigger) {
    unmark(dialog);
    const row = trigger?.closest(ROW) ?? null;
    row?.setAttribute('data-kp-drawer-current', '');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
        if (dialog.id) trigger.setAttribute('aria-controls', dialog.id);
    }
    shown.set(dialog, { trigger, row });
}

/** A beside drawer has no backdrop and no Escape of its own: give it Escape, and give the focus back when it closes. @param {HTMLDialogElement} dialog */
function keepBeside(dialog) {
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !dialog.open) return;
        // A modal over it, or a menu or popover open, takes this Escape itself.
        if (document.querySelector('dialog:modal, :popover-open')) return;
        event.preventDefault();
        requestDialogClose(dialog, '', document.activeElement);
    };
    document.addEventListener('keydown', onKey);
    dialog.addEventListener(
        'close',
        () => {
            document.removeEventListener('keydown', onKey);
            const { trigger } = unmark(dialog);
            const focused = document.activeElement;
            const lost = !focused || focused === document.body || dialog.contains(focused);
            if (lost && trigger?.isConnected) trigger.focus();
        },
        { once: true },
    );
}

/** Tell the page the dialog opened (or, beside, moved to another row). @param {HTMLDialogElement} dialog @param {object} detail */
const announce = (dialog, detail) => dialog.dispatchEvent(new CustomEvent(DIALOG_OPEN_EVENT, { bubbles: true, detail }));

/**
 * Open a dialog the way it asks to be opened [uxdialogs1101]. A `dialog.kp-drawer` with `data-kp-drawer-mode="beside"`
 * opens with show(), marks the row of `trigger` (`data-kp-drawer-current`) and closes on Escape; pressed from another row
 * while open, it moves there (after the close guard's question, if its form changed) and announces itself again with
 * `moved: true`, so the page fills it with that row. Under 40rem it opens modal. Any other dialog opens with showModal(),
 * or show() when `modal` is false. Either way it opens at the top and fires `kp-dialog-open` `{ trigger, modal, beside, moved }`.
 * @param {HTMLDialogElement} dialog @param {{ trigger?: HTMLElement | null, modal?: boolean }} [options]
 */
export function openDialog(dialog, { trigger = null, modal = true } = {}) {
    const beside = dialog.matches(BESIDE) && !window.matchMedia(PHONE).matches;
    if (dialog.open) {
        if (!beside || !trigger || !shown.has(dialog) || shown.get(dialog)?.trigger === trigger) return;
        whenDialogFree(
            dialog,
            () => {
                forgetDialogEdits(dialog);
                mark(dialog, trigger);
                announce(dialog, { trigger, modal: false, beside, moved: true });
            },
            { from: trigger },
        );
        return;
    }
    const asModal = !beside && modal;
    if (asModal) dialog.showModal();
    else dialog.show();
    if (beside) {
        mark(dialog, trigger);
        keepBeside(dialog);
    }
    openAtTop(dialog);
    announce(dialog, { trigger, modal: asModal, beside, moved: false });
}
