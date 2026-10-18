// The viewer shell: one thing opened large in a modal dialog [kpadopt6-media].
//
// A picture of a gallery (js/gallery.js) and a document of a dossier (js/docpreview.js) open in the same shell: a modal
// `<dialog class="kp-dialog kp-viewer">` (the pattern js/code.js already uses for its full view) with a title, a close button, the
// file's facts, a stage for the content and a foot with "Open in a new tab" and Download. One focus trap (the native modal one),
// one Escape, one place for the states of a stage, so a gallery and a document fail, wait and say "this browser cannot show it"
// the same way.
//
//   const viewer = openViewer({ title: 'CV Developer NL', facts: 'PDF · 213 kB · 14/10/2026 09:12', size: 'wide',
//                               actions: [{ kind: 'open', href: url }, { kind: 'download', href: url, name: 'cv.pdf' }] });
//   viewer.stage.append(frame);          // or viewer.setContent(frame)
//   viewer.setState('loading');          // the theme's busy card over the whole stage
//   viewer.setState('error', { message: 'The server says it is gone.', retry: () => load() });
//   viewer.setState('unsupported', { message: 'This browser cannot show PDFs here.' });
//   viewer.setState('ready');
//
// The foot always stays, whatever the stage does (KT6): a file that cannot be shown can still be opened or saved. A phone gets the
// whole screen. Escape and the close button close it, the focus goes back to what opened it (the native modal does that), and a click
// on the dim behind closes it. Fires `kp-viewer-close` on the dialog's opener side as `{ dialog }` on the document. Nothing runs on import.

import { getStrings } from './strings.js';
import { statePlate } from './state-plate.js';
import { openBusyCard } from './busy-card.js';
import { registerShortcuts } from './shortcuts.js';
import { attachDisabledReasons } from './reason.js';
import { runFlashButton } from './flash.js';

/** The shell. */
export const VIEWER = '.kp-viewer';
/** Fired on the document, bubbling, when a viewer closed: `{ dialog }`. */
export const VIEWER_CLOSE_EVENT = 'kp-viewer-close';
/** The states a stage can be in. */
export const VIEWER_STATES = /** @type {const} */ (['ready', 'loading', 'error', 'unsupported']);

/**
 * @typedef {object} ViewerAction
 * @property {'open' | 'download' | 'print' | 'copy-link' | string} kind
 * @property {string} [href] the file's address (open, download, copy-link)
 * @property {string} [name] the file name a download is saved as
 * @property {() => void} [run] what a print or a custom action does
 * @property {string} [label] the button's words (default: the dictionary's for the kind)
 * @property {'destructive' | 'default'} [tone] a custom action's look
 */

/**
 * @typedef {object} ViewerOptions
 * @property {string} title
 * @property {string} [desc] one line under the title: how it is shown
 * @property {string} [facts] kind, size and date in one line
 * @property {'wide' | 'full'} [size] about 70 % of the window and 90 % high, or all of it (default wide)
 * @property {readonly ViewerAction[]} [actions]
 * @property {string} [className] more classes on the dialog
 * @property {Element | null} [opener] where the focus goes back to when the native return finds nothing
 * @property {() => void} [onClose]
 * @property {readonly import('./shortcuts.js').Shortcut[]} [keys] shortcuts that live while the viewer is open
 * @property {Document} [doc]
 */

/**
 * @typedef {object} ViewerHandle
 * @property {HTMLDialogElement} dialog
 * @property {HTMLElement} stage the box the content stands in
 * @property {HTMLElement} content the content slot inside the stage
 * @property {HTMLElement} foot the foot with the actions
 * @property {(text: string) => void} setTitle
 * @property {(text: string) => void} setDesc
 * @property {(text: string) => void} setFacts
 * @property {(position: { index: number, total: number } | null) => void} setPosition "4 of 37", exact, announced politely
 * @property {(actions: readonly ViewerAction[]) => void} setActions
 * @property {(...nodes: Node[]) => void} setContent
 * @property {(state: 'ready' | 'loading' | 'error' | 'unsupported', detail?: { message?: string, retry?: () => void, title?: string }) => void} setState
 * @property {() => string} state
 * @property {() => void} close
 */

