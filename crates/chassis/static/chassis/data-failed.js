// The failed-edits view (feat-offline-failed-view-1): a kit drawer listing
// the edits the service refused (and those held for a decision), each with
// "Discard" and "Save again", plus "Discard all". Built from kp-themes parts
// only (dialog.kp-drawer, kp-card, kp-help, kp-button, kp-empty). The only
// markup of the offline client besides the band's toasts; the logic it calls
// is the client's own drop() / resave(). Apps may still build their own on
// the `chassis-data-review` event (call preventDefault() to keep this one shut).

import { formatBrussels } from './format-text.js';

export const FAILED_MESSAGES = {
    failedTitle: 'Edits that were not saved',
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

const STALE = [409, 412];
const nonBlank = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** The server's own sentence for a refusal: its `error` and `remedy`. */
function serverWords(body) {
    if (!body || typeof body !== 'object') return '';
    const said = nonBlank(body.error);
    return said && nonBlank(body.remedy) ? `${said} ${nonBlank(body.remedy)}` : said;
}

/** The app's own reason, from `refusedReason(status, body)`, `stale` / `reasonStale` or `reasonOther`; '' when it gave none. */
function ownReason(status, body, given) {
    if (typeof given.refusedReason === 'function') {
        try {
            const said = nonBlank(given.refusedReason(status, body ?? null));
            if (said) return said;
        } catch (err) {
            console.warn('chassisData: messages.refusedReason threw; the next wording is used.', err);
        }
    }
    return nonBlank(STALE.includes(status) ? given.stale ?? given.reasonStale : given.reasonOther);
}

/**
 * Why an edit was refused: `{ reason, detail }`. With the app's words
 * (`given` = its `messages`) the reason is in them and the server's own
 * sentence becomes the secondary `detail`; without, the server's sentence is
 * the reason and the kit's English text only fills in when it said nothing.
 */
export function whyOf(entry, text, given = {}) {
    const { status, body } = entry.conflict ?? {};
    const server = serverWords(body);
    const own = ownReason(status, body, given);
    if (own) return { reason: own, detail: server && server !== own ? server : '' };
    return { reason: server || (STALE.includes(status) ? text.reasonStale : text.reasonOther), detail: '' };
}

/** The reason line alone (see `whyOf`). */
export const reasonOf = (entry, text, given = {}) => whyOf(entry, text, given).reason;

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

/**
 * What names a card: the app's `describe(entry) -> { title, detail? }` when it
 * answers with a title, else the verb and the path. A throwing or empty
 * describe falls back and says so on the console.
 */
export function labelOf(entry, text, describe = null) {
    if (describe) {
        try {
            const label = describe(entry);
            if (typeof label?.title === 'string' && label.title.trim()) {
                return { title: label.title, detail: typeof label.detail === 'string' ? label.detail : '' };
            }
        } catch (err) {
            console.warn('chassisData: describe() threw for a failed edit; its verb and path are shown.', err);
        }
    }
    return { title: `${text.verbs[entry.method] ?? entry.method} ${entry.path}`, detail: '' };
}

function fields(doc, entry, text, given) {
    const list = node(doc, 'dl', 'kp-help__list');
    const { reason, detail } = whyOf(entry, text, given);
    const rows = [
        [text.when, Number.isFinite(entry.at) ? formatBrussels(new Date(entry.at)) : ''],
        [text.why, reason],
        [text.state, entry.state === 'held' ? text.stateHeld : text.stateFailed],
    ];
    for (const [term, value] of rows) list.append(node(doc, 'dt', '', term), node(doc, 'dd', '', value));
    if (detail) { // the server's own sentence, under the reason
        const why = list.children[3];
        const more = node(doc, 'small', 'chassis-failed__detail', detail);
        more.style.display = 'block';
        why.append(more);
    }
    return list;
}

/** One refused edit as a card: what it was, the facts, its two actions. */
export function renderEntry(doc, entry, text, describe = null, given = {}) {
    const card = node(doc, 'li', 'kp-card chassis-failed__item');
    card.dataset.chassisFailedItem = String(entry.id);
    const label = labelOf(entry, text, describe);
    const head = node(doc, 'header', 'kp-card__header');
    head.append(node(doc, 'h3', 'kp-card__title', label.title));
    if (label.detail) head.append(node(doc, 'p', 'kp-card__subtitle', label.detail));
    // Two equal columns, so Discard and Save again line up from card to card.
    const actions = node(doc, 'div', 'kp-card__actions');
    actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--kp-space-2);margin-block-start:var(--kp-space-3)';
    actions.append(button(doc, text.discard, '', 'discard', entry.id), button(doc, text.saveAgain, 'kp-button--primary', 'save', entry.id));
    card.append(head, fields(doc, entry, text, given), actions);
    return card;
}

/** The full-size empty state: it fills the body, centred. */
export function renderEmpty(doc, text) {
    const empty = node(doc, 'div', 'kp-empty chassis-failed__empty');
    empty.style.cssText = 'display:grid;place-content:center;justify-items:center;text-align:center;min-block-size:min(34rem,72vh)';
    empty.append(node(doc, 'p', 'kp-empty__title', text.emptyTitle), node(doc, 'p', 'kp-empty__body', text.emptyBody));
    return empty;
}
