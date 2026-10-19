// A diff of several files: a header per file, folded context, the changed words [gap-diff-view; homelab's editui.js diffBlocks].
//
//   <div class="kp-diffview" data-kp-diffview aria-label="Changes to the media stack"></div>
//
//   setDiff(el, { files: [{ path: 'stacks/media/compose.yml', status: 'modified', hunks: [{ oldStart: 12, oldLen: 6, newStart: 12, newLen: 6, context: 'services:', lines: [{ kind: 'same', no: 12, text: '…' }, …] }] }] });
//   setDiff(el, { state: 'loading' });                    // the changes are being read
//   setDiff(el, { state: 'error', message: 'Loki did not answer' });
//
// The app brings the hunks (a git style diff, or its own); this module draws them and keeps no algorithm of its own beyond
// the split of two paired lines into words. It writes the markup `.kp-diff` already styles (`.kp-diff__line`, `__hunk`,
// `__hunk-context`), so every register that dresses the lines dresses this as well, and adds what was missing:
//
//   · a header per file: a chevron, a status word on a badge, the path (the folder quiet, the file name strong; a renamed
//     file shows `old → new`), exact `+N` and `-M` counts with five little blocks for their share, and Copy path. The
//     columns are as wide as the longest of the page, so the headers of several files line up.
//   · unchanged lines folded: a run of unchanged lines longer than the context on both sides of a change becomes one row,
//     "12 unchanged lines", that is a button; it opens in place and closes again. A file added or removed whole is not folded.
//   · the changed words: for a removed line paired with the added line that replaced it, the words that differ are marked
//     (`<mark class="kp-diff__word">`). The weight is the carrier as well as the tint (bold, struck through on the removed
//     side and underlined on the added side), so it survives without colour [DI4]. `jellyfin:10.11.11` becoming
//     `jellyfin:12.1.0` marks the version, not the line.
//   · loading, empty and failed states in the package's busy card and state plates, at the height the diff had.
//
// Options (attributes, each also live: change the attribute and the diff is drawn again):
//   data-kp-diff-open       `all` (default), `first`, `none` or `changed` (files with line changes); a file the reader opened
//                           or closed keeps its choice when the data is given again
//   data-kp-diff-context    unchanged lines kept on each side of a change (3); `0` or `off` folds nothing
//   data-kp-diff-words      `on` (default) or `off`
//   data-kp-diff-bar        `on` (default) or `off`: the five blocks in a header
//   data-kp-diff-copy       `on` (default) or `off`: Copy path
//   data-kp-diff-max-lines  lines drawn per file before "Show the other N lines" (400); `0` or `off` draws all
//   data-kp-diff-label      the region's accessible name
//   data-kp-diff-state      the state before `setDiff` has given any data: `loading` (draw the page with it, so the first frame is
//                           already the waiting one), `empty` or `error`; absent: nothing changed, until the data comes
//
// Events (bubbling, on the root): `kp-diff-toggle` `{ path, open }`, `kp-diff-expand` `{ path, lines, open }` (a fold),
// `kp-diff-copy` `{ path }`, `kp-diff-retry`. Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';
import { runFlashButton } from './flash.js';
import { openBusyCard } from './busy-card.js';
import { attachDisabledReasons } from './reason.js';

/** The diffs this module looks after. */
export const DIFF = '[data-kp-diffview]';
/** Fired when a file is opened or closed: `{ path, open }`. */
export const DIFF_TOGGLE_EVENT = 'kp-diff-toggle';
/** Fired when a fold of unchanged lines opens or closes: `{ path, lines, open }`. */
export const DIFF_EXPAND_EVENT = 'kp-diff-expand';
/** Fired when a path was copied: `{ path }`. */
export const DIFF_COPY_EVENT = 'kp-diff-copy';
/** Fired by the Retry of a failed diff. */
export const DIFF_RETRY_EVENT = 'kp-diff-retry';
/** Unchanged lines kept on each side of a change. */
export const DIFF_CONTEXT = 3;
/** The least number of unchanged lines worth a fold: hiding one or two costs more than showing them. */
export const DIFF_FOLD_MIN = 3;
/** Lines drawn per file before the rest waits behind "Show the other N lines". */
export const DIFF_MAX_LINES = 400;
/** A line longer than this is not split into words: the split is for a line, not a minified file. */
export const DIFF_WORD_LIMIT = 500;
/** More than this share of a line changed and the whole line is the change: marking every word says nothing. */
export const DIFF_WORD_SHARE = 0.6;
/** The statuses of a file. */
export const DIFF_STATUSES = Object.freeze(['added', 'removed', 'modified', 'renamed', 'binary']);

