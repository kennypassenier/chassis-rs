// The elements of one viewer, built but not yet in the page: the dialog with its head, its stage and its foot.

import { make } from './make.js';

/**
 * @param {Document} doc
 * @param {string} id
 * @param {import('../viewer.js').ViewerOptions} options
 * @param {import('../strings.js').Strings} strings
 */
export function buildViewerParts(doc, id, options, strings) {
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
    return { dialog, title, desc, facts, position, close, stage, content, plate, foot };
}
