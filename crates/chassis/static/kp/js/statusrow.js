// Status rows: one state per item [kpadopt2-tiles; the dashboard's
// `perstack-chip`].
//
// A page that reads or checks many things one by one (a backup per stack, a
// health check per host) shows each item as a row that is OK, still loading,
// failed (with the reason, and a Retry that tries that one item again) or
// empty (with the reason there is nothing). `data-state` on each row is the
// source; this module keeps the rest in step with it, as js/steplist.js does:
//
//   <ul class="kp-statuslist" aria-label="Backups per stack">
//     <li class="kp-statusrow" data-state="failed" data-kp-status-id="vault">
//       <span class="kp-statusrow__mark" aria-hidden="true"></span>
//       <span class="kp-statusrow__body">
//         <span class="kp-statusrow__label">vault</span>
//         <span class="kp-statusrow__detail">The host did not answer in 20 s</span>
//       </span>
//       <span class="kp-statusrow__action"><button type="button" class="kp-button kp-button--sm">Retry</button></span>
//     </li>
//   </ul>
//
// What attachStatusLists() writes, so the markup can stay that short:
//   - the mark's spinner on a loading row (the mark is otherwise drawn by CSS
//     from `data-state`), `aria-busy` on that row;
//   - the state's word in `.kp-statusrow__state` (visually hidden), so a reader
//     moving through the list hears "vault, failed";
//   - the action cell with a Retry button, shown on a failed row only (leave it
//     out with `data-kp-status-retry="false"` on the list); its name says which
//     row it retries. Pressing it fires `kp-status-retry` on the list and
//     changes nothing else: the page decides what a retry is (usually
//     `setStatus(list, id, { state: 'loading' })`). When the focused Retry goes
//     away with the state change, the focus moves to the row's body, so the
//     keyboard keeps its place;
//   - a visually hidden `role="status"` region after the list, which says "vault:
//     failed, The host did not answer" when a row changes after the list was
//     attached. The list itself is not a live region: it would read every row
//     again. A burst of changes in one tick is one announcement, and more than
//     three become "12 updated, 2 failed".
//
// A check list [kpadopt4-rows] uses two more parts, both opt-in: the state
// `warn` (passes with a reservation: the warning pair on the mark, "!" as its
// shape) and `.kp-statusrow__fix` inside the body, the fix written out, shown
// on a failed or warn row only. buildStatusList() and setStatus() take `fix`.
//
// The calm vocabulary [kpadopt6; Life's today card, the plant dashboard]: `data-kp-status-vocab="calm"` on the list swaps the
// four states for `open`, `done`, `paused` and `unknown` (`loading` stays), with no red anywhere and no tally: a row asked for
// `failed`, `warn` or anything else is drawn as `unknown` and says so in the console. `unknown` exists for a thing that reports
// "ok" because it has no data (a plant with a dead soil sensor): it is never drawn as done. A paused row says "Paused since
// 03/10/2026" from its `data-kp-since` (`data-kp-today-since`: `both` by default, `date` or `relative`) and offers Resume in one press
// (`data-kp-today-resume="off"` leaves it out): `kp-status-resume` fires, the row is open again, and a toast offers Undo that puts
// it back paused with its original date (`kp-status-undo`). `data-kp-today-pause` adds a Pause button on open rows
// (`kp-status-pause`). `data-kp-today-order="open-first"` orders the rows once, at attach, and never again (a row that becomes
// done does not move under a thumb); `data-kp-today-paused="fold"` gathers rows paused longer than `data-kp-today-fold-after`
// days (30) into one expandable line; `data-kp-today-mark` is `glyph` (default) or `none`. Keys while the focus is in the list:
// ArrowUp and ArrowDown between rows, `r` resumes the focused paused row. Inside a `.kp-card[data-kp-state]` (js/card-state.js)
// the card brings loading, empty and failed.
//
// Change a row with setStatus(list, 'vault', { state: 'loading', detail: 'reading (3 s)' });
// a framework that sets `data-state` itself is followed too. Every word it adds
// is in js/strings.js.

