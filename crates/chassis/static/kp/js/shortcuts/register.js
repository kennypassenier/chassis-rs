// Registering shortcuts under a scope: the faults a registration can have, and the unregister it hands back.

import { getStrings } from '../strings.js';
import { ALTGR_KEYS, RESERVED } from './constants.js';
import { normal, parseShortcutKeys } from './keys.js';

/** @typedef {import('../shortcuts.js').Entry} Entry */
/** @typedef {import('../shortcuts.js').Shortcut} Shortcut */
/** @typedef {import('../shortcuts.js').EngineOptions} EngineOptions */
/** @typedef {import('../shortcuts.js').Step} Step */
/** @typedef {import('./board.js').ShortcutBoard} ShortcutBoard */

/**
 * What to say about a key that needs AltGr.
 * @param {Step[]} steps
 * @returns {string | null}
 */
function altGrProblem(steps) {
    const bad = steps.find((s) => ALTGR_KEYS.includes(s.key));
    if (!bad) return null;
    const suggestion =
        bad.key === '[' || bad.key === ']'
            ? 'Shift ArrowLeft / Shift ArrowRight, or a digit'
            : 'a letter, a digit, an arrow key or a chord such as "g s"';
    return getStrings().shortcutsAltGr(bad.key, suggestion);
}

/**
 * Register a list of shortcuts under a scope.
 *
 * @param {ShortcutBoard} board
 * @param {string | Element} scope a name (the page's keys) or an element (keys that live while it is on screen)
 * @param {readonly Shortcut[]} list
 * @param {EngineOptions} [options] overrides the page's defaults for this list
 * @returns {() => void} unregister
 */
export function registerOn(board, scope, list, options = {}) {
    const guard = options.layoutGuard ?? board.config.layoutGuard;
    /** @type {Entry[]} */
    const added = [];
    const fault = (/** @type {string} */ message) => {
        if ((options.dev ?? board.inDevelopment()) === true) {
            for (const entry of added) board.entries.delete(entry);
            throw new Error(message);
        }
        console.error(`[kp-shortcuts] ${message}`);
    };
    for (const shortcut of list) {
        const entry = entryFor(board, scope, shortcut, guard, options, added, fault);
        if (!entry) continue;
        added.push(entry);
        board.entries.add(entry);
    }
    board.listen();
    board.queueSheets();
    return () => {
        for (const entry of added) board.entries.delete(entry);
        added.length = 0;
        board.unlisten();
        board.queueSheets();
    };
}

/**
 * The entry of one shortcut, or undefined when it is refused (reported through `fault`).
 * @param {ShortcutBoard} board @param {string | Element} scope @param {Shortcut} shortcut @param {string} guard
 * @param {EngineOptions} options @param {Entry[]} added @param {(message: string) => void} fault
 * @returns {Entry | undefined}
 */
function entryFor(board, scope, shortcut, guard, options, added, fault) {
    const steps = parseShortcutKeys(shortcut.keys);
    const id = normal(steps);
    if (RESERVED.includes(id)) return void fault(`The keys "${shortcut.keys}" belong to the palette and the shortcut sheet.`);
    const problem = guard === 'off' ? null : altGrProblem(steps);
    if (problem) {
        if (guard === 'refuse') return void fault(problem);
        (options.onWarn ?? ((/** @type {string} */ message) => board.warn(message)))(problem);
    }
    const clash = [...board.entries, ...added].find(
        (other) => other.scope === scope && (other.normal === id || other.normal.startsWith(`${id} `) || id.startsWith(`${other.normal} `)),
    );
    if (clash) return void fault(`The keys "${shortcut.keys}" (${shortcut.what}) clash with "${clash.shortcut.keys}" (${clash.shortcut.what}) in the same scope.`);
    return { shortcut, steps, normal: id, scope, order: board.order++ };
}
