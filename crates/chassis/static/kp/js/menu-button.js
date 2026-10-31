// A menu button with a rich menu: every other action, grouped [scope-143].
//
// The homelab dashboard's "More ▾" (port spec B), moved into the package on
// the menu it already has: the menu is a `.kp-menu` with `.kp-menu__item`
// entries, the registers paint it as they paint every menu, and the keys are
// the ones the data table's column menu answers (↓ ↑ wrap, Home, End). What
// this adds is the rich shape and the wiring a menu button needs:
//
//   <div class="kp-menu-button" data-kp-menu-button data-kp-key="pump-more">
//     <button type="button" class="kp-button">More ▾</button>
//     <div class="kp-menu kp-menu--rich" role="menu" aria-label="Every other action"></div>
//   </div>
//
// setMenu(wrapper, groups) fills it: groups of entries under small muted
// capitals (`.kp-menu__heading`, which names its `role="group"`), each entry
// a label over a one-line hint. An entry that cannot be used now stays in
// the list and in the keyboard's reach (`aria-disabled`, focusable, as the
// APG menu pattern asks), keeps its hint, and says why under it
// (`.kp-menu__reason`), as its accessible description too; it does nothing.
// A fill that shows the same as now is skipped, and while the menu is open a
// new fill waits until it closes, so a live refill never moves an entry
// under the pointer or the focus.
//
// The keys are a menu's: ↓ or ↑ on the button opens it on the first or last
// entry; ↓ ↑ (wrapping), Home and End move; a letter jumps to the next entry
// that starts with it; Esc closes and refocuses the button, and the page's
// own Escape listeners hear nothing; Tab closes and moves on from the
// button. A click outside closes it. A pick fires `kp-menu-select`, which a
// page may cancel to keep the menu open.
//
// The open menu is always whole on the screen (menuPlacement()): it moves
// to the button's other edge, or over the button, or scrolls inside itself,
// and stays clear of a bar the page has stuck over the screen's edge.
//
// Every word is in the dictionary (`menuLoading`, `menuEmpty` in
// js/strings.js). `decorate(part, info)` is called with the button and with
// every entry, each time one is built, so a consumer can mark them. Nothing
// runs on import; attachMenuButtons(root) returns a detach.

export { MENU_BUTTON, MENU_OPEN_EVENT, MENU_CLOSE_EVENT, MENU_SELECT_EVENT, MENU_COUNT_PROPERTY, MENU_GUTTER } from './menu-button/constants.js';
export { menuLineCount } from './menu-button/count.js';
export { menuSignature } from './menu-button/model.js';
export { menuKeyTarget } from './menu-button/keys.js';
export { menuPlacement } from './menu-button/placement.js';
export { openMenu, closeMenu, setMenu } from './menu-button/open.js';
export { attachMenuButtons } from './menu-button/attach.js';

/** @typedef {import('./menu-button/types.js').Strings} Strings */
/** @typedef {import('./menu-button/types.js').MenuItem} MenuItem */
/** @typedef {import('./menu-button/types.js').MenuGroup} MenuGroup */
/** @typedef {import('./menu-button/types.js').MenuDecorateInfo} MenuDecorateInfo */
/** @typedef {import('./menu-button/types.js').MenuButtonOptions} MenuButtonOptions */
/** @typedef {import('./menu-button/types.js').MenuState} MenuState */
/** @typedef {import('./menu-button/types.js').Edges} Edges */
/** @typedef {import('./menu-button/types.js').Covered} Covered */
