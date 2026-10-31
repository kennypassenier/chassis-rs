// "Used by": sources on one side, the things that use them on the other, joined by lines [kpadopt6-media; JobTracker's reuse map].
//
// The same relation that `kp-matrix` (js/heat.js) draws as a grid, drawn as two columns with curved lines, so one glance shows what
// depends on what. It is not a new component but a second view of the matrix: `data-kp-view="lines"`, with the matrix's data (`rows` are
// the sources, `columns` the things that use them, `cell(row, column)` truthy is a line) and optional content per node:
//
//   setMatrix(el, {
//       view: 'lines',
//       rows:    [{ key: 'cv-nl', label: 'CV Developer NL', sub: 'generic master, made 06/2026', glyph: 'pdf', href: '/cv/nl' }, { key: 'none', label: 'No CV', ghost: true, dashed: true }],
//       columns: [{ key: 'deloitte', label: 'Deloitte', href: '/apps/1' }, …],
//       cell: (row, column) => (used(row, column) ? { tone: 'ok' } : null),
//   });
//
// Options (markup on the matrix, each with a default [KT6]; the same names are fields of the spec):
//   data-kp-view                  grid | lines                                              grid (existing matrices never change)
//   data-kp-lines-side            sources-left | sources-right                             sources-left
//   data-kp-lines-shape           curve | elbow | straight                                  curve
//   data-kp-lines-light           hover | pick | both | off: a node lights its lines, the rest dims   both (hover or focus lights, a press pins)
//   data-kp-lines-count           on | off: the exact count of uses on each source           on
//   data-kp-lines-empty-sources   show | hide: a source nothing uses                        show ("Not used")
//   data-kp-lines-collapse-below  px: under this width each source lists its users instead   640
//   data-kp-density               comfortable | compact                                      comfortable
//   data-kp-remember              a name: the pinned node and the view are kept on this device
//
// Node content: `{ label, sub, glyph (a document kind: pdf doc sheet image text unknown), href, tone, ghost, dashed, disabledReason }`.
// A line carries what `cell(row, column)` returns, the same object the grid view reads [r3r5-1019 line-tone]:
//   `tone`   ok | warn | bad | muted: the line's colour, and a second carrier so colour is never alone (ok solid, warn dashed,
//            bad dotted and heavier, muted faint), with the tone's glyph on the label
//   `label`  a few words that stand on the line ("writes here", "blocked"): a small plate in the gap between the columns, never
//            over a card, moved along the line to keep clear of its neighbours (a label that finds no room is shown while its line
//            is lit); the node's words and the phone's list say it too ("Deloitte (writes here)")
// Keys: one tab stop; Up and Down move within a column, Left and Right jump to the other column and land on the first connected node,
// Home and End the ends, Space or a press pins, Enter opens the node's link (else pins), Escape drops the pin. The lines are hidden from
// assistive technology; every node says the relation in words ("CV Developer NL, used by 2: Deloitte, Takto"), so the phone list and
// the map hold the same text. Lines are placed again on a change of data, of size and when the fonts arrive. Loading lays the theme's
// busy card over the whole map; empty and failed fill its footprint with the package's plates.
// Fires `kp-uses-pin` `{ key, side, pinned, related }` and `kp-uses-retry`. Nothing runs on import; drawn by `setMatrix`.

// Each draw is a model (js/uses-map/model.js) turned into nodes (nodes.js) and wired by one UsesWire controller (wire.js, on
// js/controller.js); the parts are listed in js/README.md.

export { USES_MAP, USES_PIN_EVENT, USES_RETRY_EVENT, USES_COLLAPSE_BELOW } from './uses-map/constants.js';
export { rememberedView, rememberView } from './uses-map/memory.js';
export { usesRelation, usesPath } from './uses-map/relation.js';
export { drawUsesMap, setUsesPin, leaveUsesMap } from './uses-map/draw.js';

/**
 * @typedef {object} UsesNode
 * @property {string} key
 * @property {string} label
 * @property {string} [sub] a line under the label
 * @property {'pdf' | 'doc' | 'sheet' | 'image' | 'text' | 'unknown'} [glyph] a document mark before the label
 * @property {string} [href] a link to the thing itself
 * @property {string} [tone] `ok` `warn` `bad` `muted`
 * @property {boolean} [ghost] not a real thing but still a group (a faint node)
 * @property {boolean} [dashed] its lines are dashed
 * @property {string} [disabledReason] the node cannot be opened, and why
 * @property {string} [mark] kept from a matrix row: a colour
 */

/**
 * What a line carries [r3r5-1019 line-tone].
 * @typedef {object} UsesLine
 * @property {'ok' | 'warn' | 'bad' | 'muted'} [tone] the line's colour (and its pattern)
 * @property {string} [label] the words on the line
 */

/**
 * The helpers heat.js hands over: the busy card's bookkeeping lives there.
 * @typedef {object} Context
 * @property {(el: HTMLElement, nodes: Node[]) => void} replaceKeepingCard
 * @property {(el: HTMLElement, loading: boolean, words: string, area: () => readonly (Element | { top: number, right: number, bottom: number, left: number })[], className: string) => void} syncCard
 * @property {(el: HTMLElement) => void} markDrawn
 */
