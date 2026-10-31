// Decorates a claim list: every row, its filter and its summary; setting the filter redecorates.
import { getStrings } from '../strings.js';
import { getChecklistItems } from '../checklist.js';
import { memoryFor } from '../remember.js';
import { statePlate } from '../state-plate.js';
import { CLAIM_FILTERS, CLAIM_FILTER_EVENT } from './constants.js';
import { attr, byOf, el, stateOf } from './model.js';
import { among, fillRow } from './rows.js';

/** @param {Element} list @param {string} filter */
export function setClaimFilter(list, filter) {
    if (!(list instanceof HTMLElement) || !CLAIM_FILTERS.includes(filter)) return;
    const s = stateOf(list);
    if (s.filter === filter) return;
    s.filter = filter;
    memoryFor(list, 'claim')?.write('filter', filter);
    decorate(list);
    list.dispatchEvent(new CustomEvent(CLAIM_FILTER_EVENT, { bubbles: true, detail: { filter } }));
}

/** Show the width of the widest face on the list's buttons: the faces already share one cell, so nothing to do here. */

/** Everything that depends on the whole list: the groups' counts, the bar, the filter, the order, the plate. @param {HTMLElement} list */
export function decorate(list) {
    const s = getStrings();
    const st = stateOf(list);
    const items = getChecklistItems(list);
    const body = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-checklist__body'));
    if (!body) return;
    const countMode = attr(list, 'count', 'both');
    const gapSort = attr(list, 'gap-sort', 'keep') === 'top';
    /** @type {Map<string, typeof items[number]>} */
    const byId = new Map(items.map((i) => [i.id, i]));
    const loading = list.hasAttribute('aria-busy');

    for (const row of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll('.kp-checklist__item'))) {
        const item = byId.get(row.getAttribute('data-id') ?? '');
        if (item) fillRow(list, row, item);
    }

    // The filter hides rows (never removes them), and a group with no row left hides too.
    let shown = 0;
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-checklist__group'))) {
        let rows = 0;
        const members = /** @type {HTMLElement[]} */ ([...section.querySelectorAll('.kp-checklist__item')]);
        let claimed = 0;
        for (const row of members) {
            const gap = row.hasAttribute('data-kp-claim-gap');
            if (!gap) claimed += 1;
            const keep = st.filter === 'all' || (st.filter === 'gaps' && gap) || (st.filter === 'mine' && row.hasAttribute('data-kp-claim-mine'));
            row.hidden = !keep;
            if (keep) rows += 1;
        }
        shown += rows;
        section.hidden = rows === 0;
        // The group's own count of what is taken.
        const head = section.querySelector('.kp-checklist__head');
        let own = /** @type {HTMLElement | null} */ (head?.querySelector('.kp-claim__group-count') ?? null);
        if (head && !own) {
            own = el('kp-claim__group-count', 'span');
            head.querySelector('.kp-checklist__count')?.before(own);
        }
        if (own) {
            own.hidden = countMode === 'bar' || countMode === 'none';
            own.textContent = s.claimGroupCount(claimed, members.length);
        }
        if (gapSort) {
            const list_ = /** @type {HTMLElement | null} */ (section.querySelector('.kp-checklist__list'));
            if (list_) {
                const open = members.filter((r) => !r.hasAttribute('data-kp-checklist-checked'));
                const rank = (/** @type {HTMLElement} */ r) => (r.hasAttribute('data-kp-claim-gap') ? 0 : 1);
                const wanted = [...open].sort((a, b) => rank(a) - rank(b) || members.indexOf(a) - members.indexOf(b));
                const done = members.filter((r) => r.hasAttribute('data-kp-checklist-checked'));
                const order = [...wanted, ...done];
                if (order.some((r, i) => list_.children[i] !== r)) {
                    const focused =
                        document.activeElement instanceof HTMLElement && list_.contains(document.activeElement) ? document.activeElement : null;
                    list_.append(...order);
                    focused?.focus({ preventScroll: true });
                }
            }
        }
    }

    // The bar: the count of rows nobody takes, the chip group, the optional actions.
    const bar = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-checklist__bar'));
    if (bar) {
        const gaps = items.filter((i) => byOf(i).length === 0).length;
        let tools = /** @type {HTMLElement | null} */ (bar.querySelector(':scope > .kp-claim__bar'));
        if (!tools) {
            tools = el('kp-claim__bar');
            const summary = el('kp-claim__summary', 'span');
            summary.setAttribute('aria-live', 'off');
            const chips = el('kp-segmented kp-segmented--chips kp-claim__chips');
            chips.setAttribute('role', 'group');
            tools.append(summary, chips);
            bar.querySelector('.kp-checklist__status')?.after(tools);
        }
        const summary = /** @type {HTMLElement} */ (tools.querySelector('.kp-claim__summary'));
        summary.hidden = countMode === 'group' || countMode === 'none';
        summary.toggleAttribute('data-kp-claim-gap', gaps > 0 && items.length > 0);
        summary.textContent = items.length === 0 ? '' : gaps === 0 ? s.claimAllTaken : s.claimGapsCount(gaps);
        const chips = /** @type {HTMLElement} */ (tools.querySelector('.kp-claim__chips'));
        chips.hidden = attr(list, 'filter-chips', 'true') === 'false' || list.getAttribute('data-kp-claim-filter') === 'false';
        chips.setAttribute('aria-label', s.claimFilterLabel);
        const mineCount = items.filter((i) => among(st.viewer, byOf(i))).length;
        const numbers = { all: items.length, gaps, mine: mineCount };
        const names = { all: s.claimFilterAll, gaps: s.claimFilterGaps, mine: s.claimFilterMine };
        for (const key of CLAIM_FILTERS) {
            let chip = /** @type {HTMLButtonElement | null} */ (chips.querySelector(`[data-value="${key}"]`));
            if (!chip) {
                chip = /** @type {HTMLButtonElement} */ (el('kp-segmented__item', 'button'));
                chip.type = 'button';
                chip.setAttribute('data-value', key);
                chip.append(el('kp-segmented__label', 'span'), el('kp-segmented__count', 'span'));
                chips.append(chip);
            }
            /** @type {HTMLElement} */ (chip.querySelector('.kp-segmented__label')).textContent = names[/** @type {'all'} */ (key)];
            /** @type {HTMLElement} */ (chip.querySelector('.kp-segmented__count')).textContent = String(numbers[/** @type {'all'} */ (key)]);
            chip.setAttribute('aria-pressed', String(st.filter === key));
        }
        // The optional actions live in the checklist's own action cluster.
        const actions = /** @type {HTMLElement | null} */ (bar.querySelector('.kp-checklist__actions'));
        if (actions) {
            for (const [flag, cls, text] of /** @type {const} */ ([
                ['take-all', 'kp-claim__take-all', s.claimTakeAll],
                ['copy', 'kp-claim__copy', s.claimCopyGaps],
            ])) {
                let b = /** @type {HTMLButtonElement | null} */ (actions.querySelector(`.${cls}`));
                const wanted = list.hasAttribute(`data-kp-claim-${flag}`);
                if (wanted && !b) {
                    b = /** @type {HTMLButtonElement} */ (el(`kp-button kp-button--ghost kp-button--sm ${cls}`, 'button'));
                    b.type = 'button';
                    actions.prepend(b);
                } else if (!wanted && b) {
                    b.remove();
                    continue;
                }
                if (b) {
                    b.textContent = text;
                    b.disabled = gaps === 0 || loading || (flag === 'take-all' && (!st.viewer || list.hasAttribute('data-kp-claim-disabled')));
                    if (b.disabled && gaps === 0) b.setAttribute('data-kp-disabled-reason', s.claimNothingOpen);
                    else if (b.disabled && flag === 'take-all') b.setAttribute('data-kp-disabled-reason', s.claimNoViewer);
                    else b.removeAttribute('data-kp-disabled-reason');
                }
            }
        }
    }

    // A filter that leaves no row says so in the body, at the body's height.
    let note = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-claim__none'));
    const emptyList = items.length === 0;
    const wantNote = !loading && !emptyList && shown === 0 && !list.hasAttribute('data-kp-checklist-error');
    if (wantNote) {
        const gapsFilter = st.filter === 'gaps';
        const key = `${st.filter}`;
        if (!note || note.getAttribute('data-for') !== key) {
            note?.remove();
            note = statePlate(document, {
                kind: 'empty',
                title: gapsFilter ? s.claimNoneOpenTitle : s.claimNoneMineTitle,
                text: gapsFilter ? s.claimNoneOpenText : s.claimNoneMineText,
                actionLabel: s.claimShowAll,
                onAction: () => setClaimFilter(list, 'all'),
            });
            note.classList.add('kp-claim__none');
            note.setAttribute('data-for', key);
            body.append(note);
        }
    } else note?.remove();

    // A failed list has its Retry on the checklist's own failed plate; the claim part only re-fires it under its own name (attachClaims).
    if (loading) list.setAttribute('data-kp-claim-loading', '');
    else list.removeAttribute('data-kp-claim-loading');
}
