// Draws the lines and rows of a hunk and fills the body of a file.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { DIFF_CONTEXT, DIFF_MAX_LINES } from './constants.js';
import { foldContext } from './fold.js';
import { attr, count, el } from './model.js';
import { textOf } from './read.js';
import { wordPairs } from './words.js';
/** @typedef {import('./types.js').DiffLine} DiffLine */
/** @typedef {import('./types.js').DiffState} DiffState */
/** @typedef {import('./types.js').NormFile} NormFile */
/** @typedef {import('./types.js').Segment} Segment */

/** @param {DiffLine} line @param {Segment[] | undefined} segments */
function lineEl(line, segments) {
    const row = el('kp-diff__line');
    row.setAttribute('data-kind', line.kind);
    const number = el('kp-diff__number', 'span');
    number.textContent = line.no == null ? '' : String(line.no);
    const sign = el('kp-diff__sign', 'span');
    sign.textContent = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
    row.append(number, sign, textOf(line.text, segments));
    return row;
}

/** A row that is a button across the diff's grid: the fold of unchanged lines, and "Show the other N lines". @param {string} className @param {string} words */
function rowButton(className, words) {
    const button = /** @type {HTMLButtonElement} */ (el(`${className} kp-diff__row-button`, 'button'));
    button.type = 'button';
    const glyph = el('kp-diff__row-glyph', 'span');
    glyph.setAttribute('aria-hidden', 'true');
    const label = el('kp-diff__row-label', 'span');
    label.textContent = words;
    button.append(glyph, el('kp-diff__row-gap', 'span'), label);
    return button;
}

/**
 * Draw one file's lines into its body.
 * @param {HTMLElement} root @param {DiffState} st @param {NormFile} file @param {HTMLElement} body
 */
export function fillBody(root, st, file, body) {
    const s = getStrings();
    body.replaceChildren();
    const lineCount = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    if (file.status === 'binary') {
        const plate = statePlate(document, { kind: 'empty', title: s.diffBinaryTitle, text: s.diffBinaryText });
        plate.classList.add('kp-diffview__plate');
        body.append(plate);
        return;
    }
    if (lineCount === 0) {
        const note = el('kp-diffview__note', 'p');
        note.textContent = s.diffNoLines;
        body.append(note);
        return;
    }
    const keep = count(root, 'context', DIFF_CONTEXT);
    const words = attr(root, 'words', 'on') !== 'off';
    const cap = st.all.has(file.path) ? 0 : count(root, 'max-lines', DIFF_MAX_LINES);
    const surface = el('kp-diff');
    let drawn = 0;
    let left = 0;
    /** @param {DiffLine} line @param {Map<DiffLine, Segment[]>} pairs */
    const draw = (line, pairs) => {
        if (cap > 0 && drawn >= cap) {
            left += 1;
            return;
        }
        drawn += 1;
        surface.append(lineEl(line, pairs.get(line)));
    };
    file.hunks.forEach((hunk, h) => {
        if (cap > 0 && drawn >= cap) {
            left += hunk.lines.length;
            return;
        }
        if (hunk.range !== '') {
            const head = el('kp-diff__hunk');
            head.append(document.createTextNode(hunk.range));
            if (hunk.context !== '') {
                const context = el('kp-diff__hunk-context', 'span');
                context.textContent = ` ${hunk.context}`;
                head.append(context);
            }
            surface.append(head);
        }
        const pairs = words ? wordPairs(hunk.lines) : new Map();
        for (const part of foldContext(hunk.lines, keep)) {
            if (part.kind === 'lines') {
                for (const line of part.lines) draw(line, pairs);
                continue;
            }
            if (cap > 0 && drawn >= cap) {
                left += part.lines.length;
                continue;
            }
            const key = `${file.path}|${h}|${part.from}`;
            const open = st.folds.has(key);
            const fold = rowButton('kp-diff__fold', open ? s.diffUnchangedHide(part.lines.length) : s.diffUnchanged(part.lines.length));
            fold.setAttribute('aria-expanded', String(open));
            fold.setAttribute('data-kp-diff-fold-key', key);
            fold.setAttribute('data-kp-diff-fold-lines', String(part.lines.length));
            if (!open) fold.setAttribute('aria-label', s.diffUnchangedName(part.lines.length));
            surface.append(fold);
            if (open) for (const line of part.lines) draw(line, pairs);
        }
    });
    if (left > 0) {
        const more = rowButton('kp-diff__more', s.diffShowMore(left));
        more.setAttribute('data-kp-diff-more', '');
        surface.append(more);
    }
    body.append(surface);
}
