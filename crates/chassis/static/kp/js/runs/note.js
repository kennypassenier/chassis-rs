// The note under the rows: the package's empty plate with the app's reason, or the error plate with Try again.

import { statePlate } from '../state-plate.js';
import { RunsRows } from './rows.js';

export class RunsNote extends RunsRows {
    paintNote() {
        const { note } = this.parts;
        const { state, s, given } = this;
        note.replaceChildren();
        note.hidden = state !== 'empty' && state !== 'error';
        note.removeAttribute('role');
        if (state !== 'empty' && state !== 'error') return;
        // The package plate (js/state-plate.js), dressed by the part's own class so a theme's runs look stays; the Retry is
        // the delegated `[data-kp-runs-retry]` (it carries `detail.element`) [states-check-1019].
        const failed = state === 'error';
        const plate = statePlate(this.doc, {
            kind: failed ? 'error' : 'empty',
            title: failed ? (given.title ?? s.runsFailed) : (given.reason ?? s.runsEmpty),
            ...(failed ? { text: given.text ?? s.stateFailedText, actionLabel: s.runsRetry, actionAttribute: 'data-kp-runs-retry' } : {}),
        });
        plate.classList.add(failed ? 'kp-runs__failure' : 'kp-runs__empty');
        plate.querySelector('.kp-stateplate__title')?.classList.add(failed ? 'kp-runs__failure-title' : 'kp-runs__empty-title');
        plate.querySelector('.kp-stateplate__text')?.classList.add('kp-runs__failure-text');
        plate.querySelector('.kp-stateplate__action')?.classList.add('kp-runs__retry');
        note.append(plate);
        note.setAttribute('role', failed ? 'alert' : 'status');
    }
}
