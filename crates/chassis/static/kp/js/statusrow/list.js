// What a status list does with its rows as a whole: a calm row turned (Resume, Pause, with Undo), the today order and its
// fold, a page's change to a row, the counts, a today card's state, and building a list from rows.

import { setCardState } from '../card-state.js';
import { getStrings } from '../strings.js';
import { undoToast } from '../undo-toast.js';
import { STATUS_ID_ATTRIBUTE, STATUS_PAUSE_EVENT, STATUS_RESUME_EVENT, STATUS_UNDO_EVENT, el, isCalm, known } from './state.js';
import { daysBetween, labelOf, syncItem, todayKey, writeText } from './sync.js';
import { sayText } from './voice.js';

/** @typedef {import('./state.js').StatusState} StatusState */
/** @typedef {import('./state.js').StatusRow} StatusRow */

/**
 * Resume or pause a calm row as a person pressed it: the event (cancelable), the new state, a sentence and a toast with Undo
 * that puts the row back as it was, its date included.
 * @param {Element} list @param {Element} item @param {'resume' | 'pause'} action
 */
export function turn(list, item, action) {
    const s = getStrings();
    const id = item.getAttribute(STATUS_ID_ATTRIBUTE);
    const label = labelOf(item);
    const wasState = item.getAttribute('data-state') ?? 'open';
    const wasSince = item.getAttribute('data-kp-since');
    const event = new CustomEvent(action === 'resume' ? STATUS_RESUME_EVENT : STATUS_PAUSE_EVENT, {
        bubbles: true,
        cancelable: true,
        detail: { item, id },
    });
    if (!list.dispatchEvent(event)) return;
    if (action === 'pause') item.setAttribute('data-kp-since', todayKey(list));
    item.setAttribute('data-state', action === 'resume' ? 'open' : 'paused');
    syncItem(item);
    const text = action === 'resume' ? s.statusResumed(label) : s.statusPausedNow(label);
    sayText(list, text);
    const ms = list.hasAttribute('data-kp-undo-ms') ? Number(list.getAttribute('data-kp-undo-ms')) : 6000;
    if (ms > 0) {
        undoToast(text, {
            mode: 'revert',
            ms,
            undo: () => {
                if (wasSince === null) item.removeAttribute('data-kp-since');
                else item.setAttribute('data-kp-since', wasSince);
                item.setAttribute('data-state', wasState);
                syncItem(item);
                list.dispatchEvent(new CustomEvent(STATUS_UNDO_EVENT, { bubbles: true, detail: { item, id, action } }));
            },
        });
    }
}

/**
 * Order and fold a calm list once, at the page's word: `data-kp-today-order="open-first"` puts the open rows first (nothing
 * moves afterwards, so a row that becomes done stays under the thumb), and `data-kp-today-paused="fold"` gathers the rows
 * paused for more than `data-kp-today-fold-after` days (30) into one line that opens them.
 * @param {Element} list
 */
export function settleToday(list) {
    if (!isCalm(list)) return;
    const rows = () => /** @type {HTMLElement[]} */ ([...list.querySelectorAll(':scope > .kp-statusrow:not(.kp-statusrow--fold)')]);
    if (list.getAttribute('data-kp-today-order') === 'open-first') {
        const sorted = rows()
            .map((row, at) => ({ row, at, rank: row.getAttribute('data-state') === 'open' ? 0 : 1 }))
            .sort((a, b) => a.rank - b.rank || a.at - b.at);
        for (const { row } of sorted) list.append(row);
    }
    list.querySelector(':scope > .kp-statusrow--fold')?.remove();
    for (const row of rows()) {
        row.removeAttribute('data-kp-folded');
        row.hidden = false;
    }
    if (list.getAttribute('data-kp-today-paused') !== 'fold') return;
    const after = Number(list.getAttribute('data-kp-today-fold-after')) || 30;
    const today = todayKey(list);
    const long = rows().filter((row) => {
        const since = row.getAttribute('data-kp-since');
        return row.getAttribute('data-state') === 'paused' && since !== null && daysBetween(since, today) > after;
    });
    if (long.length === 0) return;
    const line = document.createElement('li');
    line.className = 'kp-statusrow kp-statusrow--fold';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-button--ghost kp-statusrow__fold';
    button.textContent = getStrings().statusFoldLine(long.length, after);
    button.setAttribute('aria-expanded', 'false');
    for (const row of long) {
        row.setAttribute('data-kp-folded', '');
        row.hidden = true;
    }
    button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        for (const row of long) /** @type {HTMLElement} */ (row).hidden = !open;
    });
    line.append(button);
    list.append(line);
}