/**
 * @typedef {object} DiffLine
 * @property {'same' | 'added' | 'removed'} kind
 * @property {string} text
 * @property {number | null} [no] the number shown (the new file's for a kept or added line, the old file's for a removed one)
 * @property {number | null} [oldNo] used when `no` is absent
 * @property {number | null} [newNo] used when `no` is absent
 */

/**
 * @typedef {object} DiffHunk
 * @property {string} [head] the whole header, `@@ -12,6 +12,8 @@ function name`; else it is made from the four numbers
 * @property {number} [oldStart]
 * @property {number} [oldLen]
 * @property {number} [newStart]
 * @property {number} [newLen]
 * @property {string} [context] the place after the second `@@`
 * @property {DiffLine[]} lines
 */

/**
 * @typedef {object} DiffFile
 * @property {string} path
 * @property {string} [oldPath] the name before a rename
 * @property {'added' | 'removed' | 'modified' | 'renamed' | 'binary'} [status] `modified`, or `renamed` when `oldPath` differs
 * @property {number} [added] the count; counted from the lines when absent
 * @property {number} [removed]
 * @property {DiffHunk[]} [hunks]
 */

/**
 * @typedef {object} DiffSpec
 * @property {DiffFile[]} [files]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state] absent: ready, or empty without files
 * @property {string} [message] the failed plate's heading
 * @property {string[]} [compared] the names compared, for the empty plate's sentence
 */

/**
 * @typedef {object} Segment
 * @property {string} text
 * @property {boolean} changed
 */

/** @typedef {{ path: string, oldPath: string, status: string, added: number, removed: number, hunks: { range: string, context: string, lines: DiffLine[] }[] }} NormFile */
/** @typedef {{ spec: DiffSpec, files: NormFile[], opened: Map<string, boolean>, folds: Set<string>, all: Set<string>, card: import('./busy-card.js').BusyCard | null, off: (() => void)[], mode: string, said: string }} DiffState */

/** @type {WeakMap<Element, DiffState>} */
const STATE = new WeakMap();
let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {Element} root @param {string} name @param {string} fallback */
const attr = (root, name, fallback) => root.getAttribute(`data-kp-diff-${name}`) ?? fallback;

