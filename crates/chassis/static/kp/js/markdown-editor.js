// The Markdown editor [habits-1101; the Habits todo app's task notes, project notes and Notes page].
//
// A Markdown field: the page's own text area, with a toolbar above it and the text as it will read beside it.
//
//   <div class="kp-md-editor" data-kp-md-editor>
//     <textarea class="kp-field__input kp-field__input--multiline" aria-label="Notes" rows="10"></textarea>
//   </div>
//
//   toolbar      bold, italic, heading, bulleted list, checklist, link: the package's small ghost buttons, one tab stop
//                (← → Home End, APG toolbar), each named with its shortcut; a press edits the selection and gives the focus back
//   keys         Mod+B bold, Mod+I italic, Mod+K a link (`[words](https://)` with the address selected to type over); Mod is ⌘ on
//                a Mac, Ctrl elsewhere. Every edit is one step the browser's undo takes back
//   lists        Enter at the end of a list item starts the next (`- `, the next number, an empty `[ ]` after a task); Enter on an
//                empty item ends the list
//   preview      `data-kp-md-preview`: `side` (default) beside the text when the editor is at least 48rem wide, behind Write /
//                Preview tabs when narrower; `tabs` always tabs; `off` none. It is the package's reader (markdownFragment),
//                `data-kp-md-headings` the level a `#` takes (3); a task box ticked in it is written into the text
//
// The page saves on the text area's own `input` event, which every edit and every tick fires. Words are in the dictionary
// (`md…`). Each editor is one MarkdownEditor controller (js/markdown-editor/controller.js over edits.js and toolbar.js).

import { attachAll, controllerOf } from './controller.js';
import { MarkdownEditor } from './markdown-editor/controller.js';

export { continueList, link, prefixLines, wrap } from './markdown-editor/edits.js';

/** An editor: an element holding the text area. */
export const MD_EDITOR = '[data-kp-md-editor]';

/**
 * Wire every editor under `root` (the root itself included).
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('./strings.js').Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachMarkdownEditors(root = document, options = {}) {
    return attachAll(root, MD_EDITOR, MarkdownEditor, options);
}

/**
 * Show the text or the preview of a narrow editor (a wide one shows both).
 * @param {Element} el
 * @param {'write' | 'preview'} view
 */
export function showMarkdownView(el, view) {
    controllerOf(el, MarkdownEditor)?.show(view);
}

/**
 * Draw the preview again after the page set the text area's value by script (typing draws it by itself).
 * @param {Element} el
 */
export function refreshMarkdownPreview(el) {
    controllerOf(el, MarkdownEditor)?.render();
}
