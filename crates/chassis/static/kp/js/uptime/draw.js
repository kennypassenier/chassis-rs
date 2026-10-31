// Draws the strip from its spec.
import { getStrings } from '../strings.js';
import { openBusyCard } from '../busy-card.js';
import { isCalmTones } from '../calm-tones.js';
import { hostStatePlate } from '../state-plate.js';
import { UPTIME_RETRY_EVENT, UPTIME_STATES } from './constants.js';
import { uptimeFigures, uptimePercent } from './figures.js';
import { fit } from './fit.js';
import { groupHost, infoMode, joinGroupCard, leaveGroupCard } from './group.js';
import { countOf, make, toneFor, wordFor } from './helpers.js';
import { CARDS, DRAWN, GROUPS, INFO, SPECS, WAITING } from './state.js';
/** @typedef {import('./types.js').UptimeSpec} UptimeSpec */

/**
 * Draw a strip, or let its busy card leave first when it stops loading.
 * @param {HTMLElement} el
 * @param {UptimeSpec} spec
 */
export function setUptime(el, spec) {
    SPECS.set(el, spec);
    const loading = spec.state === 'loading';
    const waiting = WAITING.get(el);
    if (loading && waiting) {
        WAITING.delete(el);
        waiting.card.remove();
    } else if (!loading) {
        if (waiting) {
            waiting.spec = spec;
            return;
        }
        const card = CARDS.get(el);
        const left = card ? leaveGroupCard(el) : null;
        if (left && !left.last) {
            // Others in the group still load: this strip is drawn now, the shared card shrinks to the rest.
            draw(el, spec);
            return;
        }
        if (card) {
            CARDS.delete(el);
            if (left) {
                const group = GROUPS.get(left.host);
                if (group) group.closing = true;
            }
            const entry = { card, spec };
            WAITING.set(el, entry);
            void card.close().then(() => {
                if (left && GROUPS.get(left.host)?.card === card) GROUPS.delete(left.host);
                if (WAITING.get(el) !== entry) return;
                WAITING.delete(el);
                draw(el, entry.spec);
            });
            return;
        }
    }
    draw(el, spec);
}

/**
 * @param {HTMLElement} el
 * @param {UptimeSpec} spec
 */