/** `off` and `0` mean no. @param {Element} root @param {string} name @param {number} fallback */
function count(root, name, fallback) {
    const raw = attr(root, name, String(fallback));
    if (raw === 'off' || raw === 'false') return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** @param {HTMLElement} root */
function stateOf(root) {
    let st = STATE.get(root);
    if (!st) {
        const first = root.getAttribute('data-kp-diff-state');
        st = { spec: first === 'loading' || first === 'empty' || first === 'error' ? { state: first } : {}, files: [], opened: new Map(), folds: new Set(), all: new Set(), card: null, off: [], mode: attr(root, 'open', 'all'), said: '' };
        STATE.set(root, st);
    }
    return st;
}

// --- The words ------------------------------------------------------------------------------------------------------

/** A word is a run of letters and digits, a version or a dotted name stays one piece. */
const TOKENS = /[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*|\s+|[^\sA-Za-z0-9_]/g;

/** @param {string} text */
const tokensOf = (text) => text.match(TOKENS) ?? [];

/**
 * Merge neighbouring pieces of the same kind, and let a gap of white space between two changed runs join them.
 * @param {string[]} tokens @param {boolean[]} changed @returns {Segment[]}
 */
function segmentsOf(tokens, changed) {
    const flags = [...changed];
    for (let i = 1; i < tokens.length - 1; i += 1) if (!flags[i] && /^\s+$/.test(tokens[i]) && flags[i - 1] && flags[i + 1]) flags[i] = true;
    /** @type {Segment[]} */
    const out = [];
    tokens.forEach((text, i) => {
        const last = out[out.length - 1];
        if (last && last.changed === flags[i]) last.text += text;
        else out.push({ text, changed: flags[i] });
    });
    return out;
}

/**
 * The words that differ between two lines: the longest run of pieces they share is kept, the rest is marked.
 * `changed` is false when there is nothing to mark, or when so much of the line differs that the line itself is the
 * change (more than `DIFF_WORD_SHARE` of the longer one), or when a line is too long to split.
 *
 * @param {string} oldText @param {string} newText
 * @returns {{ old: Segment[], new: Segment[], changed: boolean, share: number }}
 */
export function diffWords(oldText, newText) {
    const whole = (/** @type {string} */ text) => [{ text, changed: false }];
    const plain = { old: whole(oldText), new: whole(newText), changed: false, share: 0 };
    if (oldText === newText || oldText.length > DIFF_WORD_LIMIT || newText.length > DIFF_WORD_LIMIT) return plain;
    const a = tokensOf(oldText);
    const b = tokensOf(newText);
    const n = a.length;
    const m = b.length;
    // Longest common subsequence of pieces, table from the end so the walk below runs forwards.
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const goneA = new Array(n).fill(true);
    const goneB = new Array(m).fill(true);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            goneA[i] = false;
            goneB[j] = false;
            i += 1;
            j += 1;
        } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
        else j += 1;
    }
    const old = segmentsOf(a, goneA);
    const next = segmentsOf(b, goneB);
    const size = (/** @type {Segment[]} */ segments) => segments.reduce((sum, s) => sum + (s.changed ? s.text.length : 0), 0);
    const share = Math.max(size(old) / Math.max(1, oldText.length), size(next) / Math.max(1, newText.length));
    if (size(old) + size(next) === 0 || share > DIFF_WORD_SHARE) return { ...plain, share };
    return { old, new: next, changed: true, share };
}

/**
 * Pair the lines of each run "removed lines, then added lines" one to one and split every pair into words.
 * @param {DiffLine[]} lines @returns {Map<DiffLine, Segment[]>}
 */
function wordPairs(lines) {
    /** @type {Map<DiffLine, Segment[]>} */
    const out = new Map();
    let i = 0;
    while (i < lines.length) {
        if (lines[i].kind !== 'removed') {
            i += 1;
            continue;
        }
        let j = i;
        while (j < lines.length && lines[j].kind === 'removed') j += 1;
        let k = j;
        while (k < lines.length && lines[k].kind === 'added') k += 1;
        for (let p = 0; p < Math.min(j - i, k - j); p += 1) {
            const words = diffWords(lines[i + p].text, lines[j + p].text);
            if (words.changed) {
                out.set(lines[i + p], words.old);
                out.set(lines[j + p], words.new);
            }
        }
        i = Math.max(k, i + 1);
    }
    return out;
}

// --- The context ----------------------------------------------------------------------------------------------------

/**
 * @typedef {object} Part
 * @property {'lines' | 'fold'} kind
 * @property {number} from the index of its first line in the hunk
 * @property {DiffLine[]} lines
 */

/**
 * Cut a hunk's lines into stretches that show and stretches that fold. A run of unchanged lines keeps `keep` lines next to
 * every change and folds the middle when that hides at least `min` lines; a run at the start or the end of the hunk keeps
 * its lines next to the change only. A hunk with no change, and `keep` of 0, fold nothing.
 *
 * @param {readonly DiffLine[]} lines @param {number} [keep] @param {number} [min]
 * @returns {Part[]}
 */
export function foldContext(lines, keep = DIFF_CONTEXT, min = DIFF_FOLD_MIN) {
    const n = lines.length;
    if (keep <= 0 || !lines.some((line) => line.kind !== 'same')) return [{ kind: 'lines', from: 0, lines: [...lines] }];
    /** @type {Part[]} */
    const out = [];
    let start = 0;
    let i = 0;
    while (i < n) {
        if (lines[i].kind !== 'same') {
            i += 1;
            continue;
        }
        let j = i;
        while (j < n && lines[j].kind === 'same') j += 1;
        const before = i === 0 ? 0 : keep;
        const after = j === n ? 0 : keep;
        if (j - i - before - after >= min) {
            const from = i + before;
            const to = j - after;
            if (from > start) out.push({ kind: 'lines', from: start, lines: lines.slice(start, from) });
            out.push({ kind: 'fold', from, lines: lines.slice(from, to) });
            start = to;
        }
        i = j;
    }
    if (start < n) out.push({ kind: 'lines', from: start, lines: lines.slice(start) });
    return out;
}