let serial = 0;

/** @param {Document} doc @param {string} tag @param {string} cls */
const make = (doc, tag, cls) => {
    const node = doc.createElement(tag);
    node.className = cls;
    return node;
};

/**
 * Open a viewer.
 * @param {ViewerOptions} options
 * @returns {ViewerHandle}
 */
export function openViewer(options) {
    const doc = options.doc ?? document;
    const strings = getStrings();
    const id = `kp-viewer-${++serial}`;
    const dialog = /** @type {HTMLDialogElement} */ (make(doc, 'dialog', `kp-dialog kp-viewer${options.className ? ` ${options.className}` : ''}`));
    dialog.setAttribute('data-kp-viewer', '');
    dialog.setAttribute('data-kp-viewer-size', options.size ?? 'wide');
    dialog.setAttribute('aria-labelledby', `${id}-title`);

    const head = make(doc, 'header', 'kp-viewer__head');
    const titles = make(doc, 'div', 'kp-viewer__titles');
    const title = make(doc, 'h2', 'kp-viewer__title');
    title.id = `${id}-title`;
    const desc = make(doc, 'p', 'kp-viewer__desc');
    const facts = make(doc, 'p', 'kp-viewer__facts');
    titles.append(title, desc, facts);
    const position = make(doc, 'p', 'kp-viewer__position');
    position.setAttribute('role', 'status');
    position.hidden = true;
    const close = /** @type {HTMLButtonElement} */ (make(doc, 'button', 'kp-icon-button kp-viewer__close'));
    close.type = 'button';
    close.setAttribute('aria-label', strings.close);
    close.textContent = '×';
    head.append(titles, position, close);

    const stage = make(doc, 'div', 'kp-viewer__stage');
    stage.setAttribute('data-kp-state', 'ready');
    const content = make(doc, 'div', 'kp-viewer__content');
    const plate = make(doc, 'div', 'kp-viewer__plate');
    plate.hidden = true;
    stage.append(content, plate);

    const foot = make(doc, 'footer', 'kp-viewer__foot');
    dialog.append(head, stage, foot);
    doc.body.append(dialog);

    /** @type {import('./busy-card.js').BusyCard | null} */
    let card = null;
    let current = 'ready';

    /** @param {HTMLElement} node @param {string} text */
    const setText = (node, text) => {
        node.textContent = text;
        node.hidden = text === '';
    };
    setText(title, options.title);
    setText(desc, options.desc ?? '');
    setText(facts, options.facts ?? '');

    /** @param {readonly ViewerAction[]} actions */
    const drawActions = (actions) => {
        foot.replaceChildren();
        for (const action of actions) {
            const label =
                action.label ??
                {
                    open: strings.viewerOpenNew,
                    download: strings.viewerDownload,
                    print: strings.viewerPrint,
                    'copy-link': strings.viewerCopyLink,
                }[/** @type {'open'} */ (action.kind)] ??
                action.kind;
            if (action.kind === 'open' || action.kind === 'download') {
                const link = /** @type {HTMLAnchorElement} */ (make(doc, 'a', `kp-button kp-viewer__action kp-viewer__action--${action.kind}`));
                link.href = action.href ?? '#';
                if (action.kind === 'open') {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                } else link.setAttribute('download', action.name ?? '');
                link.setAttribute('data-kp-viewer-action', action.kind);
                link.textContent = label;
                if (!action.href) {
                    link.setAttribute('aria-disabled', 'true');
                    link.setAttribute('data-kp-disabled-reason', strings.viewerNoFile);
                    link.removeAttribute('href');
                }
                foot.append(link);
            } else {
                const button = /** @type {HTMLButtonElement} */ (
                    make(doc, 'button', `kp-button${action.tone === 'destructive' ? ' kp-button--destructive' : ''} kp-viewer__action kp-viewer__action--${action.kind}`)
                );
                button.type = 'button';
                button.setAttribute('data-kp-viewer-action', action.kind);
                button.textContent = label;
                if (action.kind === 'copy-link') {
                    button.setAttribute('data-kp-flash-words', strings.copied);
                    button.addEventListener('click', () =>
                        runFlashButton(button, async () => {
                            const text = new URL(action.href ?? '', doc.baseURI).href;
                            await navigator.clipboard.writeText(text);
                            action.run?.();
                            return strings.copied;
                        }),
                    );
                } else if (action.run) button.addEventListener('click', () => action.run?.());
                foot.append(button);
            }
        }
        foot.hidden = actions.length === 0;
    };
    drawActions(options.actions ?? []);

    /** @type {ViewerHandle['setState']} */
    const setState = (next, detail = {}) => {
        current = next;
        stage.setAttribute('data-kp-state', next);
        stage.toggleAttribute('aria-busy', next === 'loading');
        plate.replaceChildren();
        plate.hidden = next !== 'error' && next !== 'unsupported';
        if (next === 'loading') {
            if (!card) card = openBusyCard(stage, { words: strings.viewerLoading, area: () => [stage], className: 'kp-viewer__busy', arrive: false });
        } else if (card) {
            const closing = card;
            card = null;
            void closing.close();
        }
        if (next === 'error' || next === 'unsupported') {
            const shown = statePlate(doc, {
                kind: next === 'error' ? 'error' : 'empty',
                title: detail.title ?? (next === 'error' ? strings.viewerFailedTitle : strings.viewerUnsupportedTitle),
                text: detail.message ?? (next === 'error' ? strings.viewerFailedText : strings.viewerUnsupportedText),
                ...(next === 'error' && detail.retry ? { actionLabel: strings.viewerRetry, onAction: detail.retry } : {}),
            });
            if (next === 'unsupported') {
                // The two ways out stand in the plate itself, at normal size, as well as in the foot.
                const row = make(doc, 'div', 'kp-viewer__plate-actions');
                for (const action of options.actions ?? []) {
                    if (action.kind !== 'open' && action.kind !== 'download') continue;
                    const link = /** @type {HTMLAnchorElement} */ (make(doc, 'a', 'kp-button kp-stateplate__action'));
                    link.href = action.href ?? '#';
                    if (action.kind === 'open') {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    } else link.setAttribute('download', action.name ?? '');
                    link.textContent = action.label ?? (action.kind === 'open' ? strings.viewerOpenNew : strings.viewerDownload);
                    row.append(link);
                }
                shown.append(row);
            }
            plate.append(shown);
        }
    };

    // Keys that live while it is open.
    /** @type {(() => void) | null} */
    let unregister = null;
    if (options.keys && options.keys.length > 0) unregister = registerShortcuts(dialog, options.keys, { dev: false });
    const detachReasons = attachDisabledReasons(dialog);

    let closed = false;
    const finish = () => {
        if (closed) return;
        closed = true;
        unregister?.();
        detachReasons();
        card?.remove();
        card = null;
        dialog.remove();
        options.onClose?.();
        doc.dispatchEvent(new CustomEvent(VIEWER_CLOSE_EVENT, { bubbles: true, detail: { dialog } }));
        const opener = options.opener;
        if (opener instanceof HTMLElement && opener.isConnected && doc.activeElement !== opener && (doc.activeElement === doc.body || doc.activeElement === null)) {
            opener.focus({ preventScroll: true });
        }
    };
    dialog.addEventListener('close', finish);
    close.addEventListener('click', () => dialog.close());
    // A click on the dim behind (the dialog itself, not a child) closes.
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });

    dialog.showModal();
    // Back at the top, as every dialog opens.
    stage.scrollTop = 0;

    return {
        dialog,
        stage,
        content,
        foot,
        setTitle: (text) => setText(title, text),
        setDesc: (text) => setText(desc, text),
        setFacts: (text) => setText(facts, text),
        setPosition(at) {
            if (!at) {
                position.hidden = true;
                position.textContent = '';
                return;
            }
            position.hidden = false;
            position.textContent = strings.viewerPosition(at.index, at.total);
        },
        setActions: drawActions,
        setContent(...nodes) {
            content.replaceChildren(...nodes);
        },
        setState,
        state: () => current,
        close: () => dialog.close(),
    };
}
