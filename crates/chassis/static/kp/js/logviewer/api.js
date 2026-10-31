// The functions a page calls to append, read, clear, search and set a log viewer.
import { newPill } from '../newpill.js';
import { logLevel, stamp } from './levels.js';
import { stateOf } from './model.js';
import { applyTools, ensureParts } from './parts.js';
import { logOf, say, signature, textOf } from './reads.js';
import { redraw, refresh, trim } from './refresh.js';
import { collect, dress, matchWords, rowFor } from './rows.js';
/** @typedef {import('./types.js').LogLine} LogLine */
/** @typedef {import('./types.js').LogViewerSpec} LogViewerSpec */

/**
 * Add lines to the buffer. A line whose `id` is already kept is skipped, so a poll that returns overlapping windows can be
 * handed over whole. The oldest lines past the cap are dropped and counted.
 *
 * @param {Element} el
 * @param {LogLine[]} lines
 * @returns {number} how many lines were new
 */
export function appendLogLines(el, lines) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    const st = stateOf(root);
    const log = logOf(root);
    const fragment = document.createDocumentFragment();
    let added = 0;
    for (const raw of lines) {
        st.serial += 1;
        const id = raw.id === undefined ? `auto-${st.serial}` : String(raw.id);
        if (st.nodes.has(id)) continue;
        const line = { id, ts: stamp(raw.ts), source: raw.source ?? '', level: logLevel(raw.level), message: String(raw.message ?? '') };
        const row = rowFor(line);
        dress(root, row, line);
        st.lines.push(line);
        st.nodes.set(id, row);
        fragment.append(row);
        added += 1;
    }
    if (added === 0) return 0;
    // The rows go in with one insertion, so the follower sees one change and scrolls once.
    log.append(fragment);
    trim(root);
    collect(root);
    refresh(root);
    return added;
}

/**
 * The lines the buffer holds now, oldest first.
 * @param {Element} el
 * @returns {LogLine[]}
 */
export function logViewerLines(el) {
    return stateOf(/** @type {HTMLElement} */ (el)).lines.map((line) => ({ ...line }));
}

/**
 * The text of the lines shown (or of every kept line), one per row, as Copy and Download hand it over.
 * @param {Element} el
 * @param {{ all?: boolean }} [options]
 */
export function logViewerText(el, options = {}) {
    const root = /** @type {HTMLElement} */ (el);
    const st = stateOf(root);
    return st.lines
        .filter((line) => options.all || st.nodes.get(line.id)?.hidden === false)
        .map(textOf)
        .join('\n');
}

/**
 * Empty the buffer. The dropped count starts again from zero.
 * @param {Element} el
 */
export function clearLogViewer(el) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    const st = stateOf(root);
    logOf(root).replaceChildren();
    st.lines = [];
    st.nodes.clear();
    st.dropped = 0;
    collect(root, true);
    refresh(root);
}

/**
 * Find a text in the log, as the search box does.
 * @param {Element} el
 * @param {string} text  empty clears the find
 * @returns {number} how many matches
 */
export function searchLogViewer(el, text) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    if (text) root.setAttribute('data-kp-log-search', text);
    else root.removeAttribute('data-kp-log-search');
    syncOptions(root);
    return stateOf(root).matches.length;
}

/**
 * Go to the next or the previous match; the log scrolls to it (and stops following the tail).
 * @param {Element} el
 * @param {1 | -1} [delta]
 * @returns {number} the match now current, counted from 1, or 0 when there is none
 */
export function stepLogMatch(el, delta = 1) {
    const root = /** @type {HTMLElement} */ (el);
    const st = stateOf(root);
    collect(root);
    if (st.matches.length === 0) {
        refresh(root);
        return 0;
    }
    st.at = st.at < 0 ? (delta > 0 ? 0 : st.matches.length - 1) : (st.at + delta + st.matches.length) % st.matches.length;
    const mark = st.matches[st.at];
    for (const old of logOf(root).querySelectorAll('mark[data-kp-current]')) old.removeAttribute('data-kp-current');
    mark.setAttribute('data-kp-current', '');
    // The log scrolls to the match and nothing else does (scrollIntoView would move the page and every frame round it too).
    const log = logOf(root);
    const box = log.getBoundingClientRect();
    const at = mark.getBoundingClientRect();
    log.scrollTop += at.top - box.top - (box.height - at.height) / 2;
    if (at.left < box.left + 120) log.scrollLeft -= box.left + 120 - at.left;
    else if (at.right > box.right - 16) log.scrollLeft += at.right - (box.right - 16);
    refresh(root);
    say(root, matchWords(root));
    return st.at + 1;
}

/**
 * Set the viewer's options and state, or replace its lines.
 * @param {Element} el
 * @param {LogViewerSpec} spec
 */
export function setLogViewer(el, spec) {
    const root = /** @type {HTMLElement} */ (el);
    ensureParts(root);
    if (spec.max !== undefined) root.setAttribute('data-kp-log-max', String(spec.max));
    if (spec.wrap !== undefined) root.setAttribute('data-kp-log-wrap', spec.wrap ? 'on' : 'off');
    if (spec.time !== undefined) root.setAttribute('data-kp-log-time', spec.time);
    if (spec.level !== undefined) root.setAttribute('data-kp-log-level', spec.level);
    if (spec.search !== undefined) {
        if (spec.search) root.setAttribute('data-kp-log-search', spec.search);
        else root.removeAttribute('data-kp-log-search');
    }
    if (spec.searchOnly !== undefined) root.setAttribute('data-kp-log-search-only', spec.searchOnly ? 'on' : 'off');
    if (spec.state !== undefined) root.setAttribute('data-kp-state', spec.state);
    if (spec.message !== undefined) {
        if (spec.message) root.setAttribute('data-kp-log-error', spec.message);
        else root.removeAttribute('data-kp-log-error');
    }
    if (spec.errorTitle !== undefined) {
        if (spec.errorTitle) root.setAttribute('data-kp-log-error-title', spec.errorTitle);
        else root.removeAttribute('data-kp-log-error-title');
    }
    if (spec.lines) {
        clearLogViewer(root);
        appendLogLines(root, spec.lines);
    }
    syncOptions(root);
}

/** Draw again when an option moved. @param {HTMLElement} root */
export function syncOptions(root) {
    const st = stateOf(root);
    const now = signature(root);
    if (now === st.sig) return;
    st.sig = now;
    applyTools(root);
    redraw(root);
    const log = logOf(root);
    if (newPill(log)?.following()) log.scrollTop = log.scrollHeight;
}
