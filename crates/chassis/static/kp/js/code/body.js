// The body of a block: the coloured lines with their fold and foot, or the plate or sentence of an empty, binary or failed one.

import { getStrings } from '../strings.js';
import { hostStatePlate } from '../state-plate.js';
import { make } from './dom.js';
import { highlightKind, isJson, prettyJson } from './language.js';
import { apart, jsonLine, shellLine, tomlLine } from './highlight.js';
import { nextBodyNumber } from './state.js';

/** @typedef {import('./controller.js').CodeBlock} CodeBlock */

/**
 * The lines past the fold are out of sight, so they are out of the layout of what can be seen: `data-kp-code-beyond`
 * hides them while the block is folded.
 * @param {CodeBlock} ctl
 */
export function markBeyond(ctl) {
    const max = ctl.spec.maxLines ?? 0;
    ctl.host
        .querySelectorAll('.kp-code__line')
        .forEach((line, i) => line.toggleAttribute('data-kp-code-beyond', ctl.cell && max > 0 && ctl.folded && i >= max));
}

/**
 * Empty and failed are the package plate, centred at the body's height with a normal Retry [states-check-1019]; the
 * Retry fires `kp-code-retry` on the root.
 * @param {CodeBlock} ctl @param {string} kind @param {number} was the height the body had
 */
function drawPlate(ctl, kind, was) {
    const strings = getStrings();
    const plate = hostStatePlate(ctl.host, {
        kind: kind === 'error' ? 'error' : 'empty',
        title: ctl.spec.message ?? (kind === 'error' ? strings.codeError : strings.codeEmpty),
        ...(kind === 'error' ? { retryEvent: 'kp-code-retry' } : {}),
    });
    plate.classList.add('kp-code__plate');
    plate.style.minBlockSize = was > 0 ? `max(${Math.round(was)}px, 0px)` : 'var(--kp-stateplate-floor, 12rem)';
    ctl.host.append(plate);
}

/** The one muted sentence of an empty, binary or failed block, with the download link of a binary cell. @param {CodeBlock} ctl @param {string} kind @param {number} was */
function drawNote(ctl, kind, was) {
    const doc = ctl.host.ownerDocument;
    const strings = getStrings();
    const { spec, cell } = ctl;
    const note = make(doc, cell ? 'kp-code__note kp-code__note--line' : 'kp-code__note', 'p');
    note.setAttribute('role', 'status');
    if (was > 0 && !cell) note.style.minBlockSize = `${was}px`;
    note.textContent = cell
        ? (spec.message ?? (kind === 'binary' ? strings.payloadBinary(spec.size ?? '') : kind === 'error' ? strings.codeError : strings.payloadEmpty))
        : (spec.message ?? (kind === 'binary' ? strings.codeBinary(spec.size ?? '') : kind === 'error' ? strings.codeError : strings.codeEmpty));
    if (cell && kind === 'binary' && spec.downloadUrl) {
        const link = /** @type {HTMLAnchorElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'a'));
        link.href = spec.downloadUrl;
        link.setAttribute('download', '');
        link.textContent = strings.payloadDownload;
        note.append(' ', link);
    }
    ctl.host.append(note);
}

/** A state with nothing to show: empty, binary or failed. @param {CodeBlock} ctl @param {number} was the height the body had */
function drawNoText(ctl, was) {
    const state = ctl.spec.state ?? 'ready';
    const kind = state === 'ready' ? 'empty' : state;
    ctl.host.setAttribute('data-kp-state', kind);
    ctl.host.removeAttribute('data-kp-code-folded');
    if (!ctl.cell && kind !== 'binary') drawPlate(ctl, kind, was);
    else drawNote(ctl, kind, was);
    ctl.shown = '';
}

/** The lines of the text, each coloured for its language. @param {CodeBlock} ctl @param {string[]} lines @param {boolean} json */
function buildCode(ctl, lines, json) {
    const doc = ctl.host.ownerDocument;
    const { spec } = ctl;
    const colour = highlightKind(spec);
    const tomlState = { open: '' };
    // The `code` is what scrolls sideways, inside the body's padding, so a long line is cut 0.75rem from the plate's edge, never at it.
    const code = make(doc, '', 'code');
    code.setAttribute('tabindex', '0');
    code.setAttribute('role', 'region');
    code.setAttribute('aria-label', spec.title ?? spec.language ?? getStrings().codeLabel);
    for (const line of lines) {
        const row = make(doc, 'kp-code__line');
        const words = make(doc, 'kp-code__text');
        if (line === '') words.textContent = ' ';
        else if (json) words.append(...jsonLine(doc, line));
        else if (colour === 'toml') words.append(...apart(tomlLine(doc, line, tomlState)));
        else if (colour === 'shell') words.append(...apart(shellLine(doc, line)));
        else words.textContent = line;
        row.append(words);
        code.append(row);
    }
    return code;
}

/** The fold button under a block that is longer than its maximum. @param {CodeBlock} ctl @param {number} lineCount @param {string} bodyId */
function buildFold(ctl, lineCount, bodyId) {
    const doc = ctl.host.ownerDocument;
    const strings = getStrings();
    const more = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'button'));
    more.type = 'button';
    more.dataset.kpCodeTool = 'fold';
    more.setAttribute('aria-controls', bodyId);
    more.setAttribute('aria-expanded', String(!ctl.folded));
    const word = make(doc, 'kp-code__word');
    const showAll = ctl.cell ? strings.payloadShowAll(lineCount) : strings.codeShowAll(lineCount);
    const dialogue = ctl.cell && ctl.spec.open === 'dialog';
    if (dialogue) more.dataset.kpCodeOpen = 'dialog';
    word.setAttribute('data-kp-code-words', [showAll, strings.codeShowLess].join('\n'));
    word.textContent = ctl.folded || dialogue ? (dialogue ? strings.payloadOpen : showAll) : strings.codeShowLess;
    if (dialogue) word.setAttribute('data-kp-code-words', strings.payloadOpen);
    more.append(word);
    return more;
}

