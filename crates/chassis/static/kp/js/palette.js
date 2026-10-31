// Command palette and shortcut sheet, framework-free [TH40, TH49].
//
// The palette is a <dialog>, which means the three hard parts are the
// browser's: focus is trapped, Escape closes, and focus returns to
// whatever was focused before. AR15's baseline is what makes that
// affordable, and a hand-written focus trap is how focus traps break.
//
// The commands are markup the consumer's server wrote, not a JavaScript
// array this module owns. That is the same choice the theme picker makes
// and for the same reason: kyu and almanac render HTML from a Rust binary
// and have no build step, so a palette that only exists after JavaScript
// runs would give them an empty box.
//
//   <dialog class="kp-palette" data-kp-palette id="commands" data-kp-hotkey="k">
//     <input class="kp-palette__input" type="text" role="combobox"
//            aria-expanded="true" aria-controls="commands-list" />
//     <ul class="kp-palette__list" id="commands-list" role="listbox">
//       <li role="presentation" class="kp-palette__group" data-kp-group>
//         <span class="kp-palette__group-label">Items</span>
//         <ul role="group" aria-label="Items">
//           <li class="kp-palette__option" role="option" data-kp-option
//               data-value="new" data-kp-keys="n">New item</li>
//         </ul>
//       </li>
//     </ul>
//     <p class="kp-palette__status" role="status" aria-live="polite"></p>
//   </dialog>
//
// Choosing one fires `kp-palette-run` on the dialog with the value in the
// detail. What that command DOES is the consumer's business — a palette
// that also owned the actions would have to know the application.
//
// The shortcut sheet (TH49) is the same dialog machinery with no input:
// `?` opens it, and it lists the keys. A palette without discoverability
// is a secret, which is why these two ship together rather than the sheet
// arriving later as a nicety.
//
// Since 3.0.0 [KT6]: the hotkey is an attribute and can be off; a
// palette opens from code, with a query pre-typed; which palette answers
// the key is the consumer's to nominate; the matcher is a choice; groups
// hide when every command in them is filtered out; `data-kp-keys` is
// finally rendered, three versions after it was documented; and the
// sheet dispatches events like everything else.
//
// Since gap-12: a button opens either one without a line of script —
// `<button data-kp-palette-open="commands">` — through the same open the
// hotkey uses, so the list is filtered and `kp-palette-open` fires. A
// page that opened the dialog with `data-kp-dialog` instead got a modal
// with a stale list and no event. An empty value means the palette that
// answers the key.
//
// Since scope-48: the palette navigates. A trigger in the bar's
// `.kp-nav__search` slot is such an opener, and the module gives it what a
// trigger owes its reader — `aria-haspopup="dialog"` and `aria-keyshortcuts`
// when the markup left them out, and the hotkey printed into an empty
// `<kbd data-kp-palette-keys>` in the platform's own spelling (⌘K, Ctrl K).
// And an option may be a link:
//
//   <li role="presentation">
//     <a class="kp-palette__option" role="option" data-kp-option
//        data-value="reports" href="/reports">Reports</a>
//   </li>
//
// Enter and a click both follow it, and `kp-palette-run` still fires first,
// cancelable: a consumer with a router calls preventDefault() and routes.
// Before the module attaches — or on a page with no JavaScript — it is a
// plain anchor, so the list the server wrote is a list of working links.
// The module takes the link out of the Tab order (`tabindex="-1"`, taken
// back on detach): the highlight is virtual focus, and a Tab that walked
// into the list would leave the input the combobox is built on.

// Words in any order [kpadopt6-ops; Kenny, 2026-10-17: "Woorden in elke volgorde (nieuw), ook voor bestaande paletten"]:
// the default matcher is now `intent` (js/intent.js) for every palette, existing ones included. Every typed word has to
// start a word of the command, in any order ("jellyfin upd" finds "Update jellyfin"); the best answer comes first in
// its group, the matched words are marked, a hidden synonym (`data-kp-words`) and a description count as a weaker
// match, the open subject's commands come first (`data-kp-context` on the palette, `data-kp-context-of` on a command),
// what is featured (`data-kp-featured`) or was run last (`data-kp-recent="5"`) is all that shows before anything is
// typed (a palette with none of those still shows every command), at most `data-kp-max-shown` (40) rows show and the
// status line says how many matched. A query nothing answers shows the package's empty plate with a hint that names the
// verb's subjects (`data-kp-verb`, `data-kp-subject-name`) when the palette sets `data-kp-nomatch="plate"`; the default stays the approved status line alone.
// `handle.setState('loading' | 'error')` shows the busy card over the list, or the failed plate with Retry beside the
// commands marked `data-kp-static`. `data-kp-match="substring"` (or `prefix`, `subsequence`) brings the older matchers
// back for one palette, and the attribute is read again when it changes (js/live-options.js). Other options: `data-kp-fold-diacritics`, `data-kp-split-hyphen`, `data-kp-typo="1"`,
// `data-kp-highlight="off"`, `data-kp-group-order="Inbox, Do, Go to"`.

export { OPENER, KEYS_SLOT, RUN_EVENT, OPEN_EVENT } from './palette/constants.js';
export { isMac, MATCHERS } from './palette/keys.js';
export { closeOnOutsidePress } from './palette/outside.js';
export { palette } from './palette/api.js';
export { attachPalettes } from './palette/attach.js';

/** @typedef {import('./palette/types.js').Matcher} Matcher */
/** @typedef {import('./palette/types.js').PaletteHandle} PaletteHandle */
