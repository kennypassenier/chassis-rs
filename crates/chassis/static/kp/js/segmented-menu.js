// A chip with its own menu, and the chip renamed in place [forms-1102].
//
// Medicine Cabinet's category pills each filter and each need a ⋯ menu (Rename, Delete); a menu cannot sit inside a chip's
// button, so the app laid pill and menu side by side by hand. A chip's menu now stands in the group right after its chip:
//
//   <div class="kp-segmented kp-segmented--chips" data-kp-segmented="single" aria-label="Category">
//     <button type="button" class="kp-segmented__item" data-value="all" data-kp-segmented-all>All</button>
//     <button type="button" class="kp-segmented__item" data-value="pain"><span class="kp-segmented__label">Pain</span><span class="kp-segmented__count">4</span></button>
//     <div class="kp-menu-button kp-segmented__menu" data-kp-menu-button>
//       <button type="button" class="kp-icon-button">⋯</button>
//       <div class="kp-menu" role="menu">
//         <button type="button" class="kp-menu__item" role="menuitem" data-kp-segmented-rename>Rename</button>
//         <button type="button" class="kp-menu__item" role="menuitem" data-kp-value="delete">Delete</button>
//       </div>
//     </div>
//   </div>
//
// The chip stays a child of the group, so every theme's chip look, choosing, the keys, the counts and the chip filter are
// unchanged. The chip and its ⋯ are one pill, split by a hair line; the menu is the package's menu button (its keys, its
// plate, `kp-menu-select` for the page's entries). The menu button is a tab stop only beside the chip that is, so Tab goes
// chip, its menu, out; ContextMenu or Shift+F10 on a chip opens its menu, F2 renames. It names itself "Actions for Pain".
//
// Rename (`data-kp-segmented-rename` on an entry, or F2): the chip becomes a field as wide as it was, its words selected.
// Enter saves: `kp-segmented-rename` `{ value, label, previous, item, waitUntil(promise) }` fires on the group, cancelable; a
// promise that resolves to words or `false`, or rejects, refuses the name and says why under the field (the field stays); one
// that resolves to anything else writes the new words into the chip and fires `kp-segmented-renamed`. Escape, or leaving the
// field, cancels. An empty name is refused at once. Either way the focus comes back to the chip.
//
// Use it with the chip look. setSegmentedItems() replaces a group's chips with plain ones: a page that redraws its chips draws
// the menus again. Nothing runs on import; attachChipMenus(root) returns a detach (js/auto.js loads it for a page with one).

import { attachAll } from './controller.js';
import { ChipMenu } from './segmented-menu/controller.js';
import { CHIP_MENU } from './segmented-menu/constants.js';

export { CHIP_MENU, RENAME_ENTRY, RENAMING, RENAME_EVENT } from './segmented-menu/constants.js';
export { ChipRename } from './segmented-menu/rename.js';

/**
 * Wire every chip menu under `root`. The group itself is the segmented control's (attachSegmented).
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachChipMenus(root = document) {
    return attachAll(root, CHIP_MENU, ChipMenu);
}
