// Opening a document in the viewer: the viewer shell first, then one PreviewRun that loads into it.

import { attachOne } from '../controller.js';
import { getStrings } from '../strings.js';
import { openViewer } from '../viewer.js';
import { DEFAULT_ACTIONS } from './values.js';
import { plainFileName } from './kinds.js';
import { previewKeys } from './keys.js';
import { PreviewRun } from './run.js';

/**
 * Open a document in the viewer.
 * @param {import('../docpreview.js').PreviewOptions} options
 * @returns {import('../viewer.js').ViewerHandle}
 */
export function openDocPreview(options) {
    const doc = options.doc ?? document;
    const group = options.group && options.group.length > 1 ? [...options.group] : null;
    const at = Math.max(0, Math.min(options.index ?? 0, (group?.length ?? 1) - 1));
    const first = group ? group[at] : { url: options.url, title: options.title, name: options.name };
    /** @type {PreviewRun | undefined} */
    let run;
    const viewer = openViewer({
        title: first.title ?? options.title ?? plainFileName(first.url),
        size: options.size ?? 'wide',
        actions: (options.actions ?? DEFAULT_ACTIONS).map((kind) => ({ kind, href: first.url, name: first.name ?? plainFileName(first.url) })),
        className: 'kp-docpreview',
        ...(options.opener !== undefined ? { opener: options.opener } : {}),
        doc,
        keys: previewKeys(getStrings(), group !== null, () => run),
        onClose: () => run?.closed(),
    });
    run = attachOne(viewer.dialog, PreviewRun, { preview: options, viewer, group });
    if (!run) throw new Error('The document preview could not be set up; the cause was reported.');
    return viewer;
}