function draw(el, spec) {
    const s = getStrings();
    const periods = spec.periods ?? [];
    const state = spec.state ?? (periods.length === 0 ? 'empty' : 'ready');
    const loading = state === 'loading';
    const failed = state === 'error';
    const label = spec.label ?? el.dataset.kpUptimeLabel ?? '';
    const count = periods.length > 0 && !loading ? periods.length : (spec.count ?? countOf(el));
    const figures = uptimeFigures(loading || failed ? [] : periods);
    const focusedKey = el.contains(el.ownerDocument.activeElement)
        ? /** @type {HTMLElement} */ (el.ownerDocument.activeElement).dataset.kpKey
        : undefined;

    INFO.get(el)?.();
    const info = infoMode(el);
    el.classList.add('kp-uptime');
    el.dataset.kpUptimeState = state;
    el.setAttribute('data-kp-state', state);
    if (loading) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');

    if (state === 'empty' || failed) {
        // The package's state plate over the strip's whole footprint, with a Retry on a failure; js/footprint.js holds the loaded
        // height [kyu-plates-1019]. The busy card's layer (a group's, still on its way out) is kept.
        const keepLayer = CARDS.get(el)?.layer;
        const plate = hostStatePlate(el, {
            kind: failed ? 'error' : 'empty',
            title: failed ? (spec.error ?? spec.message ?? s.uptimeError) : (spec.message ?? s.uptimeEmpty),
            ...(spec.text ? { text: spec.text } : {}),
            art: spec.art,
            retryEvent: UPTIME_RETRY_EVENT,
        });
        el.replaceChildren(...(keepLayer && keepLayer.parentElement === el ? [plate, keepLayer] : [plate]));
        return;
    }

    // The head: the title on the start side, the summary on the end side, on one line.
    const head = make(el, 'div', 'kp-uptime__head');
    const title = make(el, 'span', 'kp-uptime__title');
    title.textContent = label;
    if (label) title.title = label;
    const summary = make(el, 'span', 'kp-uptime__summary');
    summary.setAttribute('role', 'status');
    let said = '';
    if (loading) {
        summary.dataset.kpTone = 'loading';
        const wait = make(el, 'span', 'kp-skeleton kp-uptime__summary-skeleton');
        wait.setAttribute('aria-hidden', 'true');
        summary.append(wait);
        said = s.uptimeLoading;
        const hidden = make(el, 'span', 'kp-sr-only');
        hidden.textContent = said;
        summary.append(hidden);
    } else if (failed) {
        summary.dataset.kpTone = 'error';
        said = spec.error ?? s.uptimeError;
        summary.textContent = said;
        summary.title = said;
    } else if (figures.share === null) {
        summary.dataset.kpTone = 'empty';
        said = s.uptimeEmpty;
        summary.textContent = said;
    } else if (isCalmTones(el)) {
        // A calm strip counts the days that were logged, never the ones that were not: no share down, no incidents.
        const logged = figures.counts.up + figures.counts.degraded;
        said = s.calmSummary(logged, figures.measured);
        const count = make(el, 'b', 'kp-uptime__percent');
        count.textContent = said;
        summary.append(count);
    } else {
        const percent = make(el, 'b', 'kp-uptime__percent');
        percent.textContent = s.uptimePercent(uptimePercent(figures.share));
        const dot = make(el, 'span', 'kp-uptime__dot');
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '·';
        const incidents = make(el, 'span', 'kp-uptime__incidents');
        incidents.textContent = s.uptimeIncidents(figures.incidents);
        summary.append(percent, dot, incidents);
        said = s.uptimeSummary(uptimePercent(figures.share), figures.incidents);
    }
    head.append(title, summary);

    // The strip: one button per period, oldest first.
    const track = make(el, 'div', 'kp-uptime__track');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', label ? s.uptimeTrack(label, said) : said);
    /** @type {HTMLElement[]} */
    const cells = [];
    for (let i = 0; i < count; i++) {
        const period = loading || failed ? null : (periods[i] ?? null);
        const link = Boolean(period?.href) && !info;
        const cell = make(
            el,
            loading ? 'span' : link ? 'a' : 'button',
            loading ? 'kp-uptime__cell kp-skeleton kp-skeleton--block' : 'kp-uptime__cell',
        );
        if (loading) {
            cell.setAttribute('aria-hidden', 'true');
        } else {
            const tone = toneFor(el, period && UPTIME_STATES.includes(period.state) ? period.state : 'none');
            if (link) cell.setAttribute('href', /** @type {string} */ (period?.href));
            else /** @type {HTMLButtonElement} */ (cell).type = 'button';
            if (info && period) {
                cell.setAttribute('aria-haspopup', 'dialog');
                cell.setAttribute('aria-expanded', 'false');
            }
            cell.dataset.kpTone = tone;
            cell.tabIndex = -1;
            if (period) {
                cell.dataset.kpKey = period.key;
                const share = typeof period.uptime === 'number' ? s.uptimePercent(uptimePercent(period.uptime)) : null;
                const n = typeof period.incidents === 'number' ? period.incidents : null;
                const words = s.uptimeCell(period.label, wordFor(el, tone), share, n);
                cell.setAttribute('aria-label', words);
                cell.setAttribute('data-kp-hovercard', period.tip ?? words);
            } else {
                cell.setAttribute('aria-label', s.uptimeStateWord('none'));
                cell.dataset.kpKey = `none-${i}`;
            }
        }
        cells.push(cell);
    }
    track.append(...cells);

    // The axis: the first and the latest period shown, and how many are shown when not all fit.
    const axis = make(el, 'div', 'kp-uptime__axis');
    const from = make(el, 'span', 'kp-uptime__from');
    const shown = make(el, 'span', 'kp-uptime__shown');
    const to = make(el, 'span', 'kp-uptime__to');
    axis.append(from, shown, to);

    const keep = CARDS.get(el)?.layer;
    for (const child of [...el.childNodes]) if (child !== keep) child.remove();
    if (keep && keep.parentElement === el) keep.before(head, track, axis);
    else el.append(head, track, axis);

    fit(el);
    if (!loading) {
        const roving = cells.find((c) => c.dataset.kpKey === focusedKey && !c.hidden) ?? [...cells].reverse().find((c) => !c.hidden) ?? null;
        if (roving) roving.tabIndex = 0;
        if (focusedKey !== undefined && roving?.dataset.kpKey === focusedKey) roving.focus({ preventScroll: true });
    }

    // The busy card: centred over the strip while it loads.
    const first = !DRAWN.has(el);
    if (!DRAWN.has(el)) {
        const view = el.ownerDocument.defaultView;
        if (view) view.requestAnimationFrame(() => DRAWN.add(el));
        else DRAWN.add(el);
    }
    const card = CARDS.get(el);
    if (loading) {
        const host = groupHost(el);
        if (card && !host) card.place();
        else if (host) CARDS.set(el, joinGroupCard(el, host, s.uptimeLoading, first));
        else CARDS.set(el, openBusyCard(el, { words: s.uptimeLoading, area: () => [track], className: 'kp-uptime__busy', arrive: !first }));
    } else if (card) {
        CARDS.delete(el);
        const left = leaveGroupCard(el);
        if (!left || left.last) card.remove();
        if (left?.last) GROUPS.delete(left.host);
    }
}
