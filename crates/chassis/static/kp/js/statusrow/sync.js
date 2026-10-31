// Keeping one row in step with its `data-state`: its words, its Retry or calm actions, its "since" line, and saying it.

import { agoMoment } from '../freshness.js';
import { attachDisabledReasons } from '../reason.js';
import { getStrings } from '../strings.js';
import { STATUS_EVENT, STATUS_ID_ATTRIBUTE, STATUS_LIST, el, isCalm, known, stateWord, synced } from './state.js';
import { say } from './voice.js';

/** @typedef {import('./state.js').StatusState} StatusState */
/** @typedef {import('./state.js').StatusRow} StatusRow */

/**
 * Set the text parts of a row.
 * @param {Element} item
 * @param {{ label?: string, detail?: string, fix?: string, since?: string }} change
 */
export function writeText(item, { label, detail, fix, since }) {
    if (since !== undefined) item.setAttribute('data-kp-since', since);
    if (label !== undefined) item.querySelector('.kp-statusrow__label')?.replaceChildren(label);
    if (detail !== undefined) item.querySelector('.kp-statusrow__detail')?.replaceChildren(detail);
    if (fix !== undefined) {
        let part = item.querySelector('.kp-statusrow__fix');
        if (!part) {
            part = el('kp-statusrow__fix');
            // Before the spoken state word, which stays the body's last part.
            const body = item.querySelector('.kp-statusrow__body');
            const word = body?.querySelector(':scope > .kp-statusrow__state');
            if (word) word.before(part);
            else body?.append(part);
        }
        part.replaceChildren(fix);
    }
}

/** @param {Element} item */
export const labelOf = (item) => item.querySelector('.kp-statusrow__label')?.textContent?.trim() ?? '';

/**
 * Bring a row's mark, spoken state, Retry and `aria-busy` in step with its
 * `data-state`, and announce a change.
 *
 * @param {Element} item
 * @param {{ announce?: boolean }} [options]
 * @returns {StatusState}
 */
export function syncItem(item, { announce = false } = {}) {
    const calm = isCalm(item.closest(STATUS_LIST));
    const state = known(item.getAttribute('data-state'), calm);
    if (item.getAttribute('data-state') !== state) item.setAttribute('data-state', state);
    let mark = item.querySelector(':scope > .kp-statusrow__mark');
    if (!mark) {
        mark = el('kp-statusrow__mark');
        item.prepend(mark);
    }
    mark.setAttribute('aria-hidden', 'true');
    const spinning = mark.querySelector('.kp-spinner');
    if (state === 'loading' && !spinning) {
        const wheel = el('kp-spinner');
        wheel.setAttribute('aria-hidden', 'true');
        mark.append(wheel);
    } else if (state !== 'loading' && spinning) spinning.remove();
    if (state === 'loading') item.setAttribute('aria-busy', 'true');
    else item.removeAttribute('aria-busy');

    let body = item.querySelector(':scope > .kp-statusrow__body');
    if (!body) {
        body = el('kp-statusrow__body');
        mark.after(body);
    }
    let word = item.querySelector('.kp-statusrow__state');
    if (!word) {
        word = el('kp-statusrow__state kp-sr-only');
        body.append(word);
    }
    // ", failed" after the label: the comma makes the reader pause.
    word.textContent = `, ${stateWord(state)}`;

    const list = item.closest(STATUS_LIST);
    if (calm) {
        syncSince(item, state, list);
        syncCalmActions(item, state, list);
    } else syncAction(item, state, list);

    const previous = synced.get(item);
    synced.set(item, state);
    if (list && announce && previous !== undefined && previous !== state) {
        if (state !== 'loading') {
            say(list, {
                label: labelOf(item),
                state,
                detail: state === 'ok' ? '' : (item.querySelector('.kp-statusrow__detail')?.textContent?.trim() ?? ''),
            });
        }
        list.dispatchEvent(
            new CustomEvent(STATUS_EVENT, {
                bubbles: true,
                detail: { item, id: item.getAttribute(STATUS_ID_ATTRIBUTE), state, previous },
            }),
        );
    }
    return state;
}

/**
 * The Retry button: made once, shown on a failed row only. If it had the
 * focus when it goes, the focus moves to the row's body.
 * @param {Element} item
 * @param {StatusState} state
 * @param {Element | null} list
 */
export function syncAction(item, state, list) {
    if (list?.getAttribute('data-kp-status-retry') === 'false') return;
    let cell = item.querySelector(':scope > .kp-statusrow__action');
    if (!cell) {
        cell = el('kp-statusrow__action');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--sm';
        button.setAttribute('data-kp-status-retry-button', '');
        cell.append(button);
        item.append(cell);
    }
    const button = cell.querySelector('button');
    if (button) {
        const s = getStrings();
        button.textContent = s.statusRetry;
        button.setAttribute('aria-label', s.statusRetryLabel(labelOf(item)));
        const hide = state !== 'failed';
        if (hide && document.activeElement === button) {
            const body = /** @type {HTMLElement | null} */ (item.querySelector('.kp-statusrow__body'));
            if (body) {
                body.tabIndex = -1;
                body.focus({ preventScroll: true });
            }
        }
        /** @type {HTMLElement} */ (cell).hidden = hide;
    }
}

