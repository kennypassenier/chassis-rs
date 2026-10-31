// The functions a page calls on a diff: set it, toggle a file and copy a path.
import { getStrings } from '../strings.js';
import { runFlashButton } from '../flash.js';
import { DIFF_COPY_EVENT, DIFF_TOGGLE_EVENT } from './constants.js';
import { syncBar } from './file.js';
import { fillBody } from './lines.js';
import { stateOf } from './model.js';
import { normalize } from './read.js';
import { render } from './render.js';
/** @typedef {import('./types.js').DiffFile} DiffFile */
/** @typedef {import('./types.js').DiffSpec} DiffSpec */

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
export function fileOf(root, path) {
    const st = stateOf(root);
    const file = st.files.find((candidate) => candidate.path === path);
    const section = [...root.querySelectorAll('.kp-diffview__file')].find((node) => node.getAttribute('data-kp-diff-path') === path);
    return file && section instanceof HTMLElement ? { file, section } : null;
}

/** Open or close one file. @param {HTMLElement} root @param {string} path @param {boolean} open @param {boolean} [announce] */
export function toggleFile(root, path, open, announce = true) {
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
export async function copyPath(root, button) {
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
