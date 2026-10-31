// Attaches the consoles of a page: one ConsoleControl per console.
import { attachAll } from '../controller.js';
import { CONSOLE } from './constants.js';
import { ConsoleControl } from './controller.js';
/** @typedef {import('./types.js').ConsoleRun} ConsoleRun */

/**
 * Wire every console under `root`.
 * @param {ParentNode} [root]
 * @param {{ run?: ConsoleRun, complete?: (prefix: string) => string[] | Promise<string[]> }} [options]
 * @returns {() => void} detach
 */
export function attachConsoles(root = document, options = {}) {
    return attachAll(root, CONSOLE, ConsoleControl, options);
}
