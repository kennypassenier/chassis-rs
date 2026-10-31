// Drawing the lines view of a matrix: the empty and failed plates, the two columns with the phone's list, and leaving it again.

import { statePlate } from '../state-plate.js';
import { USES_RETRY_EVENT } from './constants.js';
import { SVG_NS, make } from './dom.js';
import { MEMORY, memoryOf } from './memory.js';
import { readModel } from './model.js';
import { nodeFor, phoneList } from './nodes.js';
import { UsesWire } from './wire.js';

/** @typedef {import('../uses-map.js').Context} Context */
/** @typedef {import('./model.js').UsesModel} UsesModel */

/** The empty or failed map: the package's plate filling the footprint, with Retry when it failed. @param {UsesModel} m @param {Context} ctx */
function drawStatePlate(m, ctx) {
    const { el, doc, strings, spec } = m;
    const box = make(doc, 'div', 'kp-uses__state');
    const isError = m.state === 'error';
    box.append(
        statePlate(doc, {
            kind: isError ? 'error' : 'empty',
            title: spec.message ?? (isError ? strings.usesFailed : strings.usesEmpty),
            text: isError ? strings.usesFailedText : strings.usesEmptyText,
            ...(isError ? { actionLabel: strings.usesRetry, onAction: () => el.dispatchEvent(new CustomEvent(USES_RETRY_EVENT, { bubbles: true })) } : {}),
        }),
    );
    ctx.markDrawn(el);
    ctx.syncCard(el, false, '', () => [], 'kp-uses__busy');
    ctx.replaceKeepingCard(el, [box]);
}

/** The root of the map: the lines' svg and the two columns of nodes. @param {UsesModel} m */
function buildRoot(m) {
    const { doc, strings, spec, el } = m;
    const root = make(doc, 'div', 'kp-uses');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', spec.label ?? el.getAttribute('aria-label') ?? strings.usesLabel);
    root.setAttribute('data-kp-lines-side', m.side);
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kp-uses__lines');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const colSources = make(doc, 'ol', 'kp-uses__col kp-uses__col--sources');
    const colUsers = make(doc, 'ol', 'kp-uses__col kp-uses__col--users');
    colSources.setAttribute('role', 'list');
    colUsers.setAttribute('role', 'list');
    colSources.setAttribute('aria-label', spec.sourcesLabel ?? strings.usesSources);
    colUsers.setAttribute('aria-label', spec.usersLabel ?? strings.usesUsers);
    colSources.append(...m.sources.map((n) => nodeFor(m, n, 'source')));
    colUsers.append(...m.users.map((n) => nodeFor(m, n, 'user')));
    root.append(svg, colSources, colUsers);
    return { root, svg };
}

/** The attributes a drawn matrix carries. @param {UsesModel} m */
function markMatrix(m) {
    const { el } = m;
    el.classList.add('kp-matrix', 'kp-matrix--lines');
    el.setAttribute('data-kp-matrix', '');
    el.setAttribute('data-kp-view', 'lines');
    el.setAttribute('data-kp-state', m.state);
    el.toggleAttribute('aria-busy', m.loading);
    el.removeAttribute('data-kp-lit');
}

/**
 * Draw the lines view of a matrix.
 *
 * @param {HTMLElement} el
 * @param {any} spec a MatrixSpec with the lines fields
 * @param {Context} ctx
 */
export function drawUsesMap(el, spec, ctx) {
    const memory = memoryOf(el);
    memory.off?.();
    memory.off = null;
    const m = readModel(el, spec, memory);
    markMatrix(m);
    if (m.state === 'empty' || m.state === 'error') return drawStatePlate(m, ctx);
    const { root, svg } = buildRoot(m);
    const list = phoneList(m);
    ctx.replaceKeepingCard(el, [root, list]);
    // The busy card is centred over the map's whole footprint (the box with its least height), not over the skeleton rows,
    // which are shorter than a loaded map [state-plates-1019].
    ctx.syncCard(el, m.loading, m.strings.usesLoading, () => [el], 'kp-uses__busy');
    ctx.markDrawn(el);
    if (m.loading) return;
    const wire = new UsesWire(m, root, svg, list);
    wire.connect();
    memory.off = () => wire.destroy();
}

/**
 * Pin a node (or none) from a script, without a page event beyond `kp-uses-pin`.
 * @param {HTMLElement} el @param {string | null} key
 */
export function setUsesPin(el, key) {
    const card = key ? el.querySelector(`.kp-uses__node[data-key="${CSS.escape(key)}"] .kp-uses__card`) : null;
    if (key === null) {
        const pinned = el.querySelector('.kp-uses__card[aria-pressed="true"]');
        if (pinned instanceof HTMLElement) pinned.click();
        return;
    }
    if (card instanceof HTMLElement && card.getAttribute('aria-pressed') !== 'true') card.click();
}

/**
 * Take the lines view off a matrix that goes back to its grid.
 * @param {HTMLElement} el
 */
export function leaveUsesMap(el) {
    const memory = MEMORY.get(el);
    memory?.off?.();
    if (memory) memory.off = null;
    el.classList.remove('kp-matrix--lines');
    el.removeAttribute('data-kp-collapsed');
    el.removeAttribute('data-kp-lit');
}
