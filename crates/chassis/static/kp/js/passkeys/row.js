// Builds one row of the list: the way's glyph, its name or rename field, its facts, its flags, its hint and its two buttons.

import { getStrings } from '../strings.js';
import { agoMoment, agoText } from '../freshness.js';
import { PASSKEY_KINDS } from './constants.js';
import { actionButton, glyph, make } from './dom.js';
import { unusedDays } from './options.js';
import { nextRowNumber } from './state.js';

/**
 * @typedef {object} RowContext
 * @property {ReturnType<typeof import('./options.js').passkeyOptions>} options
 * @property {number} now
 * @property {boolean} last whether this is the only way in left
 */

/** The name, or the field that renames it. @param {Document} doc @param {import('./constants.js').PasskeyRow} row @param {string} id @param {boolean} renaming @param {boolean} busy @param {string | undefined} refused */
function nameBlock(doc, row, id, renaming, busy, refused) {
    const strings = getStrings();
    if (!renaming) {
        const name = make(doc, 'kp-passkeys__label', 'p');
        name.textContent = row.label;
        return name;
    }
    const form = make(doc, 'kp-passkeys__rename', 'div');
    const label = make(doc, 'kp-sr-only', 'label');
    label.setAttribute('for', `${id}-name`);
    label.textContent = strings.passkeysRenameLabel;
    const input = /** @type {HTMLInputElement} */ (make(doc, 'kp-field__input kp-passkeys__rename-input', 'input'));
    input.setAttribute('id', `${id}-name`);
    input.setAttribute('type', 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('value', row.label);
    input.value = row.label;
    if (refused) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `${id}-hint`);
    }
    if (busy) input.setAttribute('disabled', '');
    form.append(label, input);
    return form;
}

/** A `<time>` for a moment, with the exact moment as its tooltip. @param {Document} doc @param {number} at @param {string} text */
function timeOf(doc, at, text) {
    const node = make(doc, 'kp-passkeys__when', 'time');
    node.setAttribute('datetime', new Date(at).toISOString());
    node.title = agoMoment(at);
    node.textContent = text;
    return node;
}

/** The facts line: the kind, when it was added and when it was last used. @param {Document} doc @param {import('./constants.js').PasskeyRow} row @param {import('./constants.js').PasskeyKind} kind @param {number} now @param {import('./constants.js').MissingUse} missing */
function metaLine(doc, row, kind, now, missing) {
    const strings = getStrings();
    const meta = make(doc, 'kp-passkeys__meta', 'p');
    const kindWord = make(doc, 'kp-passkeys__kind');
    kindWord.textContent = strings.passkeysKind(kind);
    meta.append(kindWord);
    if (row.createdAt != null && Number.isFinite(row.createdAt)) {
        meta.append(timeOf(doc, row.createdAt, strings.passkeysAdded(agoMoment(row.createdAt).slice(0, 10))));
    }
    if (row.lastUsedAt != null && Number.isFinite(row.lastUsedAt)) {
        meta.append(timeOf(doc, row.lastUsedAt, agoText(strings.passkeysLastUsedVerb, row.lastUsedAt, now)));
    } else if (missing !== 'none') {
        const used = make(doc, 'kp-passkeys__when', 'time');
        used.textContent = missing === 'unknown' ? strings.passkeysUseUnknown : strings.passkeysNeverUsed;
        meta.append(used);
    }
    return meta;
}

/** The badges: "This device" and the days unused. @param {Document} doc @param {import('./constants.js').PasskeyRow} row @param {RowContext} context */
function flagsOf(doc, row, { options, now }) {
    const strings = getStrings();
    const flags = make(doc, 'kp-passkeys__flags');
    if (row.current && options.markCurrent) {
        const badge = make(doc, 'kp-badge kp-badge--info kp-passkeys__current');
        badge.textContent = strings.passkeysCurrent;
        badge.title = strings.passkeysCurrentTitle;
        flags.append(badge);
    }
    const days = row.current ? null : unusedDays(row, now, options.neverUsedAfter, options.missingUse);
    if (days !== null) {
        const badge = make(doc, 'kp-badge kp-badge--warning kp-passkeys__unused');
        badge.textContent = strings.passkeysUnused(days);
        badge.title = strings.passkeysUnusedTitle;
        flags.append(badge);
    }
    const extra = extraOf(doc, row);
    if (extra) flags.append(extra);
    return flags;
}

/** The app's own slot [homelab gap 39]: a string as a plain badge, or the node a function makes. @param {Document} doc @param {import('./constants.js').PasskeyRow} row */
function extraOf(doc, row) {
    if (row.extra === undefined || row.extra === '') return null;
    const slot = make(doc, 'kp-passkeys__extra');
    if (typeof row.extra === 'function') slot.append(row.extra(doc, row));
    else {
        const badge = make(doc, 'kp-badge');
        badge.textContent = row.extra;
        slot.append(badge);
    }
    return slot;
}

