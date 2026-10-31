// The sentence form: a form that reads as a sentence [kpadopt5-time; homelab's `.sch-sentence`].
//
// "Run [backup] on [nextcloud] every [week] on [Mon Thu] at [03:00]": the fields stand inside the words, so a person
// reads what will happen as they fill it in. The fields are the package's own (an input, a select, a combobox, the
// date picker, the weekday picker), put inside `.kp-sentence__field`, which keeps each one's behaviour and draws it
// inline, an underline in the primary colour by default:
//
//   <form class="kp-sentence" data-kp-sentence>
//     <p class="kp-sentence__text">
//       Run <span class="kp-sentence__field"><select name="job" aria-label="What to run">…</select></span>
//       <span class="kp-sentence__when" data-kp-show-when="how=once"> on <span class="kp-sentence__field">…</span></span>
//       at <span class="kp-sentence__field"><input name="at" aria-label="At" value="03:00" /></span>.
//     </p>
//   </form>
//
// Options (markup attribute, each with a default [KT6]):
//   data-kp-look          underline | boxed: how a field is drawn                  underline
//   data-kp-sentence-size lg (1.125rem, line height 2.4) | md (1rem)               lg
//   data-kp-narrow        wrap | stack | flow: what a narrow screen does           wrap
//   data-kp-own-line-ratio how much of the line a field may take before it goes on a line of its own   0.7
//   data-kp-show-when     on a phrase: `field=value` (a comma lists values); the phrase shows only then   always
//   data-kp-block         on a field: it always takes a line of its own (the weekday picker)   off
//   data-kp-disabled-reason  on a disabled fieldset: the sentence that says why     none
//   data-kp-sentence-computed      on an `<output class="kp-sentence__computed">`: the name of a read-only field the sentence works out   none
//
// `wrap` (Kenny, 2026-10-17) lets the sentence run on over several lines with the fields between the words, and a field
// whose natural width is more than `data-kp-own-line-ratio` of the line (a stack name that is long) takes a line of its own,
// the full width; `stack` puts every field on its own line below 30rem; `flow` never does. A phrase that is hidden is
// `hidden` and `inert`, its controls disabled, so they are neither tabbed to nor submitted.
//
// A read-only computed field [audhd-opts-1019; AuDHD recipes 24]: a word the sentence works out from its other fields, such as
// "ready at 18:40" from the start time and the minutes:
//
//   Start at <span class="kp-sentence__field"><input name="start" aria-label="Start" value="17:30" /></span>,
//   it takes <span class="kp-sentence__field"><input name="minutes" aria-label="Minutes" value="70" /></span> min and is
//   ready at <span class="kp-sentence__field"><output class="kp-sentence__computed" data-kp-sentence-computed="ready"
//   aria-label="Ready at"></output></span>.
//
//   attachSentences(root, { computed: { ready: (values) => addMinutes(values.start, Number(values.minutes)) } });
//   sentence(form).compute('ready', (values, form) => …)    // the same, after attach
//   setSentenceComputed(form, 'ready', '18:40')              // or push the text yourself (an answer that arrives late)
//
// The function gets the value of every named control (`{ start: '17:30', minutes: '70' }`; a radio or checkbox that is not
// chosen is null) and is called again on every change, before the summary is spoken, so the summary holds the new text. It
// returns a string or a number; nothing (null, undefined, an empty string) draws a dash and the summary says "(Ready at)"; a
// function that throws draws the dash and warns once in the console. The field is drawn apart from the editable ones (a quiet
// plate, no underline in the primary colour), is not a control (no tab stop, no focus ring, never submitted) and is not
// announced on its own: `aria-live="off"`, because the sentence's own status line already speaks the whole sentence.
//
// A select in a sentence opens the package's drawn list (data-kp-select="native" keeps the browser's).
//
// Every control needs a name of its own (`aria-label`): the words round it are not its label to a screen reader. A
// control without one takes the words before it. A status region says the whole sentence in words when it changes
// ("Run backup on nextcloud every Monday at 03:00."), politely and after a pause, and `sentenceSummary(el)` reads the same
// text. Enter in the last field submits the form. An invalid control (`aria-invalid`) is drawn with a destructive
// underline; `setSentenceInvalid(el, name, why)` marks one and writes the line under the sentence that names the field.
// `setSentenceFieldState(field, 'loading')` shows a field's own skeleton at the width it had, so the sentence does not
// reflow when its choices arrive. Nothing runs on import; attachSentences(root) returns a detach.
//
// Each sentence is one Sentence controller (js/sentence/controller.js, on js/controller.js); the words and the helpers are in
// js/sentence/fields.js. The parts are listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { Sentence } from './sentence/controller.js';
import { SENTENCE } from './sentence/fields.js';

export {
    SENTENCE,
    SENTENCE_EVENT,
    setSentenceComputed,
    sentenceSummary,
    setSentenceInvalid,
    setSentenceWhy,
    setSentenceFieldState,
} from './sentence/fields.js';

/**
 * @typedef {object} SentenceHandle
 * @property {HTMLElement} element
 * @property {HTMLElement} line the line under the sentence
 * @property {() => string} summary the sentence in words
 * @property {() => void} refresh show and hide the phrases, work the computed fields out again and place the fields
 * @property {(name: string, fn: ComputedFn | null) => void} compute set (or with null, drop) the function behind a computed field
 */

/**
 * @callback ComputedFn
 * @param {Record<string, string | null>} values the value of every named control
 * @param {Element} element the sentence
 * @returns {string | number | null | undefined}
 */


/** The handle of an attached sentence. @param {Element} element @returns {SentenceHandle | null} */
export function sentence(element) {
    return controllerOf(element, Sentence)?.handle ?? null;
}

/**
 * Wire every sentence form under `root`.
 * @param {ParentNode} [root]
 * @param {{ computed?: Record<string, ComputedFn> }} [options] the functions behind the computed fields, by `data-kp-sentence-computed`
 * @returns {() => void} detach
 */
export function attachSentences(root = document, { computed = {} } = {}) {
    return attachAll(root, SENTENCE, Sentence, { computed });
}
