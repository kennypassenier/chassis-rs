// Draws the list: the waiting rows under the busy card, the empty or failed note, or the sorted rows, keeping focus where it was.

import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { rowItem } from './row.js';
import { announcer, insecureNote, stateNote, waitingList } from './notes.js';
import { make, rowOf } from './dom.js';
import { passkeyOptions, sortPasskeys } from './options.js';

/**
 * The loading state: waiting rows of the last shown count, under the busy card.
 * @param {import('./controller.js').PasskeysController} c
 * @param {import('./constants.js').PasskeysSpec} spec
 */
export function drawLoading(c, spec) {
    const el = c.host;
    const strings = getStrings();
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-state', 'loading');
    const list = waitingList(el.ownerDocument, spec.loadingRows ?? c.rowCount);
    const keep = c.card?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    el.prepend(list);
    if (c.card) {
        c.card.place();
        return;
    }
    c.card = openBusyCard(el, {
        words: spec.loadingWords ?? strings.passkeysLoading,
        area: () => [list],
        className: 'kp-passkeys__busy',
        arrive: c.drawn,
    });
    c.drawn = true;
}

/** The empty or failed state: one note that keeps the loaded height. @param {import('./controller.js').PasskeysController} c @param {boolean} failed */
function drawNote(c, failed) {
    const el = c.host;
    const doc = el.ownerDocument;
    el.setAttribute('data-kp-state', failed ? 'error' : 'empty');
    const was = el.querySelector(':scope > :is(.kp-passkeys__list, .kp-passkeys__note)')?.getBoundingClientRect().height ?? 0;
    c.height = Math.max(was, c.height);
    const refocus = el.querySelector(':scope > .kp-passkeys__note')?.contains(doc.activeElement) ?? false;
    const note = stateNote(doc, c.spec, failed, c.height);
    el.replaceChildren(...insecureNote(doc, c.spec), note, announcer(doc, c));
    if (refocus) {
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
    }
}

/** Puts the focus back on the control it was on, when the list was drawn again. @param {import('./controller.js').PasskeysController} c @param {string} key @param {string | null | undefined} act */
function restoreFocus(c, key, act) {
    const li = rowOf(c.host, key);
    const again = /** @type {HTMLElement | null} */ ((act ? li?.querySelector(`[data-kp-passkeys-act="${act}"]`) : null) ?? li?.querySelector('.kp-passkeys__rename-input'));
    if (again && !c.renaming) again.focus({ preventScroll: true });
}

/** Draw the list from what the controller holds. @param {import('./controller.js').PasskeysController} c */
export function draw(c) {
    const el = c.host;
    const doc = el.ownerDocument;
    const strings = getStrings();
    const spec = c.spec;
    const state = spec.state ?? 'ready';
    el.removeAttribute('aria-busy');
    c.drawn = true;
    const had = doc.activeElement && el.contains(doc.activeElement) ? doc.activeElement : null;
    const hadKey = had?.closest('[data-kp-passkey]')?.getAttribute('data-kp-passkey');
    const hadAct = had?.getAttribute('data-kp-passkeys-act');
    if (state === 'error' || state === 'empty' || c.rows.length === 0) {
        drawNote(c, state === 'error');
        return;
    }
    el.setAttribute('data-kp-state', 'ready');
    const options = passkeyOptions(el, spec);
    const now = (spec.now ?? Date.now)();
    const rows = sortPasskeys(c.rows);
    c.rowCount = rows.length;
    const last = c.isLast();
    const list = make(doc, 'kp-passkeys__list', 'ul');
    list.setAttribute('aria-label', strings.passkeysListLabel);
    for (const row of rows) list.append(rowItem(doc, c, row, { options, now, last }));
    el.replaceChildren(...insecureNote(doc, spec), list, announcer(doc, c));
    c.height = list.getBoundingClientRect().height;
    if (hadKey) restoreFocus(c, hadKey, hadAct);
}