/** The line under the facts: the reason a button is off, or what the server said. @param {Document} doc @param {string} id @param {string | undefined} refused @param {RowContext} context */
function hintOf(doc, id, refused, { options, last }) {
    const strings = getStrings();
    const hint = make(doc, 'kp-passkeys__hint', 'p');
    hint.setAttribute('id', `${id}-hint`);
    if (refused) {
        hint.setAttribute('role', 'alert');
        hint.setAttribute('data-kp-tone', 'error');
        hint.textContent = refused;
    } else if (last && options.protectLast === 'refuse') {
        hint.setAttribute('data-kp-tone', 'warning');
        hint.textContent = strings.passkeysLastWay;
    } else if (last && options.protectLast === 'confirm') {
        hint.textContent = strings.passkeysLastWayWarn;
    } else hint.hidden = true;
    return hint;
}

/** Save and Cancel, while a row is being renamed. @param {Document} doc @param {boolean} busy */
function renameButtons(doc, busy) {
    const strings = getStrings();
    const save = actionButton(doc, 'kp-button--sm kp-button--primary', 'save', strings.passkeysSave);
    const cancel = actionButton(doc, 'kp-button--sm', 'cancel', strings.passkeysCancel);
    if (busy) {
        save.setAttribute('disabled', '');
        save.setAttribute('aria-busy', 'true');
        cancel.setAttribute('disabled', '');
    }
    return [save, cancel];
}

/** Rename and Remove, and the Remove's own looks: busy, or held off with its reason. @param {Document} doc @param {import('./constants.js').PasskeyRow} row @param {string} id @param {boolean} busy @param {boolean} refuseLast */
function restingButtons(doc, row, id, busy, refuseLast) {
    const strings = getStrings();
    const rename = actionButton(doc, 'kp-button--sm', 'rename', strings.passkeysRename);
    rename.setAttribute('aria-label', strings.passkeysRenameOf(row.label));
    const del = actionButton(doc, 'kp-button--sm kp-button--destructive', 'remove', busy ? strings.passkeysRemoving : strings.passkeysRemove);
    del.setAttribute('aria-label', strings.passkeysRemoveOf(row.label));
    if (busy) {
        del.setAttribute('disabled', '');
        del.setAttribute('aria-busy', 'true');
        rename.setAttribute('disabled', '');
        del.prepend(make(doc, 'kp-spinner'));
    } else if (refuseLast) {
        // Not `disabled`: it stays reachable by the keyboard and says why.
        del.setAttribute('aria-disabled', 'true');
        del.setAttribute('data-kp-disabled-reason', strings.passkeysLastWay);
        del.setAttribute('aria-describedby', `${id}-hint`);
        del.title = strings.passkeysLastWay;
        del.addEventListener('click', (event) => event.stopPropagation(), { capture: true });
    }
    return { rename, del };
}

/** The two buttons column. @param {Document} doc @param {import('./constants.js').PasskeyRow} row @param {string} id @param {boolean} renaming @param {boolean} busy @param {RowContext} context */
function actionsOf(doc, row, id, renaming, busy, { options, last }) {
    const strings = getStrings();
    const actions = make(doc, 'kp-passkeys__actions');
    if (renaming) {
        actions.append(...renameButtons(doc, busy));
        return actions;
    }
    const refuseLast = last && options.protectLast === 'refuse';
    const { rename, del } = restingButtons(doc, row, id, busy, refuseLast);
    // Without renaming, Remove is the only button and the column is as wide as it [homelab gap 70].
    const lead = options.rename ? [rename] : [];
    if (refuseLast && options.refuseLook === 'note') {
        // The button gives way to the reason, in its place.
        const only = make(doc, 'kp-passkeys__only');
        only.textContent = strings.passkeysOnlyWay;
        only.title = strings.passkeysLastWay;
        actions.append(...lead, only);
    } else actions.append(...lead, del);
    return actions;
}

/**
 * One row of the list.
 * @param {Document} doc
 * @param {import('./controller.js').PasskeysController} c the list: what is busy, being renamed or refused
 * @param {import('./constants.js').PasskeyRow} row
 * @param {RowContext} context
 */
export function rowItem(doc, c, row, context) {
    const kind = PASSKEY_KINDS.includes(row.kind ?? 'passkey') ? (row.kind ?? 'passkey') : 'passkey';
    const id = `kp-passkey-${nextRowNumber()}`;
    const busy = c.busy.has(row.key);
    const renaming = c.renaming === row.key;
    const refused = c.refused.get(row.key);
    const li = make(doc, 'kp-passkeys__row', 'li');
    li.setAttribute('data-kp-passkey', row.key);
    li.setAttribute('data-kp-kind', kind);
    if (row.current) li.setAttribute('data-kp-current', '');
    if (busy) li.setAttribute('aria-busy', 'true');
    const way = make(doc, 'kp-passkeys__way');
    way.append(glyph(doc, /** @type {import('./constants.js').PasskeyKind} */ (kind)));
    const what = make(doc, 'kp-passkeys__what');
    what.append(nameBlock(doc, row, id, renaming, busy, refused), metaLine(doc, row, /** @type {import('./constants.js').PasskeyKind} */ (kind), context.now, context.options.missingUse));
    const flags = flagsOf(doc, row, context);
    what.append(hintOf(doc, id, refused, context));
    li.append(way, what, flags, actionsOf(doc, row, id, renaming, busy, context));
    return li;
}