// ── The calm vocabulary [kpadopt6] ──────────────────────────────────────────────────────────────

/** Today as `YYYY-MM-DD` in Brussels (rule 52), or the day of the list's own clock (`data-kp-today-now`, a page with its own clock). @param {Element | null} list */
export function todayKey(list) {
    const fixed = Date.parse(list?.getAttribute('data-kp-today-now') ?? '');
    const [d = '01', m = '01', y = '1970'] = agoMoment(Number.isFinite(fixed) ? fixed : Date.now())
        .slice(0, 10)
        .split('/');
    return `${y}-${m}-${d}`;
}

/** The whole days between two `YYYY-MM-DD` days. @param {string} from @param {string} to */
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "Paused since 03/10/2026 (2 weeks)" (both, the default), the date or the length, from the row's `data-kp-since`. @param {Element} item @param {StatusState} state @param {Element | null} list */
export function syncSince(item, state, list) {
    const detail = item.querySelector('.kp-statusrow__detail');
    if (!detail) return;
    const since = item.getAttribute('data-kp-since');
    if (state === 'paused' && since && /^\d{4}-\d{2}-\d{2}$/.test(since)) {
        const s = getStrings();
        const date = `${since.slice(8, 10)}/${since.slice(5, 7)}/${since.slice(0, 4)}`;
        const duration = s.statusDuration(Math.max(0, daysBetween(since, todayKey(list))));
        const style = list?.getAttribute('data-kp-today-since');
        detail.textContent =
            style === 'relative' ? s.statusSinceFor(duration) : style === 'date' ? s.statusSinceDate(date) : s.statusSinceBoth(date, duration);
        item.setAttribute('data-kp-detail-auto', '');
    } else if (item.hasAttribute('data-kp-detail-auto')) {
        item.removeAttribute('data-kp-detail-auto');
        detail.textContent = '';
    }
}

/**
 * Resume on a paused row, Pause on an open one (when the list asks), made once. A Resume that cannot be pressed now says
 * why in the row's `data-kp-resume-reason`.
 * @param {Element} item_ @param {StatusState} state @param {Element | null} list
 */
export function syncCalmActions(item_, state, list) {
    const item = /** @type {HTMLElement} */ (item_);
    const s = getStrings();
    let cell = /** @type {HTMLElement | null} */ (item.querySelector(':scope > .kp-statusrow__action'));
    const label = labelOf(item);
    if (!cell) {
        cell = el('kp-statusrow__action');
        const resume = document.createElement('button');
        resume.type = 'button';
        resume.className = 'kp-button';
        resume.setAttribute('data-kp-status-resume-button', '');
        resume.setAttribute('data-kp-disabled-reason', '');
        const pause = document.createElement('button');
        pause.type = 'button';
        pause.className = 'kp-button kp-button--ghost';
        pause.setAttribute('data-kp-status-pause-button', '');
        cell.append(resume, pause);
        item.append(cell);
        attachDisabledReasons(cell);
    }
    const resume = /** @type {HTMLButtonElement} */ (cell.querySelector('[data-kp-status-resume-button]'));
    const pause = /** @type {HTMLButtonElement} */ (cell.querySelector('[data-kp-status-pause-button]'));
    const showResume = state === 'paused' && list?.getAttribute('data-kp-today-resume') !== 'off';
    const showPause = state === 'open' && list?.hasAttribute('data-kp-today-pause') === true && list.getAttribute('data-kp-today-pause') !== 'off';
    /** @param {HTMLElement} button @param {boolean} shown */
    const place = (button, shown) => {
        const holder = /** @type {HTMLElement} */ (button.closest('.kp-tooltip-anchor') ?? button);
        if (!shown && holder.contains(document.activeElement)) {
            item.tabIndex = -1;
            item.focus({ preventScroll: true });
        }
        holder.hidden = !shown;
    };
    resume.textContent = s.statusResume;
    resume.setAttribute('aria-label', s.statusResumeLabel(label));
    const why = item.getAttribute('data-kp-resume-reason') ?? '';
    resume.disabled = why !== '';
    resume.setAttribute('data-kp-disabled-reason', why);
    pause.textContent = s.statusPause;
    pause.setAttribute('aria-label', s.statusPauseLabel(label));
    place(resume, showResume);
    place(pause, showPause);
    cell.hidden = !(showResume || showPause);
}