// --- The data -------------------------------------------------------------------------------------------------------

/** @param {string} kind @returns {'same' | 'added' | 'removed'} */
const kindOf = (kind) => (kind === 'added' || kind === 'removed' ? kind : 'same');

/** @param {DiffHunk} hunk @returns {{ range: string, context: string }} */
function headOf(hunk) {
    if (typeof hunk.head === 'string' && hunk.head.trim() !== '') {
        const found = /^\s*(@@.*?@@)\s?(.*)$/.exec(hunk.head);
        return found ? { range: found[1], context: found[2] } : { range: hunk.head, context: '' };
    }
    if (hunk.oldStart !== undefined && hunk.newStart !== undefined)
        return { range: `@@ -${hunk.oldStart},${hunk.oldLen ?? 1} +${hunk.newStart},${hunk.newLen ?? 1} @@`, context: hunk.context ?? '' };
    return { range: '', context: '' };
}

/** @param {DiffFile[]} files @returns {NormFile[]} */
function normalize(files) {
    return files.map((file) => {
        const hunks = (file.hunks ?? []).map((hunk) => ({
            ...headOf(hunk),
            lines: hunk.lines.map((line) => {
                const kind = kindOf(line.kind);
                const no = line.no ?? (kind === 'removed' ? (line.oldNo ?? null) : (line.newNo ?? line.oldNo ?? null));
                return { kind, text: String(line.text ?? ''), no };
            }),
        }));
        const counted = (/** @type {'added' | 'removed'} */ kind) => hunks.reduce((sum, h) => sum + h.lines.filter((line) => line.kind === kind).length, 0);
        const oldPath = file.oldPath ?? '';
        const status = DIFF_STATUSES.includes(file.status ?? '') ? /** @type {string} */ (file.status) : oldPath !== '' && oldPath !== file.path ? 'renamed' : 'modified';
        return {
            path: String(file.path),
            oldPath,
            status,
            added: Number.isFinite(file.added) ? /** @type {number} */ (file.added) : counted('added'),
            removed: Number.isFinite(file.removed) ? /** @type {number} */ (file.removed) : counted('removed'),
            hunks,
        };
    });
}

/** @param {HTMLElement} root @param {DiffState} st @param {NormFile} file @param {number} index */
function isOpen(root, st, file, index) {
    const own = st.opened.get(file.path);
    if (own !== undefined) return own;
    switch (attr(root, 'open', 'all')) {
        case 'first':
            return index === 0;
        case 'none':
            return false;
        case 'changed':
            return file.status !== 'binary' && file.hunks.some((hunk) => hunk.lines.length > 0);
        default:
            return true;
    }
}

