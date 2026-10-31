// Attaches the log viewers of a page: one LogViewerControl per viewer.
import { attachAll } from '../controller.js';
import { LOGVIEWER } from './constants.js';
import { LogViewerControl } from './controller.js';

/**
 * Give every `[data-kp-logviewer]` under `root` its bar, its buffer and its states.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachLogViewers(root = document) {
    return attachAll(root, LOGVIEWER, LogViewerControl);
}
