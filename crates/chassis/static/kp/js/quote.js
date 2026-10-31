// The quote card: your own earlier words, verbatim, with who wrote them and when [kpadopt6; the Life weekly summary that quotes you back to yourself].
//
//   <figure class="kp-quote" data-kp-quote data-kp-quote-date="2026-10-14T19:40:00+02:00" data-kp-quote-lang="nl" data-kp-quote-why="What helped last time">
//       <blockquote>Wandelen na het eten hielp</blockquote>
//   </figure>
//
// It is a display component. Choosing which quote to show, and never a negative one on a good or a rough day, is the
// application's job; the card makes the right thing easy: a Hide that is one press and can be undone, a line saying why it
// is here, and nothing that nags. A `.kp-card` in four states (js/card-state.js: loading as the card's busy card over a
// quote-shaped stage, empty, failed with a normal-size Retry, ready) around a `figure` > `blockquote` > `figcaption`
// with a `time` element that carries the ISO moment and, in its title, the exact `dd/mm/yyyy HH:mm` (rule 52).
//
// Options, each a markup attribute and a field of attachQuotes(root, options) (KT6); the default is what writing nothing gives:
//   data-kp-quote-by          who wrote it                                you (the dictionary's "You")
//   data-kp-quote-date        an ISO moment                               none: the line is left out
//   data-kp-quote-date-style  date | relative | both                      both ("Wednesday 14/10/2026 (3 days ago)")
//   data-kp-quote-lines       a number, or all                            4: a longer entry folds behind Show all, the whole text stays in the page
//   data-kp-quote-now         an ISO moment that "now" is for the relative words   the clock (a page with its own clock, a demo)
//   data-kp-quote-why         "A year ago today", "What helped last time" none
//   data-kp-quote-source      a link to the day the words were written    none
//   data-kp-quote-hide        present | off                               present
//   data-kp-quote-copy        present | off                               off
//   data-kp-quote-size        md | lg                                     md (lg for a hero place in the weekly summary)
//   data-kp-quote-lang        a BCP 47 tag on the words                   none (inherits)
//   data-kp-quote-max         on `[data-kp-quote-list]`: 1 to 5           3, then "Show all 7" (the exact number)
//   data-kp-undo-ms           the Undo window after Hide                  6000 (0 hides at once)
//   data-kp-announce          off | state | all                           state
//
// Hide waits for the Undo window, then fires `kp-quote-hide` on the card; the page stores it (call `wait(promise)` for a save:
// a refusal puts the card back and the toast says why). Keys, while the focus is in the card: `h` hides, Mod C copies when
// copy is on (and nothing is selected); both are on the `?` sheet. Fires `kp-quote-hide` `{ text, wait }`,
// `kp-quote-retry` and `kp-quote-fold` `{ expanded }`. Every word is in js/strings.js; nothing runs on import.
//
// The module is a facade: a quote card is a `QuoteController` (and a list a `QuoteListController`) (closure-pattern B, js/controller.js) in `js/quote/`, one file per concern.

export {
    QUOTE,
    QUOTE_LIST,
    QUOTE_HIDE_EVENT,
    QUOTE_RETRY_EVENT,
    QUOTE_FOLD_EVENT,
    QUOTE_STATES,
    QUOTE_LINES,
    QUOTE_LIST_MAX,
} from './quote/constants.js';
export { quoteWhen } from './quote/when.js';
export { attachQuotes, setQuote, setQuoteState, quote } from './quote/api.js';

/** @typedef {import('./quote/constants.js').QuoteOptions} QuoteOptions */
/** @typedef {import('./quote/constants.js').QuoteSpec} QuoteSpec */
/** @typedef {import('./quote/constants.js').QuoteHandle} QuoteHandle */