/** @param {HTMLElement} root @param {string} message */
function say(root, message) {
    if (root.getAttribute('data-kp-announce') === 'off') return;
    let region = /** @type {HTMLElement | null} */ (root.querySelector(':scope > .kp-diffview__live'));
    if (!region) {
        region = el('kp-sr-only kp-diffview__live', 'span');
        region.setAttribute('role', 'status');
        root.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

// --- The markup -----------------------------------------------------------------------------------------------------

/** @param {string} text @param {Segment[] | undefined} segments @returns {HTMLElement} */
function textOf(text, segments) {
    const node = el('kp-diff__text', 'span');
    if (!segments) {
        node.textContent = text;
        return node;
    }
    for (const segment of segments) {
        if (!segment.changed) node.append(document.createTextNode(segment.text));
        else {
            const mark = el('kp-diff__word', 'mark');
            mark.textContent = segment.text;
            node.append(mark);
        }
    }
    return node;
}

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
function fillBody(root, st, file, body) {
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

/** The folder quiet, the file name strong: the name stands inside the folder's span, so the path is one run of text. @param {string} path */
function pathEl(path) {
    const cut = path.lastIndexOf('/') + 1;
    const name = el('kp-diffview__name', 'span');
    name.textContent = path.slice(cut);
    if (cut === 0) return name;
    const dir = el('kp-diffview__dir', 'span');
    dir.append(document.createTextNode(path.slice(0, cut)), name);
    return dir;
}

/** Five blocks for the share of added and removed lines. @param {number} added @param {number} removed */
function proportion(added, removed) {
    const bar = el('kp-diffview__proportion', 'span');
    bar.setAttribute('aria-hidden', 'true');
    const total = added + removed;
    let plus = total === 0 ? 0 : Math.round((5 * added) / total);
    let minus = total === 0 ? 0 : Math.round((5 * removed) / total);
    if (added > 0 && plus === 0) plus = 1;
    if (removed > 0 && minus === 0) minus = 1;
    while (plus + minus > 5) {
        if (plus >= minus) plus -= 1;
        else minus -= 1;
    }
    for (let i = 0; i < 5; i += 1) {
        const block = el('kp-diffview__block', 'i');
        block.setAttribute('data-kind', i < plus ? 'added' : i < plus + minus ? 'removed' : 'same');
        bar.append(block);
    }
    return bar;
}

/** @param {HTMLElement} root @param {DiffState} st @param {NormFile} file @param {number} index */
function fileEl(root, st, file, index) {
    const s = getStrings();
    const open = isOpen(root, st, file, index);
    serial += 1;
    const id = `kp-diffview-${serial}`;
    const section = el('kp-diffview__file', 'section');
    section.setAttribute('data-kp-diff-status', file.status);
    section.setAttribute('data-kp-diff-file-open', String(open));
    section.setAttribute('data-kp-diff-path', file.path);
    const head = el('kp-diffview__head');
    const title = el('kp-diffview__title', 'h3');
    const toggle = /** @type {HTMLButtonElement} */ (el('kp-diffview__toggle', 'button'));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', id);
    const chevron = el('kp-diffview__chevron', 'span');
    chevron.setAttribute('aria-hidden', 'true');
    const status = {
        added: [s.diffStatusAdded, 'kp-badge--success'],
        removed: [s.diffStatusRemoved, 'kp-badge--destructive'],
        modified: [s.diffStatusModified, 'kp-badge--info'],
        renamed: [s.diffStatusRenamed, ''],
        binary: [s.diffStatusBinary, ''],
    }[file.status] ?? [file.status, ''];
    const badge = el(`kp-badge kp-diffview__status ${status[1]}`.trim(), 'span');
    badge.textContent = status[0];
    const path = el('kp-diffview__path', 'span');
    if (file.status === 'renamed' && file.oldPath !== '') {
        // To the eye: old, an arrow, new. To a screen reader: the new path and where it came from, once.
        const seen = el('kp-diffview__renamed', 'span');
        seen.setAttribute('aria-hidden', 'true');
        const arrow = el('kp-diffview__arrow', 'span');
        arrow.textContent = '→';
        seen.append(pathEl(file.oldPath), arrow, pathEl(file.path));
        const heard = el('kp-sr-only', 'span');
        heard.textContent = `${file.path}, ${s.diffRenamedFrom(file.oldPath)}`;
        path.append(seen, heard);
    } else path.append(pathEl(file.path));
    const counts = el('kp-diffview__counts', 'span');
    const plus = el('kp-diffview__added', 'span');
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = `+${file.added}`;
    const minus = el('kp-diffview__removed', 'span');
    minus.setAttribute('aria-hidden', 'true');
    minus.textContent = `-${file.removed}`;
    const said = el('kp-sr-only', 'span');
    said.textContent = `${s.diffAddedCount(file.added)}, ${s.diffRemovedCount(file.removed)}`;
    counts.append(plus, minus, said);
    toggle.append(chevron, badge, path, counts);
    if (attr(root, 'bar', 'on') !== 'off') toggle.append(proportion(file.added, file.removed));
    title.append(toggle);
    head.append(title);
    if (attr(root, 'copy', 'on') !== 'off') {
        const copy = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm kp-diffview__copy', 'button'));
        copy.type = 'button';
        copy.textContent = s.diffCopyPath;
        copy.setAttribute('data-kp-flash-words', `${s.diffCopied},${s.diffCopyFailed}`);
        head.append(copy);
    }
    const body = el('kp-diffview__body');
    body.id = id;
    body.setAttribute('role', 'group');
    body.setAttribute('aria-label', s.diffChangesIn(file.path));
    body.tabIndex = -1;
    body.hidden = !open;
    if (open) fillBody(root, st, file, body);
    section.append(head, body);
    return section;
}

/** The bar: how much changed, and Expand all / Collapse all. @param {HTMLElement} root @param {DiffState} st */
function barEl(root, st) {
    const s = getStrings();
    const bar = el('kp-diffview__bar');
    const summary = el('kp-diffview__summary', 'p');
    const added = st.files.reduce((sum, file) => sum + file.added, 0);
    const removed = st.files.reduce((sum, file) => sum + file.removed, 0);
    const files = el('kp-diffview__files-count', 'strong');
    files.textContent = s.diffSummary(st.files.length);
    const plus = el('kp-diffview__added', 'span');
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = `+${added}`;
    const minus = el('kp-diffview__removed', 'span');
    minus.setAttribute('aria-hidden', 'true');
    minus.textContent = `-${removed}`;
    const said = el('kp-sr-only', 'span');
    said.textContent = `, ${s.diffAddedCount(added)}, ${s.diffRemovedCount(removed)}`;
    summary.append(files, plus, minus, said);
    bar.append(summary);
    if (st.files.length > 1) {
        const tools = el('kp-diffview__tools');
        for (const [name, words] of [
            ['expand', s.diffExpandAll],
            ['collapse', s.diffCollapseAll],
        ]) {
            const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--ghost kp-button--sm', 'button'));
            button.type = 'button';
            button.textContent = words;
            button.setAttribute('data-kp-diff-all', name);
            tools.append(button);
        }
        bar.append(tools);
    }
    return bar;
}

/** Keep the two bar buttons honest about what they can still do. @param {HTMLElement} root */
function syncBar(root) {
    const s = getStrings();
    const files = [...root.querySelectorAll('.kp-diffview__file')];
    const open = files.filter((file) => file.getAttribute('data-kp-diff-file-open') === 'true').length;
    for (const [name, off, reason] of /** @type {const} */ ([
        ['expand', open === files.length, s.diffAllOpen],
        ['collapse', open === 0, s.diffAllClosed],
    ])) {
        const button = root.querySelector(`[data-kp-diff-all="${name}"]`);
        if (!button) continue;
        button.toggleAttribute('disabled', off);
        if (off) button.setAttribute('data-kp-disabled-reason', reason);
        else button.removeAttribute('data-kp-disabled-reason');
    }
}

/** Make every header's counts as wide as the longest of the page, so the columns line up. @param {HTMLElement} root @param {NormFile[]} files */
function sizeColumns(root, files) {
    const longest = (/** @type {number[]} */ numbers) => Math.max(2, ...numbers.map((n) => String(n).length + 1));
    root.style.setProperty('--kp-diffview-added-ch', String(longest(files.map((file) => file.added))));
    root.style.setProperty('--kp-diffview-removed-ch', String(longest(files.map((file) => file.removed))));
}

/** The skeleton of a diff: file headers at their final size, the first one with lines. */
function skeleton() {
    const wait = el('kp-diffview__wait');
    wait.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
        const file = el('kp-diffview__file kp-diffview__file--wait');
        const head = el('kp-diffview__head kp-diffview__head--wait');
        head.append(el('kp-skeleton kp-diffview__wait-badge', 'span'), el('kp-skeleton kp-diffview__wait-path', 'span'), el('kp-skeleton kp-diffview__wait-counts', 'span'));
        file.append(head);
        if (i === 0) {
            const body = el('kp-diffview__body kp-diffview__body--wait');
            for (let n = 0; n < 6; n += 1) body.append(el('kp-skeleton kp-diffview__wait-line', 'span'));
            file.append(body);
        }
        wait.append(file);
    }
    return wait;
}

/** Draw everything: the files, or the state in their place. @param {HTMLElement} root */
function render(root) {
    const st = stateOf(root);
    const s = getStrings();
    if (!root.classList.contains('kp-diffview')) root.classList.add('kp-diffview');
    const label = root.getAttribute('data-kp-diff-label');
    if (label) root.setAttribute('aria-label', label);
    else if (!root.hasAttribute('aria-label') && !root.hasAttribute('aria-labelledby')) root.setAttribute('aria-label', s.diffLabel);
    if (!root.hasAttribute('role')) root.setAttribute('role', 'region');
    // The open option changed: the reader's own choices give way, so the option visibly applies.
    if (st.mode !== attr(root, 'open', 'all')) {
        st.mode = attr(root, 'open', 'all');
        st.opened.clear();
    }
    const live = root.querySelector(':scope > .kp-diffview__live');
    /** @type {'ready' | 'loading' | 'empty' | 'error'} */
    const state = st.spec.state ?? (st.files.length === 0 ? 'empty' : 'ready');
    if (st.card) {
        st.card.remove();
        st.card = null;
    }
    root.setAttribute('data-kp-state', state);
    root.toggleAttribute('aria-busy', state === 'loading');
    root.replaceChildren();
    if (live) root.append(live);

    if (state === 'ready') {
        sizeColumns(root, st.files);
        const list = el('kp-diffview__list');
        st.files.forEach((file, index) => list.append(fileEl(root, st, file, index)));
        root.append(barEl(root, st), list);
        attachDisabledReasons(root.querySelector('.kp-diffview__bar') ?? root);
        syncBar(root);
        const added = st.files.reduce((sum, file) => sum + file.added, 0);
        const removed = st.files.reduce((sum, file) => sum + file.removed, 0);
        const summary = s.diffReady(st.files.length, added, removed);
        if (st.said !== summary) {
            st.said = summary;
            say(root, summary);
        }
        return;
    }
    st.said = '';
    const stage = el('kp-diffview__stage');
    if (state === 'loading') {
        stage.append(skeleton());
        root.append(stage);
        st.card = openBusyCard(root, { words: s.diffLoading, area: () => [stage], className: 'kp-diffview__busy', arrive: false });
    } else if (state === 'empty') {
        const names = (st.spec.compared ?? []).filter((name) => name !== '');
        const text = names.length === 1 ? s.diffEmptySame(names[0]) : names.length === 2 ? s.diffEmptyBetween(names[0], names[1]) : s.diffEmptyText;
        stage.append(statePlate(document, { kind: 'empty', title: s.diffEmptyTitle, text }));
        root.append(stage);
    } else {
        stage.append(
            statePlate(document, {
                kind: 'error',
                title: st.spec.message ?? s.diffFailedTitle,
                text: s.diffFailedText,
                actionLabel: s.diffRetry,
                actionAttribute: 'data-kp-diff-retry-action',
            }),
        );
        root.append(stage);
    }
}

/**
 * Give a diff its files or its state.
 * @param {HTMLElement} root @param {DiffSpec | DiffFile[]} spec
 */
export function setDiff(root, spec) {
    if (!(root instanceof HTMLElement)) return;
    const st = stateOf(root);
    const next = Array.isArray(spec) ? { files: spec } : spec;
    st.spec = { ...st.spec, ...next };
    if (next.files !== undefined) {
        st.files = normalize(next.files);
        if (next.state === undefined) delete st.spec.state;
    }
    render(root);
}

/** @param {HTMLElement} root @param {string} path */
function fileOf(root, path) {
    const st = stateOf(root);
    const file = st.files.find((candidate) => candidate.path === path);
    const section = [...root.querySelectorAll('.kp-diffview__file')].find((node) => node.getAttribute('data-kp-diff-path') === path);
    return file && section instanceof HTMLElement ? { file, section } : null;
}

/** Open or close one file. @param {HTMLElement} root @param {string} path @param {boolean} open @param {boolean} [announce] */
function toggleFile(root, path, open, announce = true) {
    const found = fileOf(root, path);
    if (!found) return;
    const st = stateOf(root);
    const { file, section } = found;
    st.opened.set(path, open);
    section.setAttribute('data-kp-diff-file-open', String(open));
    section.querySelector('.kp-diffview__toggle')?.setAttribute('aria-expanded', String(open));
    const body = /** @type {HTMLElement} */ (section.querySelector('.kp-diffview__body'));
    if (open && body.childElementCount === 0) fillBody(root, st, file, body);
    body.hidden = !open;
    syncBar(root);
    if (announce) root.dispatchEvent(new CustomEvent(DIFF_TOGGLE_EVENT, { bubbles: true, detail: { path, open } }));
}

/** @param {HTMLElement} root @param {HTMLElement} button */
async function copyPath(root, button) {
    const path = button.closest('.kp-diffview__file')?.getAttribute('data-kp-diff-path') ?? '';
    if (path === '') return;
    const s = getStrings();
    await runFlashButton(button, async () => {
        try {
            await navigator.clipboard.writeText(path);
        } catch {
            const box = document.createElement('textarea');
            box.value = path;
            document.body.append(box);
            box.select();
            const ok = document.execCommand('copy');
            box.remove();
            if (!ok) return { error: s.diffCopyFailed, word: s.diffCopyFailed };
        }
        root.dispatchEvent(new CustomEvent(DIFF_COPY_EVENT, { bubbles: true, detail: { path } }));
        return s.diffCopied;
    });
}

/**
 * Wire every diff under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDiffs(root = document) {
    const roots = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(DIFF) ? [root] : []), ...root.querySelectorAll(DIFF)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const el_ of roots) {
        const st = stateOf(el_);
        if (st.off.length) continue;
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const t = event.target instanceof Element ? event.target : null;
            if (!t) return;
            const s = getStrings();
            const toggle = t.closest('.kp-diffview__toggle');
            if (toggle) {
                const section = toggle.closest('.kp-diffview__file');
                const path = section?.getAttribute('data-kp-diff-path') ?? '';
                return toggleFile(el_, path, toggle.getAttribute('aria-expanded') !== 'true');
            }
            const all = t.closest('[data-kp-diff-all]');
            if (all instanceof HTMLButtonElement) {
                if (all.disabled) return;
                const open = all.getAttribute('data-kp-diff-all') === 'expand';
                for (const section of el_.querySelectorAll('.kp-diffview__file')) {
                    const path = section.getAttribute('data-kp-diff-path') ?? '';
                    if ((section.getAttribute('data-kp-diff-file-open') === 'true') !== open) toggleFile(el_, path, open);
                }
                return;
            }
            const fold = t.closest('.kp-diff__fold');
            if (fold instanceof HTMLElement) {
                const key = fold.getAttribute('data-kp-diff-fold-key') ?? '';
                const lines = Number(fold.getAttribute('data-kp-diff-fold-lines'));
                const path = key.split('|')[0];
                const open = !st.folds.has(key);
                if (open) st.folds.add(key);
                else st.folds.delete(key);
                const found = fileOf(el_, path);
                if (!found) return;
                fillBody(el_, st, found.file, /** @type {HTMLElement} */ (found.section.querySelector('.kp-diffview__body')));
                /** @type {HTMLElement | null} */ (el_.querySelector(`[data-kp-diff-fold-key="${CSS.escape(key)}"]`))?.focus();
                say(el_, open ? s.diffUnchangedShown(lines) : s.diffUnchangedHidden(lines));
                el_.dispatchEvent(new CustomEvent(DIFF_EXPAND_EVENT, { bubbles: true, detail: { path, lines, open } }));
                return;
            }
            const more = t.closest('[data-kp-diff-more]');
            if (more) {
                const path = more.closest('.kp-diffview__file')?.getAttribute('data-kp-diff-path') ?? '';
                const found = fileOf(el_, path);
                if (!found) return;
                st.all.add(path);
                const body = /** @type {HTMLElement} */ (found.section.querySelector('.kp-diffview__body'));
                fillBody(el_, st, found.file, body);
                body.focus({ preventScroll: true });
                return;
            }
            const copy = t.closest('.kp-diffview__copy');
            if (copy instanceof HTMLButtonElement) return void copyPath(el_, copy);
            if (t.closest('[data-kp-diff-retry-action]')) el_.dispatchEvent(new CustomEvent(DIFF_RETRY_EVENT, { bubbles: true }));
        };
        el_.addEventListener('click', onClick);
        // Every option is live: change the attribute and the diff is drawn again.
        let queued = 0;
        const watcher = new MutationObserver(() => {
            window.cancelAnimationFrame(queued);
            queued = window.requestAnimationFrame(() => render(el_));
        });
        watcher.observe(el_, { attributes: true, attributeFilter: ['open', 'context', 'words', 'bar', 'copy', 'max-lines', 'label'].map((name) => `data-kp-diff-${name}`) });
        st.off = [() => el_.removeEventListener('click', onClick), () => watcher.disconnect(), () => window.cancelAnimationFrame(queued)];
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
        });
        render(el_);
    }
    return () => undo.forEach((u) => u());
}
