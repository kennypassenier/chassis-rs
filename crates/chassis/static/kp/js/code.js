// The code block: a payload, a request or a snippet shown as text
// [kpadopt4-data; kyu's `pre.snippet` with its Reveal and Copy, the payload
// cell of its dead letters, the requests in chassis' clients dialog].
//
//   <figure class="kp-code" data-kp-code data-kp-code-title="Payload" data-kp-code-language="JSON" data-kp-code-max="12">
//       <pre class="kp-code__body"><code>{"topic":"backup.done","ok":true}</code></pre>
//   </figure>
//
// js/auto.js finds it and setCode() draws the rest; a page that draws later
// calls setCode(el, { text, title, language, … }) itself. The block is:
//
//   - a head: the title, what it is (language, lines, size) and the tools,
//     which keep their place in every state: Pretty and Raw (a segmented
//     control, only for JSON that parses), Wrap (a toggle, `aria-pressed`),
//     and Copy, whose word changes to "Copied" in the width the longest word
//     keeps (`.kp-code__word`), so nothing beside it moves;
//   - the text in the mono face, scrolling sideways in its own box (it takes
//     focus, so a keyboard can scroll it), or wrapped; JSON keys in the key
//     colour and its punctuation quiet; line numbers in a gutter outside the
//     text with `lines` (a copy or a selection never takes them);
//   - folded to `maxLines` with "Show all N lines" under it when it is
//     longer, and a foot that says when only the start was sent
//     (`truncated: { shown, total }`).
//
// States: `loading` (the body keeps its height under the data table's busy
// card, js/busy-card.js; the tools wait, disabled), `empty`, `binary` (`size`)
// and `error` (`message`), each a sentence in the body's place at its height.
// The same block as a table cell [kpadopt5], `.kp-code--cell`: no title, the
// words wrap (a row never scrolls sideways), three lines show and "Show all 40
// lines" opens the rest in place (`data-kp-code-open="inline"`, default) or in a
// dialog (`"dialog"`); `data-kp-code-language="auto"` makes it JSON only when
// the text parses; `data-kp-binary-size` (bytes) and `data-kp-download` give the
// one muted line "binary, 2.1 kB" with its link; `data-kp-truncated="1024/4096"`
// (bytes shown / bytes in all) gives the foot line; `data-kp-copy="false"` takes
// Copy away, otherwise it copies the whole value, folded or not. Empty is the
// muted line "empty payload"; loading is a skeleton line, since the table
// around it lays the busy card.
//
// Events on the root: `kp-code-copy` `{ text }`, `kp-code-copy-failed`,
// `kp-code-wrap` `{ wrap }`, `kp-code-layout` `{ layout }`, `kp-code-fold`
// `{ folded }`.

import { getStrings } from './strings.js';
import { openBusyCard } from './busy-card.js';
import { attachSegmented } from './segmented.js';
import { formatBytes } from './locale.js';

/** A code block js/auto.js fills from its markup. */
export const CODE = '[data-kp-code]';
/** How long "Copied" stays, in ms. */
export const CODE_COPIED_MS = 1500;

/**
 * @typedef {object} CodeSpec
 * @property {string} [text]
 * @property {string} [title]
 * @property {string} [language]   shown in the head; 'JSON' (any case) offers Pretty and Raw when the text parses
 * @property {string} [size]       shown in the head, and in the binary sentence
 * @property {boolean} [lines]     line numbers
 * @property {boolean} [wrap]      wrapped from the start (the reader can toggle it)
 * @property {number} [maxLines]   fold past this many lines (0: never)
 * @property {'pretty' | 'raw'} [layout]  the JSON layout to start with (default 'pretty')
 * @property {boolean} [copy]      the Copy button (default true)
 * @property {{ shown: string, total: string }} [truncated]
 * @property {'ready' | 'loading' | 'empty' | 'binary' | 'error'} [state]
 * @property {string} [message]    the sentence of a failed or empty block
 * @property {string} [loadingWords]
 * @property {boolean} [cell]        a table cell: wrapped, three lines, a muted line for empty and binary [kpadopt5]
 * @property {'inline' | 'dialog'} [open]  where the rest of a folded cell opens (default inline) [kpadopt5]
 * @property {string} [downloadUrl]  a link under a binary cell's line [kpadopt5]
 */

