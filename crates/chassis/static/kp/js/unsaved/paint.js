// Paints one unsaved bar from its changes: the state, the words, the buttons and the More menu, the list, and the count event.

import { setMenu } from '../menu-button.js';
import { ANNOUNCE_DELAY_MS, UNSAVED_CHANGE_EVENT } from './config.js';
import { buildEntry, paintSaveButton } from './parts.js';

/** @typedef {import('./controller.js').UnsavedController} UnsavedController */
/** @typedef {import('./config.js').UnsavedChange} UnsavedChange */

/**
 * Bring the whole bar in line with the changes now: states, words, buttons, menu, list, event, keeping, dock.
 * @param {UnsavedController} ctl
 */
export function paintBar(ctl) {
    const changes = ctl.tracker.changes();
    const n = changes.length;
    const dirty = n > 0;
    paintState(ctl, n, dirty);
    paintButtons(ctl, n, dirty);
    paintList(ctl, changes);
    if (n !== ctl.lastCount) countChanged(ctl, n, changes);
    if (!dirty && !ctl.parts.panel.hidden) void ctl.panel.close(false);
    ctl.dock.dock();
    ctl.dock.compact();
}

/** The state attributes and the words that follow the count. @param {UnsavedController} ctl @param {number} n @param {boolean} dirty */
function paintState(ctl, n, dirty) {
    const { s } = ctl;
    const { bar, none, chip, headTitle } = ctl.parts;
    const state = ctl.saving ? 'saving' : dirty ? 'dirty' : 'clean';
    ctl.el.dataset.kpState = state;
    bar.dataset.kpState = state;
    none.hidden = dirty;
    chip.hidden = !dirty;
    chip.textContent = s.unsavedCount(n);
    headTitle.textContent = s.unsavedCount(n);
}

/** Save, Discard and More: words, disabled reasons and the More menu. @param {UnsavedController} ctl @param {number} n @param {boolean} dirty */
function paintButtons(ctl, n, dirty) {
    const { s, saving } = ctl;
    const { save, discard, moreButton, chip, more } = ctl.parts;
    const { saveLabel } = ctl.settings;
    const label = dirty ? (saveLabel ? saveLabel.replace('{n}', String(n)) : s.unsavedSave(n)) : s.unsavedSaveNone;
    paintSaveButton(ctl.doc, save, label, saving);
    const offReason = saving ? s.unsavedSavingNow : s.unsavedNothingToSave;
    for (const b of [save, discard, moreButton]) {
        const off = saving || !dirty;
        b.setAttribute('aria-disabled', String(off));
        if (off) b.setAttribute('title', offReason);
        else b.removeAttribute('title');
    }
    chip.disabled = saving;
    setMenu(more, [
        {
            group: '',
            items: [
                {
                    label: s.unsavedDiscardChanges,
                    hint: s.unsavedDiscardHint,
                    value: 'discard',
                    danger: true,
                    disabled: saving || !dirty ? offReason : null,
                },
                { label: s.unsavedShowChanges, hint: s.unsavedShowHint, value: 'review', disabled: dirty ? null : s.unsavedNothingToSave },
            ],
        },
    ]);
}

/** The list panel's entries. @param {UnsavedController} ctl @param {UnsavedChange[]} changes */
function paintList(ctl, changes) {
    ctl.parts.list.replaceChildren(
        ...changes.map((ch) =>
            buildEntry(
                ctl.doc,
                ctl.s,
                ch,
                (c) => ctl.jump(c),
                (c) => ctl.revertOne(c),
            ),
        ),
    );
}

/** The count moved: tell the page, tell screen readers a moment later, keep the changes. @param {UnsavedController} ctl @param {number} n @param {UnsavedChange[]} changes */
function countChanged(ctl, n, changes) {
    const { s, win } = ctl;
    if (ctl.lastCount !== -1) {
        ctl.el.dispatchEvent(new CustomEvent(UNSAVED_CHANGE_EVENT, { bubbles: true, detail: { count: n, changes } }));
        clearTimeout(ctl.announceTimer);
        ctl.announceTimer = win.setTimeout(() => (ctl.live.textContent = n === 0 ? s.unsavedNone : s.unsavedCount(n)), ANNOUNCE_DELAY_MS);
    }
    ctl.lastCount = n;
    ctl.keeper.keep();
}
