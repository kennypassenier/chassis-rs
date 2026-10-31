// Attaches the sequencers of a page.
import { attachOne } from '../controller.js';
import { SEQUENCER } from './constants.js';
import { sequencers } from './instance.js';
import { SequencerControl } from './controller.js';
/** @typedef {import('./units.js').SequencerAttachOptions} SequencerAttachOptions */

/**
 * Attach every `[data-kp-sequencer]` under `root` (below it: the root itself is not one of them). Returns a detach.
 * @param {ParentNode} [root]
 * @param {SequencerAttachOptions} [options]
 * @returns {() => void}
 */
export function attachSequencers(root = document, options = {}) {
    // A sequencer in the registry is wired already, by this call's controller or an earlier one.
    const made = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(SEQUENCER)])
        .filter((el) => !sequencers.has(el))
        .map((el) => attachOne(el, SequencerControl, options));
    return () => {
        for (const control of made.splice(0)) control?.destroy();
    };
}
