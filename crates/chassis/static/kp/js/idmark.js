// The identity mark: a small chip made from a name [kpadopt4-data; JobTracker's
// `Mark` (ui/kit.jsx) and the admin dashboard's `stackMark` (ui.js)].
//
// Two apps drew the same idea twice: a company or a stack gets a little
// plate of its own, the same on every page, so the eye finds it in a list
// before it reads the name. This is that plate, made from the name alone:
//
//   <span class="kp-idmark" data-kp-idmark="Acme Logistics" aria-hidden="true"></span>
//   <span class="kp-idmark kp-idmark--pattern kp-idmark--sm" data-kp-idmark="media" aria-hidden="true"></span>
//
// From the name (FNV-1a, the same hash as the facet swatch's pattern, so a
// name has one look in both places) come:
//   - the colour: one of the theme's five chart colours (`--chart-1..5`), so
//     the mark lives in the theme's own palette; or, with
//     `data-kp-idmark-hue="free"`, the hue of the hash on the lightness and
//     chroma of `--chart-1` (the admin dashboard's one colour per stack);
//   - the letters: the initials of the first two words, else the first two
//     letters (one on the extra-small mark), upper case;
//   - the pattern (`--pattern`): a 5 by 5 grid mirrored about its middle;
//   - the corner glyph (`--glyph`): circle, square, triangle or diamond.
//
// `idmarkColours(names)` gives a list of names palette slots that do not
// collide while free slots remain, for a list read together (a legend, a
// board); `setIdmark(el, name, { slot })` takes one. The mark is decorative:
// it is hidden from a screen reader and the name always stands beside it
// (`.kp-idmark-name`). An empty name is a quiet dashed plate with a "?".
//
// Sizes `--xs` `--sm` (md is the default) `--lg` `--xl`, `--round`; a list
// marks its current one with `aria-current` or `data-kp-idmark-selected`, and a
// loading mark is `.kp-idmark.kp-skeleton`. `.kp-idmark-group` overlaps marks with
// an exact `.kp-idmark-group__more` ("+3", never "9+").
//
// The avatar [kpadopt5-people; kp-soft's shadcn avatar, JobTracker's recruiter
// photos]: the same mark with a photo on it, so a person without one looks
// exactly like today's marks.
//
//   <span class="kp-idmark kp-idmark--round" data-kp-idmark="Ada Lovelace"
//         data-kp-idmark-src="/people/ada.jpg" data-kp-idmark-status="online"></span>
//
//   data-kp-idmark-src      the photo. The plate keeps its size and its letters
//                           underneath while the photo loads; the photo fades in
//                           (`data-kp-photo` loading, loaded, failed). A photo
//                           that fails leaves the letters, with no error mark:
//                           the person is still identified. Fires
//                           `kp-idmark-photo` `{ state, src }`;
//   data-kp-idmark-loading  `lazy` (default) or `eager`, as the img's `loading`;
//   data-kp-idmark-alt      `decorative` (default: hidden from a screen reader,
//                           the name stands beside it) or `name` (the mark is an
//                           image called by the name);
//   data-kp-idmark-status   `online`, `away`, `busy` or `none` (default): a dot at
//                           the foot corner whose shape differs too (full, ring,
//                           barred), and its word joins the mark's label, so it is
//                           never colour alone. A status makes the mark an image.
//
// `setIdmarkGroup(el, people, { max })` draws a group with an exact "+N" that is
// a button: it opens the list of the names left out.
//
// The marks keep no state per element (a mark is drawn from its attributes), so there is no controller class here: the module is split by
// responsibility into js/idmark/ (mark, avatar, draw, group, more-list, attach); the parts are listed in js/README.md.

export { IDMARK, IDMARK_SLOTS, IDMARK_GLYPHS, idmarkLetters, idmarkFor, idmarkColours } from './idmark/mark.js';
export { IDMARK_STATUSES } from './idmark/avatar.js';
export { setIdmark } from './idmark/draw.js';
export { setIdmarkGroup } from './idmark/group.js';
export { attachIdmarks } from './idmark/attach.js';

/**
 * @typedef {object} IdmarkPerson
 * @property {string} name
 * @property {string} [src] the photo
 * @property {'online' | 'away' | 'busy' | 'none'} [status]
 */
