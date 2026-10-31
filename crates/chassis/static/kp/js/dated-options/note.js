// The note a state stands in for the options with: the empty plate with its reason and action, or the failure alert with Try again.

/** The empty plate. @param {import('./controller.js').DatedController} c */
function emptyPlate(c) {
    const doc = c.host.ownerDocument;
    const plate = doc.createElement('div');
    plate.className = 'kp-empty kp-dated__empty';
    const t = doc.createElement('p');
    t.className = 'kp-empty__title kp-dated__empty-title';
    t.textContent = c.given.reason ?? c.strings.datedEmpty;
    plate.append(t);
    if (c.given.action) {
        const actions = doc.createElement('div');
        actions.className = 'kp-dated__actions';
        actions.append(c.given.action);
        plate.append(actions);
    }
    return plate;
}

/** The failure alert. @param {import('./controller.js').DatedController} c */
function failureAlert(c) {
    const doc = c.host.ownerDocument;
    const s = c.strings;
    const alert = doc.createElement('div');
    alert.className = 'kp-alert kp-alert--destructive kp-dated__failure';
    const text = doc.createElement('div');
    text.className = 'kp-alert__body';
    const t = doc.createElement('strong');
    t.className = 'kp-dated__failure-title';
    t.textContent = c.given.title ?? s.datedFailed;
    text.append(t);
    if (c.given.text) {
        const p = doc.createElement('span');
        p.className = 'kp-dated__failure-text';
        p.textContent = c.given.text;
        text.append(p);
    }
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.className = 'kp-button kp-dated__retry';
    retry.dataset.kpDatedRetry = '';
    retry.textContent = s.datedRetry;
    alert.append(text, retry);
    return alert;
}

/** Draw the note for the picker's state. @param {import('./controller.js').DatedController} c */
export function paintNote(c) {
    const { note } = c;
    note.replaceChildren();
    note.hidden = c.state !== 'empty' && c.state !== 'error';
    note.removeAttribute('role');
    if (c.state === 'empty') {
        note.append(emptyPlate(c));
        note.setAttribute('role', 'status');
    } else if (c.state === 'error') {
        note.append(failureAlert(c));
        note.setAttribute('role', 'alert');
    }
}
