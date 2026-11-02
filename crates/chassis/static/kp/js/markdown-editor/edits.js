// The text edits of the Markdown editor, pure: the text and the selection in, one replacement and the new selection out, so the
// controller can apply it as a single step the browser's undo takes back.

/**
 * One change: replace `from`..`to` with `text`, then select `select`.
 * @typedef {{ from: number, to: number, text: string, select: [number, number] }} Edit
 */

/** A list line: its indent, its marker (with the number and its sign for a numbered one), an optional task box, its words. */
const LIST_LINE = /^(\s*)(?:([-*+])|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?(.*)$/;
/** What `line` puts in front of each line, and how it finds it there already. */
const PREFIXES = {
    list: { add: '- ', has: /^\s*[-*+]\s+(?!\[[ xX]\])/ },
    task: { add: '- [ ] ', has: /^\s*[-*+]\s+\[[ xX]\]\s+/ },
    heading: { add: '## ', has: /^#{1,6}\s+/ },
};
/** Any marker a line may start with, taken off before another is put on. */
const ANY_MARKER = /^(\s*)(?:#{1,6}\s+|(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?)/;

/**
 * Bold or italic: the selection wrapped in `marker`, or unwrapped when it already is.
 * @param {string} value @param {number} start @param {number} end @param {string} marker `**` or `_`
 * @returns {Edit}
 */
export function wrap(value, start, end, marker) {
    const m = marker.length;
    if (value.slice(start - m, start) === marker && value.slice(end, end + m) === marker) {
        return { from: start - m, to: end + m, text: value.slice(start, end), select: [start - m, end - m] };
    }
    return { from: start, to: end, text: `${marker}${value.slice(start, end)}${marker}`, select: [start + m, end + m] };
}

/** The start of the line `at` is on. @param {string} value @param {number} at */
const lineStart = (value, at) => value.lastIndexOf('\n', at - 1) + 1;
/** The end of the line `at` is on (before its newline). @param {string} value @param {number} at */
const lineEnd = (value, at) => {
    const next = value.indexOf('\n', at);
    return next === -1 ? value.length : next;
};

/**
 * A list, a checklist or a heading on every line the selection touches: added, or taken off when every line has it already.
 * @param {string} value @param {number} start @param {number} end @param {'list' | 'task' | 'heading'} kind
 * @returns {Edit}
 */
export function prefixLines(value, start, end, kind) {
    const from = lineStart(value, start);
    const to = lineEnd(value, Math.max(start, end - (end > start && value[end - 1] === '\n' ? 1 : 0)));
    const lines = value.slice(from, to).split('\n');
    const { add, has } = PREFIXES[kind];
    const off = lines.every((line) => has.test(line));
    const text = lines.map((line) => (off ? line.replace(has, '') : `${line.replace(ANY_MARKER, '$1')}`.replace(/^(\s*)/, `$1${add}`))).join('\n');
    return { from, to, text, select: lines.length === 1 && start === end ? caretAfter(from, text, start - from, value.slice(from, to)) : [from, from + text.length] };
}

/**
 * Where the caret goes on a one-line change: as far into the words as it was.
 * @param {number} from @param {string} text @param {number} into @param {string} before
 * @returns {[number, number]}
 */
function caretAfter(from, text, into, before) {
    const at = Math.max(0, Math.min(text.length, into + text.length - before.length));
    return [from + at, from + at];
}

/**
 * A link: `[words](https://)` round the selection, with the address selected to type over; with nothing selected the words are
 * `placeholder`, selected first.
 * @param {string} value @param {number} start @param {number} end @param {string} placeholder
 * @returns {Edit}
 */
export function link(value, start, end, placeholder) {
    const words = value.slice(start, end);
    const address = 'https://';
    if (words === '') {
        return { from: start, to: end, text: `[${placeholder}](${address})`, select: [start + 1, start + 1 + placeholder.length] };
    }
    const at = start + words.length + 3;
    return { from: start, to: end, text: `[${words}](${address})`, select: [at, at + address.length] };
}

/**
 * Enter at the end of a list item: the next item, numbered one on and with an empty box when this one has a box. Enter on an
 * item with no words ends the list (its marker goes). Null when Enter is not the list's (not a list line, or a selection).
 * @param {string} value @param {number} start @param {number} end
 * @returns {Edit | null}
 */
export function continueList(value, start, end) {
    if (start !== end) return null;
    const from = lineStart(value, start);
    const line = value.slice(from, lineEnd(value, start));
    const m = LIST_LINE.exec(line);
    if (!m) return null;
    const [, indent, bullet, number, sign, gap, box, words] = m;
    const markerLength = line.length - words.length;
    if (start - from < markerLength) return null;
    if (words.trim() === '' && start === from + line.length) return { from, to: from + line.length, text: '', select: [from, from] };
    const marker = bullet ?? `${Number(number) + 1}${sign}`;
    const next = `\n${indent}${marker}${gap}${box ? '[ ] ' : ''}`;
    return { from: start, to: start, text: next, select: [start + next.length, start + next.length] };
}

/**
 * The line `line` (from 0) of a text, as a range, for a change that touches only it.
 * @param {string} value @param {number} line
 * @returns {[number, number] | null}
 */
export function lineRange(value, line) {
    let from = 0;
    for (let i = 0; i < line; i += 1) {
        const next = value.indexOf('\n', from);
        if (next === -1) return null;
        from = next + 1;
    }
    return [from, lineEnd(value, from)];
}