/**
 * @typedef {object} CodeMemory
 * @property {CodeSpec} spec
 * @property {boolean} wrap
 * @property {'pretty' | 'raw'} layout
 * @property {boolean} folded
 * @property {string} shown        the text as shown, which Copy copies
 * @property {number} lines
 * @property {import('./busy-card.js').BusyCard | null} card
 * @property {boolean} drawn
 * @property {CodeSpec | null} pending
 * @property {HTMLElement | null} head
 * @property {number} revert
 * @property {boolean} cell
 */

/** @type {WeakMap<HTMLElement, CodeMemory>} */
const MEMORY = new WeakMap();
/** The tool rows whose segmented control is attached. @type {WeakSet<HTMLElement>} */
const SEGMENTED_ON = new WeakSet();
let serial = 0;

/** @param {Document} doc @param {string} className @param {string} [tag] */
const make = (doc, className, tag = 'span') => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
};

/**
 * The JSON of `text` laid out with two-space indents, or null when it does
 * not parse.
 * @param {string} text
 */
export function prettyJson(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return null;
    }
}

/**
 * One line of JSON as nodes: keys in `.kp-code__key`, the punctuation in
 * `.kp-code__punct`, the rest as text. A JSON string never holds a raw
 * line break, so a line is always whole.
 * @param {Document} doc @param {string} line
 */
function jsonLine(doc, line) {
    /** @type {Node[]} */
    const out = [];
    const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])/g;
    let last = 0;
    for (const match of line.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at > last) out.push(doc.createTextNode(line.slice(last, at)));
        if (match[1] !== undefined && match[2] !== undefined) {
            const key = make(doc, 'kp-code__key');
            key.textContent = match[1];
            // The colon is plain text of the line: next to the key's own element it would sit 0 px from it.
            out.push(key, doc.createTextNode(match[2]));
        } else if (match[1] !== undefined) out.push(doc.createTextNode(match[1]));
        else {
            const punct = make(doc, 'kp-code__punct');
            punct.textContent = match[3];
            out.push(punct);
        }
        last = at + match[0].length;
    }
    if (last < line.length) out.push(doc.createTextNode(line.slice(last)));
    return out;
}

/** @param {string | undefined} language */
const isJson = (language) => (language ?? '').trim().toLowerCase() === 'json';

/**
 * `auto` (and no language in a cell) is JSON only when the text is an object or a list that parses.
 * @param {CodeSpec} spec
 * @returns {CodeSpec}
 */
function withLanguage(spec) {
    const asked = (spec.language ?? '').trim().toLowerCase();
    if (asked !== 'auto' && !(asked === '' && spec.cell)) return spec;
    const text = (spec.text ?? '').trim();
    let json = false;
    if (text.startsWith('{') || text.startsWith('[')) json = prettyJson(text) !== null;
    return { ...spec, language: json ? 'JSON' : '' };
}

/**
 * Draw (or redraw) a code block. The reader's Wrap, layout and fold are kept
 * across calls unless the spec names them again.
 * @param {HTMLElement} el the root, a `.kp-code`
 * @param {CodeSpec} given
 */
export function setCode(el, given) {
    const cell = Boolean(given.cell) || el.classList.contains('kp-code--cell');
    const spec = withLanguage({ ...given, cell, maxLines: given.maxLines ?? (cell ? 3 : undefined) });
    const known = MEMORY.get(el);
    /** @type {CodeMemory} */
    const memory = known ?? {
        spec,
        wrap: Boolean(spec.wrap ?? cell),
        layout: spec.layout ?? 'pretty',
        folded: true,
        shown: '',
        lines: 0,
        card: null,
        drawn: false,
        pending: null,
        head: null,
        revert: 0,
        cell,
    };
    if (known) {
        if (spec.wrap !== undefined) memory.wrap = spec.wrap;
        if (spec.layout !== undefined) memory.layout = spec.layout;
    }
    memory.spec = spec;
    MEMORY.set(el, memory);
    el.classList.add('kp-code');
    el.classList.toggle('kp-code--cell', cell);
    el.setAttribute('data-kp-code', '');
    const state = spec.state ?? 'ready';
    if (state === 'loading') {
        memory.pending = null;
        drawHead(el, memory);
        drawLoading(el, memory);
        return;
    }
    if (memory.card) {
        const card = memory.card;
        memory.card = null;
        memory.pending = spec;
        void card.close().then(() => {
            if (memory.pending !== spec) return;
            memory.pending = null;
            drawHead(el, memory);
            drawBody(el, memory);
        });
        return;
    }
    drawHead(el, memory);
    drawBody(el, memory);
}