import { getStrings } from './strings.js';
import { undoToast } from './undo-toast.js';
import { registerShortcuts } from './shortcuts.js';
import { attachDisabledReasons } from './reason.js';
import { agoMoment } from './freshness.js';
import { setCardState } from './card-state.js';

/** The lists this module looks after. */
export const STATUS_LIST = '.kp-statuslist';
/** The attribute that names a row, for setStatus(). */
export const STATUS_ID_ATTRIBUTE = 'data-kp-status-id';
/** Fired on the list, bubbling, when a row changed state after attach: `{ item, id, state, previous }`. */
export const STATUS_EVENT = 'kp-status-change';
/** Fired on the list, bubbling, when a Retry is pressed: `{ item, id }`. */
export const STATUS_RETRY_EVENT = 'kp-status-retry';
/** Fired on the list, bubbling, when Resume is pressed on a paused calm row (cancelable): `{ item, id }`. */
export const STATUS_RESUME_EVENT = 'kp-status-resume';
/** Fired on the list, bubbling, when Pause is pressed on an open calm row (cancelable): `{ item, id }`. */
export const STATUS_PAUSE_EVENT = 'kp-status-pause';
/** Fired on the list, bubbling, when Undo takes a resume or a pause back: `{ item, id, action }`. */
export const STATUS_UNDO_EVENT = 'kp-status-undo';
/** The states a row can be in. */
export const STATUS_STATES = /** @type {const} */ (['ok', 'loading', 'failed', 'empty', 'warn']);
/** The states a row of the calm vocabulary can be in. */
export const CALM_STATUS_STATES = /** @type {const} */ (['open', 'done', 'paused', 'unknown', 'loading']);

/**
 * @typedef {'ok' | 'loading' | 'failed' | 'empty' | 'warn' | 'open' | 'done' | 'paused' | 'unknown'} StatusState
 * @typedef {object} StatusRow
 * @property {string} [id] names the row for setStatus(); defaults to its label
 * @property {string} label
 * @property {string} [detail] the short line under the label: how long, the reason; give every row one so a reason arriving later moves nothing
 * @property {StatusState} [state] loading when absent
 * @property {string} [fix] what to do about it, written out; shown on a failed or warn row only [kpadopt4-rows]
 * @property {string} [since] a paused calm row's day, `YYYY-MM-DD` [kpadopt6]
 */

/** The state each row was last synced to. @type {WeakMap<Element, string>} */
const synced = new WeakMap();
/** The messages waiting to be announced, per region. @type {WeakMap<Element, { label: string, state: StatusState, detail: string }[]>} */
const pending = new WeakMap();

/** @param {Element | null} list */
const isCalm = (list) => list?.getAttribute('data-kp-status-vocab') === 'calm';

/** The tones a calm list has been warned about, so each is said once. */
const warned = new Set();

/**
 * A row's state in the list's vocabulary. A calm list keeps its four, maps the standard `ok` to done and `empty` to open, and
 * draws anything else (a red `failed`, a `warn`) as unknown, so a red cannot slip into a calm list by accident.
 * @param {unknown} state @param {boolean} [calm] @returns {StatusState}
 */
