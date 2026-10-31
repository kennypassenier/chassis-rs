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

import { launchViewer } from './viewer/controller.js';

export { VIEWER, VIEWER_CLOSE_EVENT, VIEWER_STATES } from './viewer/values.js';

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

/**
 * Open a viewer.
 * @param {ViewerOptions} options
 * @returns {ViewerHandle}
 */
export function openViewer(options) {
    return launchViewer(options);
}
