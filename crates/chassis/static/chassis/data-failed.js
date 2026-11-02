// The failed-edits view (feat-offline-failed-view-1): a kit drawer listing
// the edits the service refused (and those held for a decision), each with
// "Discard" and "Save again", plus "Discard all". Built from kp-themes parts
// only (dialog.kp-drawer, kp-card, kp-help, kp-button, kp-empty). The only
// markup of the offline client besides the band's toasts; the logic it calls
// is the client's own drop() / resave(). Apps may still build their own on
// the `chassis-data-review` event (call preventDefault() to keep this one shut).

import { formatBrussels } from './format-text.js';

export const FAILED_MESSAGES = {
    title: 'Edits that were not saved',
    intro: 'The service refused these edits. Discard one to forget it, or save it again to send it over what is there now.',
    close: 'Close',
    discard: 'Discard',
    saveAgain: 'Save again',
    discardAll: 'Discard all',
    emptyTitle: 'Nothing was refused',
    emptyBody: 'Edits that the service refuses show up here, so you can discard them or save them again.',
    when: 'Made',
    why: 'Why',
    state: 'Status',
    stateFailed: 'Set aside; later edits were sent',
    stateHeld: 'Waiting for you; later edits wait too',
    reasonStale: 'This item was changed somewhere else after you started editing.',
    reasonOther: 'The service did not accept this edit.',
    verbs: { POST: 'Add', PUT: 'Change', PATCH: 'Change', DELETE: 'Delete' },
    confirmTitle: (n) => `Discard ${n === 1 ? 'this edit' : `all ${n} edits`}?`,
    confirmBody: 'They are removed from this device and cannot be sent later.',
    confirmAccept: 'Discard',
    confirmCancel: 'Keep them',
    count: (n) => `${n} ${n === 1 ? 'edit' : 'edits'}`,
};

/** The edits that need a person: refused (failed) or held; waiting ones are not. */
export const reviewable = (queue) => queue.filter((e) => e.state === 'failed' || e.state === 'held');

/** The server's reason for a refused edit, in its own words when it gave some. */
export function reasonOf(entry, text) {
    const body = entry.conflict?.body;
    const said = body && typeof body === 'object' && typeof body.error === 'string' ? body.error.trim() : '';
    if (said) return typeof body.remedy === 'string' && body.remedy.trim() ? `${said} ${body.remedy.trim()}` : said;
    return entry.conflict?.status === 409 || entry.conflict?.status === 412 ? text.reasonStale : text.reasonOther;
}

function node(doc, tag, className, words) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (words !== undefined) el.textContent = words;
    return el;
}

function button(doc, label, className, act, id) {
    const el = node(doc, 'button', `kp-button ${className}`, label);
    el.type = 'button';
    el.dataset.chassisFailedAct = act;
    if (id !== undefined) el.dataset.chassisFailedId = String(id);
    return el;
}

function fields(doc, entry, text) {
    const list = node(doc, 'dl', 'kp-help__list');
    const rows = [
        [text.when, Number.isFinite(entry.at) ? formatBrussels(new Date(entry.at)) : ''],
        [text.why, reasonOf(entry, text)],
        [text.state, entry.state === 'held' ? text.stateHeld : text.stateFailed],
    ];
    for (const [term, value] of rows) list.append(node(doc, 'dt', '', term), node(doc, 'dd', '', value));
    return list;
}

/** One refused edit as a card: what it was, the facts, its two actions. */
export function renderEntry(doc, entry, text) {
    const card = node(doc, 'li', 'kp-card chassis-failed__item');
    card.dataset.chassisFailedItem = String(entry.id);
    const verb = text.verbs[entry.method] ?? entry.method;
    const head = node(doc, 'header', 'kp-card__header');
    head.append(node(doc, 'h3', 'kp-card__title', `${verb} ${entry.path}`));
    // Two equal columns, so Discard and Save again line up from card to card.
    const actions = node(doc, 'div', 'kp-card__actions');
    actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--kp-space-2);margin-block-start:var(--kp-space-3)';
    actions.append(button(doc, text.discard, '', 'discard', entry.id), button(doc, text.saveAgain, 'kp-button--primary', 'save', entry.id));
    card.append(head, fields(doc, entry, text), actions);
    return card;
}

/** The full-size empty state: it fills the body, centred. */
export function renderEmpty(doc, text) {
    const empty = node(doc, 'div', 'kp-empty chassis-failed__empty');
    empty.style.cssText = 'display:grid;place-content:center;justify-items:center;text-align:center;min-block-size:min(34rem,72vh)';
    empty.append(node(doc, 'p', 'kp-empty__title', text.emptyTitle), node(doc, 'p', 'kp-empty__body', text.emptyBody));
    return empty;
}
