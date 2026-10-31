// Refreshes the visible rows: the filter, the redraw and the trim.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { LOGVIEWER_EVENT } from './constants.js';
import { attr, stateOf } from './model.js';
import { logOf, maxOf, queryOf } from './reads.js';
import { collect, dress, matchWords } from './rows.js';
/** @typedef {import('./types.js').Kept} Kept */

/** Everything that depends on the buffer or the options: the bar, the foot, the plates, the event. @param {HTMLElement} root */
export function refresh(root) {
    const st = stateOf(root);
    const s = getStrings();
    const log = logOf(root);
    const stage = /** @type {HTMLElement} */ (root.querySelector('.kp-logviewer__stage'));
    const state = root.getAttribute('data-kp-state') ?? 'ready';
    root.toggleAttribute('aria-busy', state === 'loading');
    const shown = st.lines.filter((line) => st.nodes.get(line.id)?.hidden === false).length;
    const total = st.lines.length;

    // The columns: the time column and the source column leave the grid when they hold nothing, so the others do not shift.
    root.toggleAttribute('data-kp-log-nosource', !st.lines.some((line) => line.source !== ''));

    // The plates and the busy card, over the whole stage so the footprint never changes.
    for (const old of stage.querySelectorAll(':scope > .kp-logviewer__plate')) old.remove();
    if (st.card && state !== 'loading') {
        st.card.remove();
        st.card = null;
    }
    let plate = '';
    if (state === 'error') {
        plate = 'error';
        const p = statePlate(document, {
            kind: 'error',
            title: attr(root, 'error-title', '') || s.logviewerFailed,
            text: attr(root, 'error', '') || s.logviewerFailedText,
            actionLabel: s.logviewerRetry,
            actionAttribute: 'data-kp-logviewer-retry',
        });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    } else if (state === 'loading') {
        plate = 'loading';
        if (!st.card) {
            st.card = openBusyCard(stage, { words: s.logviewerLoading, area: () => [stage], className: 'kp-logviewer__busy', arrive: false });
            st.card.layer.setAttribute('data-kp-newpill-skip', '');
        }
    } else if (total === 0) {
        plate = 'empty';
        const p = statePlate(document, { kind: 'empty', title: s.logviewerEmptyTitle, text: attr(root, 'hint', '') || s.logviewerEmptyText });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    } else if (shown === 0) {
        plate = 'nomatch';
        const p = statePlate(document, {
            kind: 'empty',
            title: s.logviewerNoMatchTitle,
            text: s.logviewerNoMatchText,
            actionLabel: s.logviewerClear,
            actionAttribute: 'data-kp-logviewer-clear',
        });
        p.classList.add('kp-logviewer__plate');
        stage.append(p);
    }
    root.setAttribute('data-kp-log-plate', plate);

    // The bar.
    const bar = root.querySelector('.kp-logviewer__bar');
    const find = /** @type {HTMLInputElement | null} */ (bar?.querySelector('.kp-logviewer__find'));
    if (find && find.value !== attr(root, 'search', '') && document.activeElement !== find) find.value = attr(root, 'search', '');
    const count = bar?.querySelector('.kp-logviewer__matches');
    if (count) count.textContent = matchWords(root);
    const hasQuery = queryOf(root) !== '';
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (bar?.querySelectorAll('[data-kp-logviewer-step]') ?? []))
        b.disabled = st.matches.length === 0;
    const only = /** @type {HTMLButtonElement | null} */ (bar?.querySelector('[data-kp-logviewer-only]'));
    if (only) {
        only.setAttribute('aria-pressed', String(attr(root, 'search-only', 'off') === 'on'));
        only.disabled = !hasQuery;
    }
    const wrap = bar?.querySelector('[data-kp-logviewer-wrap]');
    wrap?.setAttribute('aria-pressed', String(attr(root, 'wrap', 'on') !== 'off'));
    for (const item of bar?.querySelectorAll('[data-kp-logviewer-time] .kp-segmented__item') ?? []) {
        item.setAttribute('aria-checked', String(item.getAttribute('data-value') === attr(root, 'time', 'time')));
    }
    const level = /** @type {HTMLSelectElement | null} */ (bar?.querySelector('.kp-logviewer__level'));
    if (level) level.value = ['info', 'warning', 'error'].includes(attr(root, 'level', 'debug')) ? attr(root, 'level', 'debug') : 'debug';
    const nothing = shown === 0 || state !== 'ready';
    for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (
        bar?.querySelectorAll('[data-kp-logviewer-copy], [data-kp-logviewer-download]') ?? []
    ))
        b.disabled = nothing;
    if (find) find.disabled = total === 0 || state !== 'ready';

    // The foot.
    const foot = root.querySelector('.kp-logviewer__foot');
    const countLine = foot?.querySelector('.kp-logviewer__count');
    if (countLine) countLine.textContent = s.logviewerCount(shown, total);
    const dropped = foot?.querySelector('.kp-logviewer__dropped');
    if (dropped) {
        dropped.textContent = st.dropped > 0 ? s.logviewerDropped(st.dropped, maxOf(root)) : '';
        /** @type {HTMLElement} */ (dropped).hidden = st.dropped === 0;
    }
    log.setAttribute('aria-label', s.logviewerLogLabel);
    root.dispatchEvent(
        new CustomEvent(LOGVIEWER_EVENT, {
            bubbles: true,
            detail: { total, shown, dropped: st.dropped, matches: st.matches.length, current: st.at >= 0 ? st.at + 1 : 0 },
        }),
    );
}

/** Draw every row again, for a changed option. @param {HTMLElement} root */
export function redraw(root) {
    const st = stateOf(root);
    trim(root);
    for (const line of st.lines) {
        const row = st.nodes.get(line.id);
        if (row) dress(root, row, line);
    }
    collect(root, true);
    refresh(root);
}

/** Drop the oldest lines past the cap. @param {HTMLElement} root */
export function trim(root) {
    const st = stateOf(root);
    const max = maxOf(root);
    while (st.lines.length > max) {
        const gone = /** @type {Kept} */ (st.lines.shift());
        st.nodes.get(gone.id)?.remove();
        st.nodes.delete(gone.id);
        st.dropped += 1;
    }
}
