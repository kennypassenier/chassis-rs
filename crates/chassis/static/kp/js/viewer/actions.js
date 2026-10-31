// The foot's actions: open in a new tab and download as links, print, copy link and the page's own as buttons.

import { runFlashButton } from '../flash.js';
import { make } from './make.js';

/** @typedef {import('../viewer.js').ViewerAction} ViewerAction */
/** @typedef {import('../strings.js').Strings} Strings */

/** The words of an action: its own, or the dictionary's for its kind. @param {ViewerAction} action @param {Strings} strings */
function labelOf(action, strings) {
    return (
        action.label ??
        {
            open: strings.viewerOpenNew,
            download: strings.viewerDownload,
            print: strings.viewerPrint,
            'copy-link': strings.viewerCopyLink,
        }[/** @type {'open'} */ (action.kind)] ??
        action.kind
    );
}

/** A link that opens the file in a new tab, or saves it. @param {Document} doc @param {ViewerAction} action @param {string} cls */
export function fileLink(doc, action, cls) {
    const link = /** @type {HTMLAnchorElement} */ (make(doc, 'a', cls));
    link.href = action.href ?? '#';
    if (action.kind === 'open') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    } else link.setAttribute('download', action.name ?? '');
    return link;
}

/** @param {Document} doc @param {ViewerAction} action @param {string} label @param {Strings} strings */
function openOrDownload(doc, action, label, strings) {
    const link = fileLink(doc, action, `kp-button kp-viewer__action kp-viewer__action--${action.kind}`);
    link.setAttribute('data-kp-viewer-action', action.kind);
    link.textContent = label;
    if (!action.href) {
        link.setAttribute('aria-disabled', 'true');
        link.setAttribute('data-kp-disabled-reason', strings.viewerNoFile);
        link.removeAttribute('href');
    }
    return link;
}

/** @param {Document} doc @param {ViewerAction} action @param {string} label @param {Strings} strings */
function actionButton(doc, action, label, strings) {
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
    return button;
}

/**
 * Draw the foot.
 * @param {Document} doc @param {HTMLElement} foot @param {readonly ViewerAction[]} actions @param {Strings} strings
 */
export function drawActions(doc, foot, actions, strings) {
    foot.replaceChildren();
    for (const action of actions) {
        const label = labelOf(action, strings);
        foot.append(action.kind === 'open' || action.kind === 'download' ? openOrDownload(doc, action, label, strings) : actionButton(doc, action, label, strings));
    }
    foot.hidden = actions.length === 0;
}
