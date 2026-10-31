// Draws one file of the diff: its path, its change bar and its header.
import { getStrings } from '../strings.js';
import { fillBody } from './lines.js';
import { attr, el } from './model.js';
import { isOpen } from './read.js';
import { diffState } from './state.js';
/** @typedef {import('./types.js').DiffState} DiffState */
/** @typedef {import('./types.js').NormFile} NormFile */

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
export function fileEl(root, st, file, index) {
    const s = getStrings();
    const open = isOpen(root, st, file, index);
    diffState.serial += 1;
    const id = `kp-diffview-${diffState.serial}`;
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
export function barEl(root, st) {
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
export function syncBar(root) {
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