/** @param {HTMLElement} el @param {CodeMemory} memory */
function drawHead(el, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const spec = memory.spec;
    const state = spec.state ?? 'ready';
    const ready = state === 'ready' && (spec.text ?? '') !== '';
    const pretty = isJson(spec.language) && ready ? prettyJson(spec.text ?? '') : null;
    let head = memory.head;
    if (!head || head.parentElement !== el) {
        head = make(doc, 'kp-code__head', 'figcaption');
        const heading = make(doc, 'kp-code__heading');
        const tools = make(doc, 'kp-code__tools', 'div');
        const status = make(doc, 'kp-sr-only');
        status.setAttribute('role', 'status');
        head.append(heading, tools, status);
        el.prepend(head);
        memory.head = head;
        wire(el, memory);
    }
    const heading = /** @type {HTMLElement} */ (head.querySelector('.kp-code__heading'));
    const title = make(doc, 'kp-code__title');
    title.textContent = spec.title ?? spec.language ?? strings.codeLabel;
    const meta = make(doc, 'kp-code__meta');
    const lineCount = ready ? (memory.layout === 'pretty' && pretty !== null ? pretty : (spec.text ?? '')).split('\n').length : 0;
    meta.textContent = [spec.title ? spec.language : '', ready ? strings.codeLines(lineCount) : '', spec.size ?? ''].filter(Boolean).join(' · ');
    heading.replaceChildren(title, meta);

    const tools = /** @type {HTMLElement} */ (head.querySelector('.kp-code__tools'));
    /** @type {HTMLElement[]} */
    const wanted = [];
    if (isJson(spec.language)) {
        let group = /** @type {HTMLElement | null} */ (tools.querySelector('.kp-segmented'));
        if (!group) {
            group = make(doc, 'kp-segmented', 'div');
            group.setAttribute('data-kp-segmented', 'single');
            group.setAttribute('role', 'radiogroup');
            for (const value of /** @type {const} */ (['pretty', 'raw'])) {
                const item = make(doc, 'kp-segmented__item', 'button');
                item.setAttribute('type', 'button');
                item.setAttribute('role', 'radio');
                item.dataset.value = value;
                const label = make(doc, 'kp-segmented__label');
                item.append(label);
                group.append(item);
            }
        }
        group.setAttribute('aria-label', strings.codeFormat);
        for (const item of /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('.kp-segmented__item'))) {
            const value = item.dataset.value;
            /** @type {HTMLElement} */ (item.firstElementChild).textContent = value === 'pretty' ? strings.codePretty : strings.codeRaw;
            item.setAttribute('aria-checked', String(value === memory.layout));
        }
        if (pretty === null) group.setAttribute('aria-disabled', 'true');
        else group.removeAttribute('aria-disabled');
        wanted.push(group);
    }
    let wrap = /** @type {HTMLButtonElement | null} */ (tools.querySelector('[data-kp-code-tool="wrap"]'));
    if (memory.cell) wrap = null;
    else if (!wrap) {
        wrap = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button', 'button'));
        wrap.type = 'button';
        wrap.dataset.kpCodeTool = 'wrap';
    }
    if (wrap) {
        wrap.textContent = strings.codeWrap;
        wrap.setAttribute('aria-pressed', String(memory.wrap));
        wrap.disabled = !ready;
        wanted.push(wrap);
    }
    if (spec.copy !== false) {
        let copy = /** @type {HTMLButtonElement | null} */ (tools.querySelector('[data-kp-code-tool="copy"]'));
        if (!copy) {
            copy = /** @type {HTMLButtonElement} */ (make(doc, memory.cell ? 'kp-button kp-button--sm kp-button--ghost' : 'kp-button', 'button'));
            copy.type = 'button';
            copy.dataset.kpCodeTool = 'copy';
            const word = make(doc, 'kp-code__word');
            copy.append(word);
        }
        const word = /** @type {HTMLElement} */ (copy.firstElementChild);
        word.setAttribute('data-kp-code-words', [strings.copy, strings.copied, strings.copyBlocked].join('\n'));
        if (!copy.hasAttribute('data-kp-code-copied')) word.textContent = strings.copy;
        copy.disabled = !ready;
        wanted.push(copy);
    }
    for (const child of [...tools.children]) if (!wanted.includes(/** @type {HTMLElement} */ (child))) child.remove();
    tools.append(...wanted);
    if (isJson(spec.language) && !SEGMENTED_ON.has(tools)) {
        SEGMENTED_ON.add(tools);
        attachSegmented(tools);
    }
    el.toggleAttribute('data-kp-code-wrap', memory.wrap);
}

