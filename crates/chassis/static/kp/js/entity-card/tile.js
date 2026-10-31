// Draws one tile: the trend row and the tile itself.
import { drawSparkline } from '../kpi.js';
import { holdFootprint } from '../footprint.js';
import { ENTITY_RETRY_EVENT } from './constants.js';
import { made, slotOf, writeName } from './helpers.js';
import { appendStar, syncStar, tickAndMark } from './star.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/**
 * The trend row: the label, a 24-hour line drawn with the KPI tile's drawSparkline, and the current value, on the meters' own columns.
 * Fewer than two readings keep the row and say so in the same box.
 * @param {Document} doc
 * @param {import('../strings.js').Strings} s
 * @param {EntityData} data
 * @param {string} status
 */
export function trendRow(doc, s, data, status) {
    const row = made(doc, 'div', 'kp-entity__meter kp-entity__trend');
    const label = made(doc, 'span', 'kp-entity__meter-label');
    label.textContent = data.trendLabel ?? s.entityTrend;
    const line = made(doc, 'div', 'kp-entity__trend-line');
    const value = made(doc, 'span', 'kp-entity__meter-value');
    const points = (data.trend ?? []).filter((n) => Number.isFinite(n));
    if (status !== 'empty' && points.length >= 2) {
        const last = /** @type {number} */ (points[points.length - 1]);
        value.textContent = data.trendText ?? last.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const svg = /** @type {SVGSVGElement} */ (doc.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        svg.setAttribute('class', 'kp-entity__spark');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', s.entityTrendName(data.trendLabel ?? s.entityTrend, value.textContent));
        drawSparkline(svg, points, { parts: 'kp-entity__spark' });
        line.append(svg);
    } else {
        const none = made(doc, 'span', 'kp-entity__none');
        none.textContent = status === 'empty' ? s.entityNotMeasured : s.entityTrendNone;
        line.append(none);
    }
    row.append(label, line, value);
    return row;
}

/**
 * Draw an app or link tile: the identity row (mark, the name as the card's one link, the star), the state as a dot and a word, the
 * description and the lines. A tile has no actions row.
 * @param {{ card: HTMLElement, data: EntityData, doc: Document, s: import('../strings.js').Strings, slot: (name: string, signature: unknown, build: (el: HTMLElement) => void) => void,
 *   status: string, key: string, link: string | null, selectable: boolean, markKind: string, starOn: boolean, starKey: string, star: boolean }} c
 */
export function drawTile({ card, data, doc, s, slot, status, key, link, selectable, markKind, starOn, starKey, star }) {
    // A tile's rows differ in height with their words, so a tile that is not ready (not measured, failed, loading) keeps the height it had.
    holdFootprint(card);
    const href = data.href ?? (link ? link.replace('{key}', encodeURIComponent(key)) : null);
    const external = data.external === true && href !== null;
    slot('id', { n: data.name, m: data.match, href, external, selectable, markKind, status, starOn, starKey }, (el) => {
        tickAndMark(card, el, data, selectable, markKind);
        const name = href ? made(doc, 'a', 'kp-entity__name') : made(doc, 'span', 'kp-entity__name');
        writeName(name, data.name, data.match);
        if (name instanceof HTMLAnchorElement && href) {
            name.href = href;
            if (external) {
                name.target = '_blank';
                name.rel = 'noopener noreferrer';
                const said = made(doc, 'span', 'kp-sr-only');
                said.textContent = ` (${s.entityOpensNew})`;
                name.append(said);
            }
        }
        el.append(name);
        if (external) {
            const glyph = made(doc, 'span', 'kp-entity__external');
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = '↗';
            el.append(glyph);
        }
        if (starOn) appendStar(card, el, data, star, starKey);
    });
    syncStar(card, star);

    slot('state', { st: data.state, status }, (el) => {
        const word = status === 'error' ? s.entityFailed : (data.state?.label ?? '');
        if (!word) return;
        const tone = status === 'error' ? 'destructive' : data.state?.tone;
        const state = made(doc, 'span', 'kp-health kp-entity__tile-state');
        if (tone === 'success') state.setAttribute('data-state', 'ok');
        else if (tone === 'warning') state.setAttribute('data-state', 'warn');
        else if (tone === 'destructive') state.setAttribute('data-state', 'down');
        const dot = made(doc, 'span', 'kp-health__dot');
        dot.setAttribute('aria-hidden', 'true');
        state.append(dot, word);
        el.append(state);
    });

    // A failed tile: the sentence and Retry stand where the description and the lines stood.
    slot('description', { d: data.description, status, e: data.error }, (el) => {
        if (status === 'error') {
            const says = made(doc, 'span', 'kp-entity__tile-failed');
            says.textContent = s.entityTileFailed;
            const retry = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--sm kp-entity__retry'));
            retry.type = 'button';
            retry.textContent = s.entityRetry;
            if (data.error) retry.title = data.error;
            retry.addEventListener('click', () => card.dispatchEvent(new CustomEvent(ENTITY_RETRY_EVENT, { bubbles: true, detail: { key } })));
            el.append(says, retry);
            return;
        }
        if (!data.description) return;
        const text = made(doc, 'span', 'kp-entity__text');
        text.textContent = data.description;
        el.append(text);
    });
    slotOf(card, 'lines').hidden = status === 'error';
    slot('lines', { l: data.lines, status }, (el) => {
        if (status === 'empty') {
            const none = made(doc, 'span', 'kp-entity__none');
            none.textContent = s.entityNotMeasured;
            el.append(none);
            return;
        }
        for (const text of data.lines ?? []) {
            const line = made(doc, 'span', 'kp-entity__line');
            line.textContent = text;
            el.append(line);
        }
    });
}