/** The foot: what was cut off, and the fold. @param {CodeBlock} ctl @param {number} lineCount @param {string} bodyId @param {boolean} foldable */
function buildFoot(ctl, lineCount, bodyId, foldable) {
    const doc = ctl.host.ownerDocument;
    const { spec } = ctl;
    const foot = make(doc, 'kp-code__foot', 'div');
    if (spec.truncated) {
        const note = make(doc, 'kp-code__truncated');
        note.textContent = getStrings().codeTruncated(spec.truncated.shown, spec.truncated.total);
        foot.append(note);
    }
    if (foldable) {
        if (!spec.truncated) foot.append(make(doc, ''));
        foot.append(buildFold(ctl, lineCount, bodyId));
    }
    foot.hidden = !spec.truncated && !foldable;
    return foot;
}

/** The text of a block that has some. @param {CodeBlock} ctl @param {string} text */
function drawText(ctl, text) {
    const el = ctl.host;
    const { spec } = ctl;
    el.setAttribute('data-kp-state', 'ready');
    const json = isJson(spec.language);
    const pretty = json ? prettyJson(text) : null;
    const shown = json && ctl.layout === 'pretty' && pretty !== null ? pretty : text;
    ctl.shown = shown;
    const lines = shown.split('\n');
    ctl.lines = lines.length;
    const body = make(el.ownerDocument, 'kp-code__body', 'pre');
    body.id ||= `kp-code-${nextBodyNumber()}`;
    body.append(buildCode(ctl, lines, json));
    el.toggleAttribute('data-kp-code-lines', Boolean(spec.lines));
    el.style.setProperty('--kp-code-gutter', String(String(lines.length).length));
    const max = spec.maxLines ?? 0;
    const foldable = max > 0 && lines.length > max;
    el.toggleAttribute('data-kp-code-folded', foldable && ctl.folded);
    if (foldable) el.style.setProperty('--kp-code-max-lines', String(max));
    el.append(body);
    markBeyond(ctl);
    el.append(buildFoot(ctl, lines.length, body.id, foldable));
}

/** Draw the body from the block's state. @param {CodeBlock} ctl */
export function drawBody(ctl) {
    const el = ctl.host;
    const text = ctl.spec.text ?? '';
    el.removeAttribute('aria-busy');
    ctl.drawn = true;
    // The height the body had, so a sentence in its place keeps it (nothing under the block moves).
    const was = el.querySelector(':scope > :is(.kp-code__body, .kp-code__note)')?.getBoundingClientRect().height ?? 0;
    for (const node of [...el.children]) if (node !== ctl.head) node.remove();
    if ((ctl.spec.state ?? 'ready') !== 'ready' || text === '') drawNoText(ctl, was);
    else drawText(ctl, text);
}