/** @param {HTMLElement} el @param {CodeMemory} memory */
function drawLoading(el, memory) {
    const doc = el.ownerDocument;
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('data-kp-state', 'loading');
    if (memory.cell) {
        // A cell waits as a skeleton line: the table around it lays the busy card.
        for (const node of [...el.children]) if (node !== memory.head) node.remove();
        el.removeAttribute('data-kp-code-folded');
        const line = make(doc, 'kp-code__skeleton');
        const bar = make(doc, 'kp-skeleton');
        bar.setAttribute('aria-hidden', 'true');
        line.append(bar);
        el.append(line);
        return;
    }
    const was = el.querySelector(':scope > :is(.kp-code__body, .kp-code__note)')?.getBoundingClientRect().height ?? 0;
    let body = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-code__body'));
    for (const node of [...el.children]) if (node !== memory.head && node !== body && node !== memory.card?.layer) node.remove();
    if (!body) {
        body = make(doc, 'kp-code__body', 'pre');
        el.append(body);
    }
    const lines = Math.max(3, Math.min(memory.lines || 3, memory.spec.maxLines || 8));
    body.style.setProperty('--kp-code-min-lines', String(lines));
    body.style.minBlockSize = was > 0 ? `${was}px` : '';
    body.replaceChildren(make(doc, '', 'code'));
    body.removeAttribute('tabindex');
    if (memory.card) {
        memory.card.place();
        return;
    }
    const target = body;
    memory.card = openBusyCard(el, {
        words: memory.spec.loadingWords ?? getStrings().codeLoading,
        area: () => [target],
        className: 'kp-code__busy',
        arrive: memory.drawn,
    });
    memory.drawn = true;
}

/**
 * The lines past the fold are out of sight, so they are out of the layout of what can be seen: `data-kp-code-beyond`
 * hides them while the block is folded.
 * @param {HTMLElement} el @param {CodeMemory} memory
 */
function markBeyond(el, memory) {
    const max = memory.spec.maxLines ?? 0;
    el.querySelectorAll('.kp-code__line').forEach((line, i) =>
        line.toggleAttribute('data-kp-code-beyond', memory.cell && max > 0 && memory.folded && i >= max),
    );
}

