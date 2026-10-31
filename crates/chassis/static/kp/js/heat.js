// The heat grid and the matrix [kpadopt2-grids; the admin dashboard's `bk-heat`
// on the Backups page and `fw-mx` on the Firewall page].
//
// Two grids of coloured cells that a person reads at a glance and then asks
// about one cell, each drawn by the package so that a consumer draws nothing:
//
//   .kp-heat    rows x many columns of small cells toned by a state or a
//               value (a stack per night, a service per hour): row labels
//               that filter, a column axis, a summary row whose cells fill
//               from the bottom, a legend, a picked column, hover detail
//               (the hover card), a loading state that keeps the shape.
//   .kp-matrix  source x destination: a cell per pair that says its state in
//               words and a glyph (allowed, mismatch, blocked, unknown), the
//               headers stay while the grid scrolls, headers that light up a
//               row and a column, one cell pinned.
//
// Loading (both): the waiting cells keep the grid's shape, and the data
// table's own loading card (js/busy-card.js: the theme's spinner and
// "Reading…") stands centred over the cells, the axis, the headers and the
// names readable beside it [Kenny, 2026-10-16: "zoals bij een table waar het
// icoon in het midden van de matrix staat en lijkt te laden"]. It arrives the
// theme's way (not on a first render) and leaves as the busy table's card
// leaves; a grid that leaves its loading state is drawn once the card has
// gone, so nothing is drawn under a card on its way out.
//
// Both share the tone words of the month heatmap (js/calendar.js):
// `data-kp-tone` ok, warn, bad, muted, future, before, none, loading; a heat
// cell also takes `level` (a value, `--kp-heat-level` 0 to 1) and a matrix
// cell `self` (a pair with itself: dashed, inert).
//
// The legend [gap-tab-count]: `setHeatLegend(el, entries, { keys })` writes the `ul.kp-heat__legend` under the grid (made when the
// grid has none), a swatch and its words per entry, a value ramp ("Less" to "More") where an entry asks for one, and at its end the
// line of keys; the grid names it in `aria-describedby`. A calm grid (`data-kp-tones="calm"`) draws Logged, Nothing logged and
// Paused by itself (only the tones its cells have; `data-kp-legend="all"` lists all three), `data-kp-legend="hide"` leaves it out (setHeat also takes `legend` and `legendKeys`).
//
// Paging [wish-1120, homelab 100]: `setHeat(el, { paging: { offset, label, min, max } })` (or `setHeatPaging(el, …)`) draws an Earlier /
// Today / Later bar before the grid; the offset counts pages back from today (`data-kp-heat-offset`), Today is off at 0, Later at `min`
// (0), Earlier at `max`; the buttons and Page Up / Page Down fire `kp-heat-page` with the new `offset`, and the page draws that window.
// `decorate` [wish-1120, homelab 65, 114]: `setHeat(el, spec, { decorate })` marks every row label button, cell button and paging button.
//
// Calm tones [kpadopt6]: `data-kp-tones="calm"` on a heat grid swaps ok, warn and bad for `logged`, `quiet` and `paused`
// (js/calm-tones.js): a cell with nothing logged is quiet, never failed, and its words never say "missed".
//
// A page may write the markup itself (see docs/USER_GUIDE.md) or give the
// data:
//
//   setHeat(el, {
//       columns: [{ key: '2026-10-14', label: '14' }, …],
//       summary: { label: 'Whole fleet', cells: [{ tone: 'warn', share: 0.8, label: '4 of 5 backed up' }, …] },
//       rows: [{ key: 'media', label: 'media', cells: [{ tone: 'ok', label: 'backed up', tip: 'Snapshot at 03:12' }, …] }, …],
//   });
//   setMatrix(el, {
//       corner: 'from ↓ to →',
//       rows: [{ key: 'web', label: 'web' }, …], columns: [{ key: 'db', label: 'db' }, …],
//       cell: (row, column) => ({ tone: 'ok', text: '3', label: '3 ports open' }),
//   });
//
// Keyboard (both): one tab stop, the arrow keys move between the cells,
// Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the
// corners; a heat grid also sends Page Up and Page Down as `kp-heat-page`
// (the page shows the earlier or later columns) and Escape drops the picked
// column; a matrix skips the cells that cannot be pressed. Enter and Space
// press.
//
// The latest column, opt-in [kpadopt3]: `data-kp-heat-latest="end"` (or
// `"start"`, for a grid whose newest column comes first) says which edge the
// newest column stands on. The key that goes to that edge (End, or Home)
// still moves to the end of the row as it always does, and also sends
// `kp-heat-page { direction: 'latest' }`, so a grid paged back to older
// columns comes back to the newest in the same press, the way Page Up and
// Page Down already page; with Ctrl it goes to that corner and sends it too.
// The page answers as it answers Page Up and Page Down (it shows the newest
// columns, and may drop its pick); setHeat() keeps the focus on the edge.
//
// Events (bubbling, on the grid), unless the grid is marked `data-kp-heat-owned`
// or `data-kp-matrix-owned`, in which case the page keeps the state itself and
// only hears them:
//   kp-heat-pick     { rowKey, colKey, cell, picked }    a column was picked or dropped (picked false)
//   kp-heat-row      { key, pressed, keys }               a row label was pressed
//   kp-heat-page     { direction: 'earlier' | 'later' | 'latest' | 'today', offset?, source? }   Page Up, Page Down; End or Home towards the latest;
//                    with a paging bar (below) also its buttons, and `offset` is the page asked for (0 today, 1 the page before)
//   kp-matrix-pick   { rowKey, colKey, cell, source }     a cell was pinned
//   kp-matrix-light  { keys }                             the headers that are lit changed
//
// Nothing runs on import. attachHeats(root) and attachMatrices(root) return a
// detach; the hover card (js/hovercard.js) is attached for the cells that
// carry `data-kp-hovercard`, and a page that wants rich content attaches it
// itself with a `fill`.

export {
    HEAT,
    MATRIX,
    HEAT_PICK_EVENT,
    HEAT_ROW_EVENT,
    HEAT_PAGE_EVENT,
    MATRIX_PICK_EVENT,
    HEAT_RETRY_EVENT,
    MATRIX_RETRY_EVENT,
    MATRIX_LIGHT_EVENT,
} from './heat/constants.js';
export { setHeat } from './heat/draw.js';
export { setHeatPick, setHeatRows } from './heat/pick.js';
export { heatOffset, setHeatPaging, removeHeatPaging } from './heat/paging.js';
export { setHeatLegend } from './heat/legend.js';
export { attachHeats } from './heat/wire.js';
export { setMatrix, setMatrixLit, setMatrixPick } from './heat/matrix.js';
export { attachMatrices } from './heat/matrix-wire.js';

/** @typedef {import('./heat/types.js').GridTone} GridTone */
/** @typedef {import('./heat/types.js').HeatCell} HeatCell */
/** @typedef {import('./heat/types.js').HeatRow} HeatRow */
/** @typedef {import('./heat/types.js').HeatSpec} HeatSpec */
/** @typedef {import('./heat/types.js').HeatDecorateInfo} HeatDecorateInfo */
/** @typedef {import('./heat/types.js').HeatPaging} HeatPaging */
/** @typedef {import('./heat/types.js').HeatLegendEntry} HeatLegendEntry */
/** @typedef {import('./heat/types.js').HeatLegendOptions} HeatLegendOptions */
/** @typedef {import('./heat/types.js').MatrixCell} MatrixCell */
/** @typedef {import('./heat/types.js').MatrixSpec} MatrixSpec */
