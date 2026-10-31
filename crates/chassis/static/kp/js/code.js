// The code block: a payload, a request or a snippet shown as text
// [kpadopt4-data; kyu's `pre.snippet` with its Reveal and Copy, the payload
// cell of its dead letters, the requests in chassis' clients dialog].
//
//   <figure class="kp-code" data-kp-code data-kp-code-title="Payload" data-kp-code-language="JSON" data-kp-code-max="12">
//       <pre class="kp-code__body"><code>{"topic":"backup.done","ok":true}</code></pre>
//   </figure>
//
// js/auto.js finds it and setCode() draws the rest; a page that draws later
// calls setCode(el, { text, title, language, … }) itself. The block is:
//
//   - a head: the title, what it is (language, lines, size) and the tools,
//     which keep their place in every state: Pretty and Raw (a segmented
//     control, only for JSON that parses), Wrap (a toggle, `aria-pressed`),
//     and Copy, whose word changes to "Copied" in the width the longest word
//     keeps (`.kp-code__word`), so nothing beside it moves;
//   - the text in the mono face, scrolling sideways in its own box (it takes
//     focus, so a keyboard can scroll it), or wrapped; JSON keys in the key
//     colour and its punctuation quiet; line numbers in a gutter outside the
//     text with `lines` (a copy or a selection never takes them);
//   - folded to `maxLines` with "Show all N lines" under it when it is
//     longer, and a foot that says when only the start was sent
//     (`truncated: { shown, total }`).
//
// TOML and shell text are coloured too [wish-1028, almanac 17]: name the language `TOML` or `bash` (also `sh`, `shell`, `zsh`) and the
// keys, [tables], strings, numbers, comments, commands, flags and $variables get their own classes (`.kp-code__key`,
// `__section`, `__string`, `__value`, `__comment`, `__var`). `highlight: false` (`data-kp-code-highlight="off"`) leaves the text plain.
// The colours are two knobs, `--kp-code-key` and `--kp-code-value`; comments and punctuation are the muted ink.
//
// States: `loading` (the body keeps its height under the data table's busy
// card, js/busy-card.js; the tools wait, disabled), `empty`, `binary` (`size`)
// and `error` (`message`). Empty and error are the package plate (js/state-plate.js, `.kp-stateplate`) in the body's place at its
// height, the failed one with a Retry that fires `kp-code-retry` on the root [states-check-1019]; binary is one muted sentence.
// The same block as a table cell [kpadopt5], `.kp-code--cell`: no title, the
// words wrap (a row never scrolls sideways), three lines show and "Show all 40
// lines" opens the rest in place (`data-kp-code-open="inline"`, default) or in a
// dialog (`"dialog"`); `data-kp-code-language="auto"` makes it JSON only when
// the text parses; `data-kp-binary-size` (bytes) and `data-kp-download` give the
// one muted line "binary, 2.1 kB" with its link; `data-kp-truncated="1024/4096"`
// (bytes shown / bytes in all) gives the foot line; `data-kp-copy="false"` takes
// Copy away, otherwise it copies the whole value, folded or not. Empty is the
// muted line "empty payload"; loading is the busy card over a block of its
// final height.
//
// Events on the root: `kp-code-copy` `{ text }`, `kp-code-copy-failed`,
// `kp-code-wrap` `{ wrap }`, `kp-code-layout` `{ layout }`, `kp-code-fold`
// `{ folded }`.
//
// The module is a facade: a block is a `CodeBlock` (closure-pattern B, js/controller.js) in `js/code/`, one file per concern.

export { CODE, CODE_COPIED_MS } from './code/constants.js';
export { prettyJson } from './code/language.js';
export { setCode, attachCodes } from './code/attach.js';

/** @typedef {import('./code/constants.js').CodeSpec} CodeSpec */
