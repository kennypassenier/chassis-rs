// Paints a feed from its model: the host's marks, the head, the day list, the plates, the loading card, the foot, and the focus kept by key.

import { agoMoment, setAgo } from '../freshness.js';
import { openBusyCard } from '../busy-card.js';
import { statePlate } from '../state-plate.js';
import { getStrings } from '../strings.js';
import { MOMENT_CLOCK_AT, MOMENT_DATE_LENGTH } from './constants.js';
import { dayGroups } from './days.js';
import { make } from './dom.js';
import { skeletonRows } from './frame.js';
import { dayKey, feedOptions, optionAttr } from './options.js';
import { counted } from './words.js';

/** The marks the host carries: state, scroll height, rail and actor mode. @param {import('./controller.js').FeedController} c @param {string} state */
function paintHost(c, state) {
    const el = c.host;
    el.setAttribute('data-kp-state', state);
    const max = optionAttr(el, 'max');
    if (max) el.style.setProperty('--kp-feed-max', max);
    else el.style.removeProperty('--kp-feed-max');
    el.toggleAttribute('data-kp-feed-scroll', !!max);
    el.toggleAttribute('data-kp-feed-no-rail', optionAttr(el, 'rail') === 'off');
    el.setAttribute('data-kp-feed-actor-mode', feedOptions(el).actor);
}

/** Where the focus is, so it can go back there after the rows are replaced. @param {import('./controller.js').FeedController} c */
function rememberFocus(c) {
    const { foot, staleAction } = c.parts;
    const doc = c.host.ownerDocument;
    const active = doc.activeElement instanceof HTMLElement && c.host.contains(doc.activeElement) ? doc.activeElement : null;
    const key = active?.closest('[data-kp-key]')?.getAttribute('data-kp-key') ?? null;
    let part = '';
    if (active?.classList.contains('kp-feed__toggle')) part = '.kp-feed__toggle';
    else if (active?.classList.contains('kp-feed__link')) part = '.kp-feed__link';
    return { key, part, inFoot: !!active && foot.contains(active) && !!active.closest('button'), inStale: active === staleAction };
}

/** Put the focus back where it was, by key. @param {import('./controller.js').FeedController} c @param {ReturnType<typeof rememberFocus>} was */
function restoreFocus(c, was) {
    const { list, foot, stale, staleAction } = c.parts;
    if (was.key && was.part) {
        const again = list.querySelector(`[data-kp-key="${CSS.escape(was.key)}"] ${was.part}`);
        if (again instanceof HTMLElement) again.focus({ preventScroll: true });
    } else if (was.inFoot) {
        const target = foot.querySelector('button:not(:disabled)');
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    } else if (was.inStale && !stale.hidden) staleAction.focus({ preventScroll: true });
}

/** The line that says why the rows are old: the reason and the clock of the rows on screen. @param {import('./controller.js').FeedController} c @param {import('./constants.js').FeedStale} stale */
function paintStale(c, stale) {
    const { staleText, staleAction } = c.parts;
    const since = stale.since;
    const nowMoment = agoMoment(c.now(), c.zone);
    let clock = '';
    if (since != null) {
        const sinceMoment = agoMoment(since, c.zone);
        clock = sinceMoment.slice(0, MOMENT_DATE_LENGTH) === nowMoment.slice(0, MOMENT_DATE_LENGTH) ? sinceMoment.slice(MOMENT_CLOCK_AT) : sinceMoment;
    }
    staleText.textContent = getStrings().feedStale(stale.reason, clock);
    staleAction.textContent = getStrings().feedStaleAction;
}

/** The head: the exact count and the one freshness line, or why the rows are old. @param {import('./controller.js').FeedController} c @param {string} st @param {number} shown @param {number} total */
function paintHead(c, st, shown, total) {
    const { head, count, fresh, stale } = c.parts;
    const unit = feedOptions(c.host).unit;
    head.hidden = optionAttr(c.host, 'head') === 'off';
    const staleNow = st === 'ready' && c.model.stale ? c.model.stale : null;
    if (st === 'empty') count.textContent = counted(0, unit);
    else if (st !== 'ready') count.textContent = ' ';
    else count.textContent = shown < total ? getStrings().feedShown(shown, total, unit.many) : counted(total, unit);
    const updated = c.model.updatedAt;
    fresh.hidden = !!staleNow || updated == null || st !== 'ready';
    if (updated != null) setAgo(fresh, updated);
    stale.hidden = !staleNow;
    if (staleNow) paintStale(c, staleNow);
}

