// Draws code blocks: `setCode` for a page that draws later, `attachCodes` for the blocks js/auto.js finds in markup.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { formatBytes } from '../locale.js';
import { CODE } from './constants.js';
import { CodeBlock } from './controller.js';

/**
 * Draw (or redraw) a code block. The reader's Wrap, layout and fold are kept
 * across calls unless the spec names them again.
 * @param {HTMLElement} el the root, a `.kp-code`
 * @param {import('./constants.js').CodeSpec} given
 */
export function setCode(el, given) {
    const block = controllerOf(el, CodeBlock) ?? attachOne(el, CodeBlock);
    block?.update(given);
}

/** The spec of a block written in markup. @param {HTMLElement} el @returns {import('./constants.js').CodeSpec} */
function specFromMarkup(el) {
    const source = el.querySelector('code') ?? el.querySelector('pre');
    const read = (/** @type {string} */ name) => el.getAttribute(`data-kp-code-${name}`) ?? undefined;
    const cell = el.classList.contains('kp-code--cell');
    const state = /** @type {import('./constants.js').CodeSpec['state']} */ (read('state'));
    const layout = read('layout');
    // Bytes as the page counted them: the size and the foot line are written in the locale's words.
    const binaryBytes = Number(el.getAttribute('data-kp-binary-size'));
    const cut = (el.getAttribute('data-kp-truncated') ?? '').split('/').map((n) => Number(n));
    const open = read('open');
    return {
        text: source?.textContent ?? '',
        title: read('title'),
        language: read('language'),
        size: Number.isFinite(binaryBytes) && el.hasAttribute('data-kp-binary-size') ? formatBytes(binaryBytes) : read('size'),
        lines: el.hasAttribute('data-kp-code-lines'),
        wrap: el.hasAttribute('data-kp-code-wrap') ? true : cell ? undefined : false,
        maxLines: read('max') !== undefined ? Number(read('max')) || 0 : cell ? 3 : 0,
        layout: layout === 'raw' ? 'raw' : layout === 'pretty' ? 'pretty' : undefined,
        state: state ?? (el.hasAttribute('data-kp-binary-size') ? 'binary' : undefined),
        cell,
        open: open === 'dialog' ? 'dialog' : undefined,
        downloadUrl: el.getAttribute('data-kp-download') ?? undefined,
        copy: el.getAttribute('data-kp-copy') === 'false' ? false : undefined,
        highlight: ['off', 'false'].includes(read('highlight') ?? '') ? false : undefined,
        truncated:
            cut.length === 2 && cut.every((n) => Number.isFinite(n) && n > 0)
                ? { shown: formatBytes(cut[0]), total: formatBytes(cut[1]) }
                : undefined,
    };
}

/**
 * Fill every `[data-kp-code]` under `root` from its markup: the text of its
 * `code` (or `pre`), and `data-kp-code-title`, `-language`, `-size`,
 * `-lines`, `-wrap`, `-max`, `-layout`, `-state`, `-highlight` (`off`).
 * A drawn block belongs to its element and stays drawn, so the detach has nothing to undo.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCodes(root = document) {
    for (const el of hostsOf(root, CODE)) {
        if (controllerOf(el, CodeBlock)) continue;
        setCode(el, specFromMarkup(el));
    }
    return () => {};
}
