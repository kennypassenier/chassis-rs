// The note that stands in place of the rows: the package's empty plate, or the error plate with Retry, filling the list's whole footprint.

import { statePlate } from '../state-plate.js';

/**
 * The package plate (js/state-plate.js) dressed by the part's own class; the Retry is the delegated `[data-kp-bullets-retry]` [states-check-1019].
 * @param {Document} doc
 * @param {import('../bullets.js').BulletsSpec} spec
 * @param {import('../strings.js').Strings} strings
 * @param {boolean} failed
 * @param {number} height the height the rows had, kept
 */
export function buildNote(doc, spec, strings, failed, height) {
    const note = statePlate(doc, {
        kind: failed ? 'error' : 'empty',
        title: failed ? (spec.message ?? strings.bulletsError) : (spec.emptyTitle ?? strings.bulletsEmpty),
        ...(failed ? { text: strings.stateFailedText } : spec.emptyText ? { text: spec.emptyText } : {}),
        ...(failed && spec.retry !== false ? { actionLabel: strings.bulletsRetry, actionAttribute: 'data-kp-bullets-retry' } : {}),
    });
    note.classList.add('kp-bullets__note');
    if (height > 0) note.style.minBlockSize = `${height}px`;
    if (failed) note.setAttribute('data-kp-tone', 'error');
    note.querySelector('.kp-stateplate__title')?.classList.add('kp-bullets__note-title');
    note.querySelector('.kp-stateplate__text')?.classList.add('kp-bullets__note-text');
    note.querySelector('.kp-stateplate__action')?.classList.add('kp-bullets__retry');
    return note;
}