function known(state, calm = false) {
    if (!calm) return STATUS_STATES.includes(/** @type {any} */ (state)) ? /** @type {StatusState} */ (state) : 'loading';
    if (CALM_STATUS_STATES.includes(/** @type {any} */ (state))) return /** @type {StatusState} */ (state);
    if (state === 'ok') return 'done';
    if (state === 'empty') return 'open';
    const key = String(state);
    if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[kp-statuslist] "${key}" is not a calm state; the row is drawn as "unknown". Use open, done, paused or unknown.`);
    }
    return 'unknown';
}

/** @param {StatusState} state */
const stateWord = (state) => {
    const s = getStrings();
    return {
        ok: s.statusOk,
        loading: s.statusLoading,
        failed: s.statusFailed,
        empty: s.statusEmpty,
        warn: s.statusWarn,
        open: s.statusOpen,
        done: s.statusDone,
        paused: s.statusPaused,
        unknown: s.statusUnknown,
    }[state];
};

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'span') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

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

/**
 * Set the text parts of a row.
 * @param {Element} item
 * @param {{ label?: string, detail?: string, fix?: string, since?: string }} change
 */
function writeText(item, { label, detail, fix, since }) {
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
const labelOf = (item) => item.querySelector('.kp-statusrow__label')?.textContent?.trim() ?? '';

/**
 * Bring a row's mark, spoken state, Retry and `aria-busy` in step with its
 * `data-state`, and announce a change.
 *
 * @param {Element} item
 * @param {{ announce?: boolean }} [options]
 * @returns {StatusState}
 */
function syncItem(item, { announce = false } = {}) {
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
function syncAction(item, state, list) {
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
function todayKey(list) {
    const fixed = Date.parse(list?.getAttribute('data-kp-today-now') ?? '');
    const [d = '01', m = '01', y = '1970'] = agoMoment(Number.isFinite(fixed) ? fixed : Date.now())
        .slice(0, 10)
        .split('/');
    return `${y}-${m}-${d}`;
}

/** The whole days between two `YYYY-MM-DD` days. @param {string} from @param {string} to */
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "Paused since 03/10/2026 (2 weeks)" (both, the default), the date or the length, from the row's `data-kp-since`. @param {Element} item @param {StatusState} state @param {Element | null} list */
function syncSince(item, state, list) {
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
function syncCalmActions(item_, state, list) {
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

/** @param {Element} list @param {string} text */
function sayText(list, text) {
    const region = regionOf(list);
    region.textContent = '';
    window.setTimeout(() => {
        region.textContent = text;
    }, 30);
}

/**
 * Resume or pause a calm row as a person pressed it: the event (cancelable), the new state, a sentence and a toast with Undo
 * that puts the row back as it was, its date included.
 * @param {Element} list @param {Element} item @param {'resume' | 'pause'} action
 */
function turn(list, item, action) {
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
 * The list's status region, made on first need (right after the list).
 * @param {Element} list
 * @returns {HTMLElement}
 */
function regionOf(list) {
    const next = list.nextElementSibling;
    if (next instanceof HTMLElement && next.classList.contains('kp-statuslist__live')) return next;
    const region = el('kp-sr-only kp-statuslist__live');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    list.after(region);
    return region;
}

/**
 * Say something through the list's region; a burst in one tick is one message.
 * @param {Element} list
 * @param {{ label: string, state: StatusState, detail: string }} entry
 */
function say(list, entry) {
    const fresh = !(list.nextElementSibling?.classList.contains('kp-statuslist__live') ?? false);
    const region = regionOf(list);
    const queue = pending.get(region);
    if (queue) {
        queue.push(entry);
        return;
    }
    pending.set(region, [entry]);
    // A region put in the page and written to in the same breath is often not read; one made just now waits a moment.
    setTimeout(
        () => {
            const entries = pending.get(region) ?? [];
            pending.delete(region);
            const s = getStrings();
            region.textContent =
                entries.length > 3
                    ? s.statusAnnounceMany(entries.length, entries.filter((e) => e.state === 'failed').length)
                    : entries.map((e) => s.statusAnnounce(e.label, stateWord(e.state), e.detail)).join('. ');
        },
        fresh ? 100 : 0,
    );
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
 * The keys of a calm list: one tab stop on the rows, ArrowUp and ArrowDown between them, `r` resumes the focused paused row
 * (on the `?` sheet; no digit keys, which need Shift on AZERTY).
 * @param {HTMLElement} list
 * @returns {() => void}
 */
function wireCalmKeys(list) {
    const rows = () =>
        /** @type {HTMLElement[]} */ ([...list.querySelectorAll(':scope > .kp-statusrow:not(.kp-statusrow--fold)')]).filter((row) => !row.hidden);
    /** @param {HTMLElement | undefined} stop */
    const rove = (stop) => {
        for (const row of rows()) row.tabIndex = row === stop ? 0 : -1;
    };
    rove(rows()[0]);
    /** @param {FocusEvent} event */
    const onFocus = (event) => {
        const row = event.target instanceof Element ? event.target.closest('.kp-statusrow') : null;
        if (row instanceof HTMLElement && rows().includes(row)) rove(row);
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey) return;
        const all = rows();
        const at = all.findIndex((row) => row.contains(document.activeElement));
        if (at < 0) return;
        event.preventDefault();
        all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    };
    list.addEventListener('focusin', onFocus);
    list.addEventListener('keydown', onKey);
    const focusedPaused = () => {
        const row = rows().find((r) => r.contains(document.activeElement));
        return row !== undefined && row.getAttribute('data-state') === 'paused' && list.getAttribute('data-kp-today-resume') !== 'off';
    };
    const unkey = registerShortcuts(list, [
        {
            keys: 'r',
            what: getStrings().statusResume,
            group: 'Today',
            when: focusedPaused,
            run: () => {
                const row = rows().find((r) => r.contains(document.activeElement));
                const button = row?.querySelector('[data-kp-status-resume-button]');
                if (row && button instanceof HTMLButtonElement && !button.disabled) turn(list, row, 'resume');
            },
        },
    ]);
    return () => {
        list.removeEventListener('focusin', onFocus);
        list.removeEventListener('keydown', onKey);
        unkey();
    };
}

/**
 * Sync every `.kp-statuslist` under `root`, follow `data-state` changes later
 * and turn a press on a Retry into `kp-status-retry`. A list rendered after
 * this ran is attached by calling it on that subtree.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachStatusLists(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(STATUS_LIST) ? [root] : []),
        ...root.querySelectorAll(STATUS_LIST),
    ]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const list of lists) {
        for (const item of list.querySelectorAll(':scope > .kp-statusrow')) syncItem(item);
        regionOf(list);
        settleToday(list);
        /** @param {Event} event */
        const press = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const resume = target?.closest('[data-kp-status-resume-button]');
            const pause = target?.closest('[data-kp-status-pause-button]');
            const calmItem = (resume ?? pause)?.closest('.kp-statusrow');
            if (calmItem && list.contains(calmItem)) {
                turn(list, calmItem, resume ? 'resume' : 'pause');
                return;
            }
            const button = target?.closest('[data-kp-status-retry-button]');
            const item = button?.closest('.kp-statusrow');
            if (!button || !item || !list.contains(item)) return;
            list.dispatchEvent(new CustomEvent(STATUS_RETRY_EVENT, { bubbles: true, detail: { item, id: item.getAttribute(STATUS_ID_ATTRIBUTE) } }));
        };
        list.addEventListener('click', press);
        undo.push(() => list.removeEventListener('click', press));
        if (isCalm(list)) {
            undo.push(wireCalmKeys(list));
            // An option changed at run time is drawn at once: the since words, Resume, Pause, the order and the fold.
            const options = new MutationObserver(() => {
                for (const item of list.querySelectorAll(':scope > .kp-statusrow:not(.kp-statusrow--fold)')) syncItem(item);
                settleToday(list);
            });
            options.observe(list, {
                attributes: true,
                attributeFilter: [
                    'data-kp-today-since',
                    'data-kp-today-resume',
                    'data-kp-today-pause',
                    'data-kp-today-order',
                    'data-kp-today-paused',
                    'data-kp-today-fold-after',
                    'data-kp-today-mark',
                ],
            });
            undo.push(() => options.disconnect());
        }
    }
    if (typeof MutationObserver === 'undefined' || lists.length === 0) return () => undo.forEach((u) => u());
    const watch = new MutationObserver((records) => {
        for (const record of records) {
            const target = /** @type {Element} */ (record.target);
            if (target.classList.contains('kp-statusrow')) syncItem(target, { announce: true });
        }
    });
    for (const list of lists) watch.observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true });
    return () => {
        watch.disconnect();
        undo.forEach((u) => u());
    };
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
