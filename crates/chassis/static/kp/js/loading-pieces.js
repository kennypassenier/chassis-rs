// Loading pictures that need pieces of their own [scope-141].
//
// Most registers draw what waits with a part's own pseudo-elements. A theme
// whose loading picture is made of pieces (pastel's pom-pom caterpillar:
// Kenny's pick `b-bug-6` on research/pastel-character, 2026-10-14, "alles
// wordt rups") names it in `--kp-loading-pieces`, and this module adds the
// pieces to every waiting part while it waits and takes them away after:
//
//   - a row (a skeleton line, the busy progress bar's track, a loading
//     meter, a heat grid's row of waiting cells, which is one caterpillar and
//     not thirty): pom-poms as round as the row is high, and a head at its end;
//   - a day of the month that loads: two legs under it, and a head beside
//     the last loading day of its week; the day itself rises in turn;
//   - a plate that waits (a block skeleton, the busy table's panel, the busy
//     month's card, a busy menu): a head on its top-end corner and legs
//     along its foot that step in turn;
//   - a spinner: a pom-pom caterpillar round a small day sticker.
//
// The pieces are decoration (`aria-hidden`, no focus, no pointer), in one
// `<span class="kp-pieces">` per part, and the part carries
// `data-kp-pieces="<name>"` while they are there, so a register can put its
// own still picture away (and back without the script). They are measured
// from the part's layout box (offsets, never a transform), again when the
// part changes size. Every motion is the register's, in CSS: this module
// writes places and turns, never a time. A theme that names nothing (every
// theme but pastel) gets nothing: no piece is written, the markup stays as
// it came.
//
//   import { attachLoadingPieces } from '@kp-soft/themes/js/loading-pieces';
//   const detach = attachLoadingPieces(document);
//
// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names and measures, the drawing, the dressing and the
// LoadingPiecesWatch controller live in js/loading-pieces/, listed in js/README.md.

import { watchPieces } from './loading-pieces/watch.js';

export { PIECES_PROPERTY, PIECES_ATTRIBUTE, PIECE_CARRIERS } from './loading-pieces/values.js';

/**
 * Watch `root` for parts that wait and give each the pieces its theme
 * names, for as long as it waits; a theme switch, a part that starts or
 * stops waiting and a part that changes size are followed.
 * @param {ParentNode} [root]
 * @returns {() => void} detach: every piece goes, the parts are as they came
 */
export function attachLoadingPieces(root = document) {
    if (typeof MutationObserver !== 'function' || typeof getComputedStyle !== 'function') return () => {};
    return watchPieces(root);
}
