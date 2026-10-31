// Combobox and tag input, framework-free [TH39, TH41].
//
// The two share almost everything: a text input, a filtered list, virtual
// focus from js/listbox.js. They differ in what a choice does — a
// combobox replaces the value, a tag input appends one and clears the
// field — so they are one module with one flag rather than two files that
// drift.
//
// What the markup looks like:
//
//   <div class="kp-combobox" data-kp-combobox>
//     <input class="kp-combobox__input" type="text" role="combobox"
//            aria-expanded="false" aria-controls="fruit-list" />
//     <ul class="kp-combobox__list" id="fruit-list" role="listbox" hidden>
//       <li class="kp-combobox__option" role="option" data-kp-option
//           data-value="apple">Apple</li>
//     </ul>
//     <p class="kp-combobox__status" data-kp-combobox-status
//        role="status" aria-live="polite"></p>
//   </div>
//
// Add `data-kp-tags` to the wrapper and it becomes a tag input. Tags the
// server already rendered into `[data-kp-tag-list]` are read at attach.
//
// The status line is not decoration. A sighted user sees the list shrink
// as they type; without an announcement, nobody else knows anything
// happened. It is the single most-skipped part of every combobox.
//
// Since 3.0.0 [KT6]: the values are readable and settable through the
// handle; the matcher is a choice (substring, prefix, or the palette's
// subsequence) or the consumer's own function; every behaviour — open on
// focus, close on blur, Backspace removes, stay open after a tag, the
// cap, duplicates — is a flag with a default; the tag markup can be the
// consumer's; and detach restores what attach changed.

export { CHANGE_EVENT, OPEN_EVENT } from './combobox/constants.js';
export { MATCHERS } from './combobox/matchers.js';
export { combobox } from './combobox/handle.js';
export { attachComboboxes } from './combobox/attach.js';
export { drawsSelect, drawnSelect, attachSelect, attachSelects } from './combobox/select.js';

/** @typedef {import('./combobox/types.js').Matcher} Matcher */
/** @typedef {import('./combobox/types.js').ComboboxHandle} ComboboxHandle */
/** @typedef {import('./combobox/types.js').ComboboxHook} ComboboxHook */
/** @typedef {import('./combobox/types.js').SelectHandle} SelectHandle */