/** @param {HTMLElement} el @param {CodeMemory} memory */
function drawBody(el, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const spec = memory.spec;
    const state = spec.state ?? 'ready';
    const text = spec.text ?? '';
    el.removeAttribute('aria-busy');
    memory.drawn = true;
    // The height the body had, so a sentence in its place keeps it (nothing under the block moves).
    const was = el.querySelector(':scope > :is(.kp-code__body, .kp-code__note)')?.getBoundingClientRect().height ?? 0;
    for (const node of [...el.children]) if (node !== memory.head) node.remove();

    if (state !== 'ready' || text === '') {
        const kind = state === 'ready' ? 'empty' : state;
        el.setAttribute('data-kp-state', kind);
        el.removeAttribute('data-kp-code-folded');
        const note = make(doc, memory.cell ? 'kp-code__note kp-code__note--line' : 'kp-code__note', 'p');
        note.setAttribute('role', 'status');
        if (was > 0 && !memory.cell) note.style.minBlockSize = `${was}px`;
        note.textContent = memory.cell
            ? (spec.message ??
              (kind === 'binary' ? strings.payloadBinary(spec.size ?? '') : kind === 'error' ? strings.codeError : strings.payloadEmpty))
            : (spec.message ?? (kind === 'binary' ? strings.codeBinary(spec.size ?? '') : kind === 'error' ? strings.codeError : strings.codeEmpty));
        if (memory.cell && kind === 'binary' && spec.downloadUrl) {
            const link = /** @type {HTMLAnchorElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'a'));
            link.href = spec.downloadUrl;
            link.setAttribute('download', '');
            link.textContent = strings.payloadDownload;
            note.append(' ', link);
        }
        el.append(note);
        memory.shown = '';
        return;
    }

    el.setAttribute('data-kp-state', 'ready');
    const json = isJson(spec.language);
    const pretty = json ? prettyJson(text) : null;
    const shown = json && memory.layout === 'pretty' && pretty !== null ? pretty : text;
    memory.shown = shown;
    const lines = shown.split('\n');
    memory.lines = lines.length;
    const body = make(doc, 'kp-code__body', 'pre');
    body.id ||= `kp-code-${(serial += 1)}`;
    body.setAttribute('tabindex', '0');
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', spec.title ?? spec.language ?? strings.codeLabel);
    const code = make(doc, '', 'code');
    for (const line of lines) {
        const row = make(doc, 'kp-code__line');
        const words = make(doc, 'kp-code__text');
        if (line === '') words.textContent = ' ';
        else if (json) words.append(...jsonLine(doc, line));
        else words.textContent = line;
        row.append(words);
        code.append(row);
    }
    body.append(code);
    el.toggleAttribute('data-kp-code-lines', Boolean(spec.lines));
    el.style.setProperty('--kp-code-gutter', String(String(lines.length).length));
    const max = spec.maxLines ?? 0;
    const foldable = max > 0 && lines.length > max;
    el.toggleAttribute('data-kp-code-folded', foldable && memory.folded);
    if (foldable) el.style.setProperty('--kp-code-max-lines', String(max));
    el.append(body);
    markBeyond(el, memory);

    const foot = make(doc, 'kp-code__foot', 'div');
    if (spec.truncated) {
        const note = make(doc, 'kp-code__truncated');
        note.textContent = strings.codeTruncated(spec.truncated.shown, spec.truncated.total);
        foot.append(note);
    }
    if (foldable) {
        const more = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-button--sm kp-button--ghost', 'button'));
        more.type = 'button';
        more.dataset.kpCodeTool = 'fold';
        more.setAttribute('aria-controls', body.id);
        more.setAttribute('aria-expanded', String(!memory.folded));
        const word = make(doc, 'kp-code__word');
        const showAll = memory.cell ? strings.payloadShowAll(lines.length) : strings.codeShowAll(lines.length);
        const dialogue = memory.cell && spec.open === 'dialog';
        if (dialogue) more.dataset.kpCodeOpen = 'dialog';
        word.setAttribute('data-kp-code-words', [showAll, strings.codeShowLess].join('\n'));
        word.textContent = memory.folded || dialogue ? (dialogue ? strings.payloadOpen : showAll) : strings.codeShowLess;
        if (dialogue) word.setAttribute('data-kp-code-words', strings.payloadOpen);
        more.append(word);
        if (!spec.truncated) foot.append(make(doc, ''));
        foot.append(more);
    }
    foot.hidden = !spec.truncated && !foldable;
    el.append(foot);
}

/**
 * The whole payload in a dialog, for a cell that holds a very long body.
 * @param {HTMLElement} el @param {CodeMemory} memory
 */
function openInDialog(el, memory) {
    const doc = el.ownerDocument;
    const strings = getStrings();
    const dialog = /** @type {HTMLDialogElement} */ (make(doc, 'kp-dialog kp-code__dialog', 'dialog'));
    dialog.setAttribute('aria-label', memory.spec.title ?? memory.spec.language ?? strings.codeLabel);
    const close = make(doc, 'kp-icon-button kp-dialog__close', 'button');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', strings.close);
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    const body = make(doc, 'kp-dialog__body', 'div');
    const full = make(doc, 'kp-code', 'figure');
    body.append(full);
    dialog.append(close, body);
    dialog.addEventListener('close', () => dialog.remove());
    doc.body.append(dialog);
    setCode(full, { ...memory.spec, cell: false, maxLines: 0, lines: true, wrap: true, open: undefined });
    dialog.showModal();
    el.dispatchEvent(new CustomEvent('kp-code-open', { bubbles: true, detail: { dialog } }));
}

/** The head's buttons, wired once per block. @param {HTMLElement} el @param {CodeMemory} memory */
function wire(el, memory) {
    el.addEventListener('kp-segmented-change', (event) => {
        const detail = /** @type {CustomEvent<{ value: string | null }>} */ (event).detail;
        const layout = detail?.value === 'raw' ? 'raw' : 'pretty';
        if (layout === memory.layout) return;
        memory.layout = layout;
        drawHead(el, memory);
        drawBody(el, memory);
        el.dispatchEvent(new CustomEvent('kp-code-layout', { bubbles: true, detail: { layout } }));
    });
    el.addEventListener('click', async (event) => {
        const button = event.target instanceof Element ? /** @type {HTMLButtonElement | null} */ (event.target.closest('[data-kp-code-tool]')) : null;
        if (!button || button.disabled) return;
        const tool = button.dataset.kpCodeTool;
        const strings = getStrings();
        if (tool === 'wrap') {
            memory.wrap = !memory.wrap;
            button.setAttribute('aria-pressed', String(memory.wrap));
            el.toggleAttribute('data-kp-code-wrap', memory.wrap);
            el.dispatchEvent(new CustomEvent('kp-code-wrap', { bubbles: true, detail: { wrap: memory.wrap } }));
        } else if (tool === 'fold' && button.dataset.kpCodeOpen === 'dialog') {
            openInDialog(el, memory);
        } else if (tool === 'fold') {
            memory.folded = !memory.folded;
            el.toggleAttribute('data-kp-code-folded', memory.folded);
            button.setAttribute('aria-expanded', String(!memory.folded));
            markBeyond(el, memory);
            /** @type {HTMLElement} */ (button.firstElementChild).textContent = memory.folded
                ? strings.codeShowAll(memory.lines)
                : strings.codeShowLess;
            el.dispatchEvent(new CustomEvent('kp-code-fold', { bubbles: true, detail: { folded: memory.folded } }));
        } else if (tool === 'copy') {
            const word = /** @type {HTMLElement} */ (button.firstElementChild);
            const status = /** @type {HTMLElement | null} */ (memory.head?.querySelector('[role="status"]') ?? null);
            const view = el.ownerDocument.defaultView;
            view?.clearTimeout(memory.revert);
            try {
                await navigator.clipboard.writeText(memory.shown);
                word.textContent = strings.copied;
                button.setAttribute('data-kp-code-copied', '');
                if (status) status.textContent = strings.codeCopiedAnnouncement(memory.spec.title ?? memory.spec.language ?? strings.codeLabel);
                el.dispatchEvent(new CustomEvent('kp-code-copy', { bubbles: true, detail: { text: memory.shown } }));
            } catch (error) {
                word.textContent = strings.copyBlocked;
                button.setAttribute('data-kp-code-copied', '');
                if (status) status.textContent = strings.copyBlockedAnnouncement;
                el.dispatchEvent(new CustomEvent('kp-code-copy-failed', { bubbles: true, detail: { error } }));
            }
            memory.revert =
                view?.setTimeout(() => {
                    word.textContent = getStrings().copy;
                    button.removeAttribute('data-kp-code-copied');
                    if (status) status.textContent = '';
                }, CODE_COPIED_MS) ?? 0;
        }
    });
}

/**
 * Fill every `[data-kp-code]` under `root` from its markup: the text of its
 * `code` (or `pre`), and `data-kp-code-title`, `-language`, `-size`,
 * `-lines`, `-wrap`, `-max`, `-layout`, `-state`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachCodes(root = document) {
    const all = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(CODE) ? [root] : []), ...root.querySelectorAll(CODE)]);
    for (const el of all) {
        if (MEMORY.has(el)) continue;
        const source = el.querySelector('code') ?? el.querySelector('pre');
        const read = (/** @type {string} */ name) => el.getAttribute(`data-kp-code-${name}`) ?? undefined;
        const cell = el.classList.contains('kp-code--cell');
        const state = /** @type {CodeSpec['state']} */ (read('state'));
        const layout = read('layout');
        // Bytes as the page counted them: the size and the foot line are written in the locale's words.
        const binaryBytes = Number(el.getAttribute('data-kp-binary-size'));
        const cut = (el.getAttribute('data-kp-truncated') ?? '').split('/').map((n) => Number(n));
        const open = read('open');
        setCode(el, {
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
            truncated:
                cut.length === 2 && cut.every((n) => Number.isFinite(n) && n > 0)
                    ? { shown: formatBytes(cut[0]), total: formatBytes(cut[1]) }
                    : undefined,
        });
    }
    return () => {};
}