/** The empty and failed plates, the skeleton and the busy card of a loading feed. @param {import('./controller.js').FeedController} c @param {string} st */
function paintStates(c, st) {
    const { body, skeleton, state } = c.parts;
    const doc = c.host.ownerDocument;
    const t = getStrings();
    state.hidden = !(st === 'empty' || st === 'error');
    if (st === 'empty') state.replaceChildren(statePlate(doc, { kind: 'empty', title: t.feedEmptyTitle, text: c.model.emptyText ?? t.feedEmptyText }));
    else if (st === 'error') {
        const text = c.model.error ?? t.feedErrorText;
        state.replaceChildren(statePlate(doc, { kind: 'error', title: t.feedErrorTitle, text, actionLabel: t.feedRetry, actionAttribute: 'data-kp-feed-retry' }));
    } else state.replaceChildren();
    skeleton.replaceChildren(...(st === 'loading' ? skeletonRows(doc) : []));
    skeleton.hidden = st !== 'loading';
    body.setAttribute('aria-busy', String(st === 'loading'));
    if (st === 'loading' && !c.busy) c.busy = openBusyCard(body, { words: t.feedLoading, area: () => [body], className: 'kp-feed__busy', arrive: false });
    else if (st !== 'loading' && c.busy) {
        const card = c.busy;
        c.busy = null;
        void card.close();
    }
}

/** The "Load earlier" button, working or ready, or its Try again. @param {Document} doc @param {'more' | 'loading' | 'error'} earlier */
function earlierButton(doc, earlier) {
    const t = getStrings();
    const button = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-button kp-feed__earlier', earlier === 'error' ? t.feedEarlierRetry : ''));
    button.type = 'button';
    button.setAttribute('data-kp-feed-earlier', '');
    if (earlier === 'loading') {
        button.setAttribute('aria-busy', 'true');
        button.disabled = true;
        button.append(make(doc, 'span', 'kp-spinner'), make(doc, 'span', 'kp-feed__earlier-label', t.feedEarlierLoading));
    } else if (earlier === 'more') button.append(make(doc, 'span', 'kp-feed__earlier-label', t.feedEarlier));
    return button;
}

/** The foot: "Load earlier", always the same room. @param {import('./controller.js').FeedController} c @param {string} st @param {import('./constants.js').FeedRow[]} rows @param {number} total */
function paintFoot(c, st, rows, total) {
    const { foot } = c.parts;
    const doc = c.host.ownerDocument;
    const t = getStrings();
    const earlier = st === 'ready' ? c.model.earlier : undefined;
    foot.setAttribute('data-kp-earlier', earlier ?? 'none');
    const oldest = rows[rows.length - 1];
    const back = oldest ? agoMoment(oldest.at, c.zone).slice(0, MOMENT_DATE_LENGTH) : '';
    if (earlier === 'more' || earlier === 'loading') {
        foot.replaceChildren(earlierButton(doc, earlier), make(doc, 'span', 'kp-feed__foot-note', t.feedBackTo(rows.length, total, back)));
    } else if (earlier === 'error') {
        foot.replaceChildren(make(doc, 'span', 'kp-feed__foot-note kp-feed__foot-note--error', t.feedEarlierError), earlierButton(doc, earlier));
    } else if (earlier === 'end') foot.replaceChildren(make(doc, 'span', 'kp-feed__foot-note', t.feedEnd(rows.length, back)));
    else foot.replaceChildren();
}

/** Draw the whole feed again from its model and the options as they stand now. @param {import('./controller.js').FeedController} c */
export function renderFeed(c) {
    const { list } = c.parts;
    // One row at a time: switching to it keeps the row opened last.
    if (feedOptions(c.host).expand === 'one') for (const key of [...c.open].slice(0, -1)) c.open.delete(key);
    const st = c.model.state ?? 'ready';
    const rows = [...(c.model.rows ?? [])].sort((a, b) => b.at - a.at);
    const grouped = feedOptions(c.host).group === 'day';
    const total = c.model.total ?? rows.length;
    c.nextFlip = Infinity;
    c.drawnDay = dayKey(c.now(), c.zone);
    paintHost(c, st);
    const was = rememberFocus(c);
    paintHead(c, st, rows.length, total);
    list.setAttribute('aria-label', c.host.getAttribute('aria-label') ?? getStrings().feedLabel);
    list.replaceChildren(...(st === 'ready' ? dayGroups(c, rows, grouped) : []));
    list.hidden = st !== 'ready';
    paintStates(c, st);
    paintFoot(c, st, rows, total);
    restoreFocus(c, was);
}