/**
 * Change one row. `key` is the row's `data-kp-status-id` or its index.
 *
 * @param {Element} list
 * @param {string | number} key
 * @param {{ state?: StatusState, label?: string, detail?: string, fix?: string, since?: string }} change
 * @returns {Element | null} the row, or null when there is no such row
 */
export function setStatus(list, key, change) {
    const items = [...list.querySelectorAll(':scope > .kp-statusrow')];
    const item = typeof key === 'number' ? items[key] : items.find((row) => row.getAttribute(STATUS_ID_ATTRIBUTE) === key);
    if (!item) return null;
    writeText(item, change);
    if (change.state !== undefined) item.setAttribute('data-state', known(change.state, isCalm(list)));
    syncItem(item, { announce: true });
    return item;
}

/**
 * How many rows of a list are in each state, for a summary line such as
 * "3 of 4 checks pass" [kpadopt4-rows]. Counts the rows as they are now.
 * @param {Element} list
 * @returns {Record<StatusState, number> & { total: number }}
 */
export function countStatus(list) {
    /** @type {Record<StatusState, number> & { total: number }} */
    const counts = { ok: 0, loading: 0, failed: 0, empty: 0, warn: 0, open: 0, done: 0, paused: 0, unknown: 0, total: 0 };
    for (const item of list.querySelectorAll(':scope > .kp-statusrow')) {
        counts[known(item.getAttribute('data-state'), isCalm(list))] += 1;
        counts.total += 1;
    }
    return counts;
}

/**
 * The state of a today card (a `.kp-card` around a calm list): `loading` lays the busy card over the rows, `empty` says
 * "Nothing planned today" over "That is fine, nothing is waiting", `error` is blame-free with a normal-size Retry (the card's
 * `kp-card-retry`). The words are the dictionary's `statusToday…`, or the page's own.
 * @param {HTMLElement} card
 * @param {'ready' | 'loading' | 'empty' | 'error'} state
 * @param {{ title?: string, text?: string, words?: string }} [words]
 */
export function setTodayState(card, state, words = {}) {
    const s = getStrings();
    if (state === 'empty') setCardState(card, 'empty', { title: words.title ?? s.statusTodayEmptyTitle, text: words.text ?? s.statusTodayEmptyText });
    else if (state === 'error')
        setCardState(card, 'error', { title: words.title ?? s.statusTodayFailedTitle, text: words.text ?? s.statusTodayFailedText });
    else if (state === 'loading') setCardState(card, 'loading', { words: words.words ?? s.statusTodayLoading });
    else setCardState(card, 'ready');
    for (const retry of card.querySelectorAll('.kp-card__retry')) {
        retry.classList.remove('kp-button--sm');
        retry.textContent = s.statusTodayRetry;
    }
}

/**
 * Build a status list from rows. The result still needs attachStatusLists()
 * (on the element or its container) for the spoken parts and the Retry.
 *
 * @param {StatusRow[]} rows
 * @param {{ label?: string, retry?: boolean, single?: boolean, vocab?: 'standard' | 'calm' }} [options] `label`: the list's accessible name;
 *   `retry: false` leaves out the Retry button; `single`: one column; `vocab: 'calm'` the open, done, paused and unknown rows [kpadopt6]
 * @returns {HTMLUListElement}
 */
export function buildStatusList(rows, { label, retry = true, single = false, vocab = 'standard' } = {}) {
    const list = document.createElement('ul');
    list.className = single ? 'kp-statuslist kp-statuslist--rows' : 'kp-statuslist';
    if (label) list.setAttribute('aria-label', label);
    if (!retry) list.setAttribute('data-kp-status-retry', 'false');
    if (vocab === 'calm') list.setAttribute('data-kp-status-vocab', 'calm');
    rows.forEach((row) => {
        const item = el('kp-statusrow', 'li');
        item.setAttribute(STATUS_ID_ATTRIBUTE, row.id ?? row.label);
        item.dataset.state = known(row.state, vocab === 'calm');
        const body = el('kp-statusrow__body');
        body.append(el('kp-statusrow__label'), el('kp-statusrow__detail'));
        if (row.fix !== undefined) body.append(el('kp-statusrow__fix'));
        item.append(el('kp-statusrow__mark'), body);
        list.append(item);
        writeText(item, row);
        syncItem(item);
    });
    return list;
}
