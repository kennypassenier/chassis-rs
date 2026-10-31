// Reads a diff: the kind and head of a file, normalising it, whether it is open, the announcement and the text.
import { DIFF_STATUSES } from './constants.js';
import { attr, el } from './model.js';
/** @typedef {import('./types.js').DiffFile} DiffFile */
/** @typedef {import('./types.js').DiffHunk} DiffHunk */
/** @typedef {import('./types.js').DiffState} DiffState */
/** @typedef {import('./types.js').NormFile} NormFile */
/** @typedef {import('./types.js').Segment} Segment */

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
export function normalize(files) {
    return files.map((file) => {
        const hunks = (file.hunks ?? []).map((hunk) => ({
            ...headOf(hunk),
            lines: hunk.lines.map((line) => {
                const kind = kindOf(line.kind);
                const no = line.no ?? (kind === 'removed' ? (line.oldNo ?? null) : (line.newNo ?? line.oldNo ?? null));
                return { kind, text: String(line.text ?? ''), no };
            }),
        }));
        const counted = (/** @type {'added' | 'removed'} */ kind) =>
            hunks.reduce((sum, h) => sum + h.lines.filter((line) => line.kind === kind).length, 0);
        const oldPath = file.oldPath ?? '';
        const status = DIFF_STATUSES.includes(file.status ?? '')
            ? /** @type {string} */ (file.status)
            : oldPath !== '' && oldPath !== file.path
              ? 'renamed'
              : 'modified';
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
export function isOpen(root, st, file, index) {
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
export function say(root, message) {
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
export function textOf(text, segments) {
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
