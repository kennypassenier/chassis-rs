// The guards' one question [uxdialogs1101, habits-1102]: "Discard your changes?" with Keep editing and Discard, in the package's confirmation.
import { openConfirmation } from '../components/confirm-dialog.js';
import { getStrings } from '../strings.js';

/**
 * Ask the question next to `anchor`; Discard runs `onAccept`, Keep editing (or Escape) runs `onCancel`.
 * @param {HTMLElement} anchor @param {{ onAccept: () => void, onCancel: () => void }} answers
 */
export function openDiscardQuestion(anchor, { onAccept, onCancel }) {
    const s = getStrings();
    return openConfirmation(anchor, {
        phrase: s.dialogGuardTitle,
        description: s.dialogGuardText,
        acceptLabel: s.dialogGuardDiscard,
        strings: { confirmCancel: s.dialogGuardKeep },
        onAccept,
        onCancel,
    });
}
