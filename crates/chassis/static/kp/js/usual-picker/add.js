// Adding a name that is not in the list yet.
import { getStrings } from '../strings.js';
import { undoToast } from '../undo-toast.js';
import { USUAL_ADD_EVENT } from './constants.js';
import { arrange } from './layout.js';
import { attr, make } from './model.js';
import { pick, sayAfter } from './picking.js';
import { render } from './sync.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/** Hide the line under the field that offered Undo after an add. @param {UsualModel} m */
export function clearNote(m) {
    m.noteEl.hidden = true;
    m.noteEl.replaceChildren();
}

/** Add a typed name to the list, pick it, and offer Undo. @param {UsualModel} m @param {string} label @param {string | null} nearTo */
export function addName(m, label, nearTo) {
    const s = getStrings();
    const event = new CustomEvent(USUAL_ADD_EVENT, { bubbles: true, cancelable: true, detail: { label, nearTo } });
    if (!m.box.dispatchEvent(event)) return;
    const row = make('li', 'kp-combobox__option', label);
    row.setAttribute('role', 'option');
    row.setAttribute('data-kp-option', '');
    row.dataset.value = label;
    m.list.append(row);
    arrange(m);
    pick(m, label, 'typed');
    arrange(m);
    m.handle.refresh();
    const undo = () => {
        row.remove();
        m.handle.set(m.handle.values().filter((v) => v !== label));
        if (!m.box.hasAttribute('data-kp-tags')) m.input.value = '';
        clearNote(m);
        render(m);
        sayAfter(m, s.usualAddUndone(label));
    };
    if (attr(m, 'usual-undo', 'field') === 'toast') {
        sayAfter(m, s.usualAdded(label));
        const ms = m.box.hasAttribute('data-kp-undo-ms') ? Number(m.box.getAttribute('data-kp-undo-ms')) : 6000;
        if (ms > 0) undoToast(s.usualAddedToast(label), { mode: 'revert', ms, undo });
        return;
    }
    // Under the field, where the eyes are: the toast stood at the far corner of the window, cut off in the review dialog.
    // It stays until the next thing is typed or picked.
    const words = make('span', 'kp-usual__note-text', s.usualAddedNote(label));
    const button = make('button', 'kp-button kp-button--ghost kp-button--sm kp-usual__undo', s.usualUndo);
    button.type = 'button';
    button.setAttribute('aria-label', s.usualUndoName(label));
    button.addEventListener('click', () => {
        undo();
        m.input.focus();
    });
    m.noteEl.replaceChildren(words, button);
    m.noteEl.hidden = false;
}
