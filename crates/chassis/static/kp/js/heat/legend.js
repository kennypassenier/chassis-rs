// The legend under a heat grid: its entries, its keys and the calm tones.
import { getStrings } from '../strings.js';
import { calmLegendEntries, isCalmTones } from '../calm-tones.js';
import { setKeys } from '../keys.js';
import { make } from './dom.js';
/** @typedef {import('./types.js').HeatLegendEntry} HeatLegendEntry */
/** @typedef {import('./types.js').HeatLegendOptions} HeatLegendOptions */

/* ---------------------------------------------------------------- the legend */

/** Legends made so far, for an id that is never twice on a page. */
let legendCount = 0;

/**
 * The legend a heat grid has: the list right after it, when that is a `.kp-heat__legend` (the markup a page wrote by hand is
 * taken over, not doubled).
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
function legendOf(el) {
    const next = el.nextElementSibling;
    return next instanceof HTMLElement && next.matches('.kp-heat__legend') ? next : null;
}

/** @param {HTMLElement} el the grid @param {HTMLElement | null} legend @param {boolean} on whether the grid names the legend */
function describedBy(el, legend, on) {
    if (!legend) return;
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== legend.id);
    if (on) ids.push(legend.id);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
}

/**
 * Take the legend away (hidden, and out of the grid's description), keeping the element where it stands so it can come back.
 * @param {HTMLElement} el
 */
export function removeLegend(el) {
    const legend = legendOf(el);
    if (!legend) return;
    legend.hidden = true;
    legend.replaceChildren();
    legend.removeAttribute('data-kp-legend-source');
    describedBy(el, legend, false);
}

/**
 * The legend of a calm grid, drawn by the grid itself: Logged, Nothing logged, Paused. A legend the page wrote (setHeatLegend, or
 * markup) is left alone; `data-kp-legend="hide"`, or a grid that is no longer calm, takes the grid's own away.
 * @param {HTMLElement} el
 */
export function syncCalmLegend(el) {
    const legend = legendOf(el);
    const own = legend?.getAttribute('data-kp-legend-source') === 'auto';
    if (legend && !own && legend.childElementCount > 0) return;
    if (isCalmTones(el) && el.getAttribute('data-kp-legend') !== 'hide') {
        // Only the tones the data has [gap audhd 41]: a grid with no paused cell does not name "Paused"; `data-kp-legend="all"`
        // keeps the three, and a grid with no cell yet (loading) lists all three so the legend keeps its footprint.
        const present = new Set([...el.querySelectorAll('.kp-heat__cell[data-kp-tone]')].map((c) => c.getAttribute('data-kp-tone')));
        const all = el.getAttribute('data-kp-legend') === 'all' || !['logged', 'quiet', 'paused'].some((t) => present.has(t));
        const entries = calmLegendEntries().filter((e) => all || present.has(e.tone));
        const signature = entries.map((e) => e.tone).join(' ');
        // Unchanged: nothing is rewritten (a grid that is redrawn many times a minute keeps its legend's nodes).
        if (own && !legend?.hidden && legend?.getAttribute('data-kp-legend-tones') === signature) return;
        const made = setHeatLegend(el, entries, { source: 'auto' });
        made?.setAttribute('data-kp-legend-tones', signature);
    } else if (own) removeLegend(el);
}

/**
 * The legend under a heat grid: a swatch and its words per entry, in the order given, a value ramp where an entry asks for one,
 * and at the end the line of keys. The list is the one right after the grid (made when there is none), named in the grid's
 * `aria-describedby`; no entries and no keys hides it. Called again, it rewrites in place, so the legend keeps its place while the
 * grid loads.
 *
 * @param {HTMLElement} el the heat grid
 * @param {readonly HeatLegendEntry[]} entries
 * @param {HeatLegendOptions & { source?: 'auto' }} [options]
 * @returns {HTMLElement | null} the legend, null for a grid that is not in a page
 */
export function setHeatLegend(el, entries, options = {}) {
    const doc = el.ownerDocument;
    const s = getStrings();
    let legend = legendOf(el);
    if (!legend) {
        if (!el.parentNode) return null;
        legend = make(doc, 'ul', 'kp-heat__legend');
        el.after(legend);
    }
    if (!legend.id) legend.id = `${el.id || 'kp-heat'}-legend${el.id ? '' : `-${(legendCount += 1)}`}`;
    const keys = options.keys === true ? defaultHeatKeys(s) : options.keys || null;
    legend.setAttribute('aria-label', options.label ?? s.heatLegendLabel);
    if (options.source) legend.setAttribute('data-kp-legend-source', options.source);
    else legend.removeAttribute('data-kp-legend-source');
    /** @type {HTMLElement[]} */
    const items = [];
    for (const entry of entries) {
        const li = make(doc, 'li');
        if (entry.ramp) {
            const steps = Math.min(9, Math.max(2, Math.trunc(entry.steps ?? 5)));
            const ramp = make(doc, 'span', 'kp-heat__ramp', { 'aria-hidden': 'true' });
            for (let i = 0; i < steps; i += 1) {
                const swatch = make(doc, 'span', 'kp-heat__swatch', { 'data-kp-tone': 'level' });
                swatch.style.setProperty('--kp-heat-level', String(Math.round((i / (steps - 1)) * 100) / 100));
                ramp.append(swatch);
            }
            li.append(entry.less ?? s.heatLegendLess, ramp, entry.more ?? s.heatLegendMore);
        } else {
            const swatch = make(doc, 'span', 'kp-heat__swatch', { 'data-kp-tone': entry.tone ?? 'muted', 'aria-hidden': 'true' });
            li.append(swatch, ` ${entry.label ?? ''}`);
        }
        items.push(li);
    }
    if (keys && keys.length) {
        const end = make(doc, 'li', 'kp-heat__legend-end');
        const line = make(doc, 'div', 'kp-keys');
        setKeys(line, keys);
        end.append(line);
        items.push(end);
    }
    legend.replaceChildren(...items);
    legend.hidden = items.length === 0;
    describedBy(el, legend, items.length > 0);
    return legend;
}

/** @param {ReturnType<typeof getStrings>} s @returns {import('../keys.js').KeyPair[]} */
function defaultHeatKeys(s) {
    return [
        [['←', '↑', '↓', '→'], s.heatKeysMove],
        ['Enter', s.heatKeysPick],
        ['Esc', s.heatKeysDrop],
        [['PgUp', 'PgDn'], s.heatKeysPage],
    ];
}
