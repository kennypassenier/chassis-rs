// attachCommands(): wire the command blocks under a root, the root itself included.

import { attachOne, controllerOf, hostsOf } from '../controller.js';
import { CommandBlock } from './block.js';
import { COMMAND } from './values.js';

/**
 * Wire every command block under `root` that is not wired yet and has a code element to lay out.
 * @param {ParentNode} root
 * @returns {() => void} detach
 */
export function wireCommands(root) {
    const made = hostsOf(root, COMMAND)
        .filter((el) => el.dataset.kpCommandReady === undefined && !controllerOf(el, CommandBlock))
        .filter((el) => el.querySelector(':scope > pre, :scope > .kp-command__code'))
        .map((el) => attachOne(el, CommandBlock))
        .filter((block) => block !== undefined);
    return () => {
        for (const block of made) block.destroy();
    };
}
