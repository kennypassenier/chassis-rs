// What a menu remembers and reads: its state, ids, keys and signature.
import { menuState } from './state.js';
/** @typedef {import('./types.js').MenuGroup} MenuGroup */
/** @typedef {import('./types.js').MenuState} MenuState */

/** @type {WeakMap<Element, MenuState>} */
export const menus = new WeakMap();

/** @param {string} prefix */
export const nextId = (prefix) => `${prefix}-${(menuState.idSeq += 1)}`;

/** @param {Element} host @returns {string | undefined} */
export const keyOf = (host) => host.getAttribute('data-kp-key') ?? undefined;

/**
 * What a fill shows, as one string: a fill that shows the same as the menu
 * does now is skipped.
 * @param {MenuGroup[] | 'loading'} groups
 * @returns {string}
 */
export const menuSignature = (groups) =>
    groups === 'loading'
        ? 'loading'
        : JSON.stringify(
              groups.map((g) => [
                  g.group,
                  g.items.map((i) => [
                      i.label,
                      i.hint ?? '',
                      i.href ?? '',
                      i.download ?? '',
                      i.disabled ?? '',
                      !!i.danger,
                      i.attrs ?? null,
                      i.value ?? '',
                  ]),
              ]),
          );
