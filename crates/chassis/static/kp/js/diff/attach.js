// Attaches the diffs of a page: one DiffControl per diff.
import { attachAll } from '../controller.js';
import { DIFF } from './constants.js';
import { DiffControl } from './controller.js';

/**
 * Wire every diff under `root`.
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachDiffs(root = document) {
    return attachAll(root, DIFF, DiffControl);
}
