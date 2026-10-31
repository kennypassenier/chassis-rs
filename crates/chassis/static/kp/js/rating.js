// A star rating: give something a score, or show one [kpadopt6; the parked recipes app's "how was it", Kenny's example is four of five].
//
// A row of stars that is a radio group (one tab stop, the arrows move and choose, Home and End, Backspace clears) and, with
// `data-kp-rating-mode="display"`, the same row read only, one image with a full text name.
//
//   <div class="kp-rating" data-kp-rating data-kp-rating-for="Lasagne" data-kp-rating-value="4"></div>
//   <div class="kp-rating" data-kp-rating data-kp-rating-mode="display" data-kp-rating-value="4.5" data-kp-rating-count="12"></div>
//
// Options, each a markup attribute and a field of attachRatings(root, options) (KT6); the default is what writing nothing gives
// (Kenny, 2026-10-17: five whole stars):
//   data-kp-rating-max        3 to 10                              5
//   data-kp-rating-step       1 | 0.5                              1   (0.5 turns the row into one slider, `aria-valuetext` "3.5 of 5")
//   data-kp-rating-mode       input | display                      input
//   data-kp-rating-value      0 to max; 0 is "not rated"           0
//   data-kp-rating-clear      present | off                        present: the chosen star again, Backspace or Delete clear
//   data-kp-rating-labels     "Not for me|Okay|Good|Great|Make again" or a JSON list, one word per level; the caption shows it
//   data-kp-rating-size       sm | md | lg                         md (input), sm (display)
//   data-kp-rating-commit     immediate | confirm                  immediate (one tap saves; confirm holds the pick until Save)
//   data-kp-rating-preview    present | off                        present: the star about to be set under the pointer
//   data-kp-rating-unrated-text   the words of an empty row        "Not rated yet"
//   data-kp-rating-count      display only: "4.5 (12)"             none
//   data-kp-readonly          drawn as an input, not changeable    absent; data-kp-disabled with data-kp-disabled-reason locks it for now
//   data-kp-rating-name       a hidden input for a plain form      none
//   data-kp-rating-for        the item's name for the sentences    the element's aria-label
//   data-kp-undo-ms           the Undo window after a change       6000 (0 for none)
//   data-kp-flash-error-ms    how long a refused save is told      3000
//   data-kp-announce          off | state | all                    state
//   data-kp-state             loading | error | ready              ready (setRatingState)
//
// Events (bubbling, on the element): `kp-rating-change` `{ value, previous, source: 'pointer' | 'keyboard' | 'clear' | 'undo',
// wait(promise) }`, cancelable (the page refuses and the row goes back). A page that saves asynchronously calls `wait(promise)`:
// the row is busy, and a rejection puts the previous value back and tells it under the row for `data-kp-flash-error-ms`.
// `kp-rating-retry` is fired by the Retry of a rating that could not be read. A table cell: ratingCell(cell, value) draws the
// display row and writes the number the data table sorts by. Every word is in js/strings.js; nothing runs on import.
//
// The module is a facade: a rating is a `RatingController` (closure-pattern B, js/controller.js) in `js/rating/`, one file per concern.

export { RATING, RATING_EVENT, RATING_RETRY_EVENT, RATING_STATES } from './rating/constants.js';
export { snapRating } from './rating/math.js';
export { attachRatings, rating, setRating, setRatingState, ratingCell } from './rating/api.js';

/** @typedef {import('./rating/constants.js').RatingSource} RatingSource */
/** @typedef {import('./rating/constants.js').RatingOptions} RatingOptions */
/** @typedef {import('./rating/constants.js').RatingHandle} RatingHandle */
