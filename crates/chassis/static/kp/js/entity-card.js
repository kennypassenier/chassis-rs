// The entity card: one fixed card per thing (a stack), the same height in every state [kpadopt6-ops; homelab's Overview
// cards, `cardEl` in admin/web/js/pages/overview.js and `sk-card*` in css/pages/stacks.css].
//
//   <div class="kp-entity-grid" data-kp-entity-grid></div>
//   setEntityGrid(grid, [{ key: 'media', name: 'media', vmid: '106', state: { label: 'running', tone: 'success' },
//       figures: [{ value: '3/5', label: 'apps up' }, { value: '12', label: 'restarts' }],
//       flags: [{ label: 'update available', tone: 'warning' }],
//       meters: [{ label: 'CPU', value: 0.34 }, { label: 'RAM', value: 0.71, text: '5.6 of 8 GB' }],
//       actions: [{ id: 'restart', label: 'Restart' }, { id: 'logs', label: 'Logs' }, { id: 'remove', label: 'Remove', danger: true }] }]);
//
// Every card is the same grid of rows, kept whether a row has anything in it or not: the identity (an optional tick, the
// mark made from the name, the name as a link, the id, the state in words), the figures, the flags, the meters and the
// actions. A card with no flag keeps its flag row, so every card in every state is as high as the next. A live refill
// (`setEntity` again with the same key) changes the words in place; the card is never rebuilt under the pointer or the focus.
// Options, as attributes on the grid or on one card:
//
//   data-kp-entity-meters      how many meter rows a card holds, 0 to 3 (default 2)
//   data-kp-entity-flags-max   how many flags show; the rest are an exact "+2" that opens the package's own menu (default 3)
//   data-kp-entity-inline      the most actions that stand as buttons; the rest go in a "More" menu (default 3); a phone folds all.
//                              The actions come only from the data: none means no actions row at all, and the columns are as
//                              many as the grid's busiest card needs, the same for every card; a button that does not fit the
//                              card's width goes in "More" as well, for the whole grid, and comes back when the grid widens
//   data-kp-entity-link        the name's link: a template with `{key}`; the whole card is its click target (one tab stop)
//   data-kp-selectable         a tick at the start of the card (it is a row of a selection: `data-kp-row-key`, the keys j k x)
//   data-kp-entity-mark        `idmark` (default, from the name), `icon` or `none`
//   data-kp-density            `comfortable` (default) or `compact` (the figures row goes)
//   data-kp-entity-min         on the grid: the least width of a card (default 22rem)
//   data-kp-state              on a card: `loading`, `empty` ("not measured") or `error` (the state turns destructive and a
//                              Retry takes the actions' place); on the grid: `loading` (skeleton cards and the busy card),
//                              `empty` ("No stacks yet" and its action) or `error` (the failed plate with Retry)
//   data-kp-entity-empty-action  `none`: the empty plate ("No stacks yet") has no action; `setEntityGridState(grid, 'empty', { actionLabel,
//                              onAction })` words it and runs your function instead of firing `kp-entity-new`
//   data-kp-entity-trend       the trend row (`trend: number[]`, a 24-hour line drawn with kpi.js's drawSparkline, the current value
//                              beside it): `auto` (default: every card of the grid has the row as soon as one card has a `trend`),
//                              `on` (always) or `off`. A card with fewer than two readings keeps the row and says "no line yet"
//   data-kp-entity-kind        `stack` (default) or `tile`: an app or link tile, see below
//   data-kp-entity-star        a favourite star at the end of the identity row: `on` or `off` (default `on` on a tile, `off` on a stack)
//   data-kp-entity-star-key    the key that stars the card while the focus is inside it (default `s`; `.` when the tiles jump by their first
//                              letter, `data-kp-tiles-keys="letters"`; `off` for none) [wish-1120]
//
// The tile (`data-kp-entity-kind="tile"`, homelab's Apps page `tileEl`): the whole card is one link to `href` (the name is the real
// anchor, stretched over the card; one tab stop), with the mark made from the name, the state as a dot and a word, a description that
// wraps whole, and `lines` (small facts, newest first) standing at the foot, so the lines of every tile in a row line up. The star is
// a real toggle button (js/toggle.js) above the link: pressing it, or pressing its key, never follows the link. The data is
//
//   { key: 'jellyfin', name: 'Jellyfin', href: 'https://jellyfin.example.net', external: true, starred: true,
//     description: 'Movies, series and music for the house', state: { label: 'up', tone: 'success' },
//     lines: ['5 items, 3 playing', '03:12:44 Info Playback: Kenny started Dune'] }
//
// `match: 'jelly'` on a tile's data marks what a search typed: the first occurrence in the name (any case) is wrapped in a
// `<mark class="kp-entity__match">` inside the name's link, built as a node, never parsed from the text [wish-1120, homelab 121].
//
// A tile in `error` shows "reading failed" and a Retry in place of its description and lines; `loading` is bones in the same rows;
// `empty` says "not measured" in the lines row. A tile has no actions row: one click opens it.
//
// Events (bubbling, on the card): `kp-entity-action` `{ key, id }`, `kp-entity-flag` `{ key, flag }`, `kp-entity-tick`
// `{ key, ticked }`, `kp-entity-star` `{ key, starred }`, `kp-entity-retry` `{ key }`; on the grid `kp-entity-new` and
// `kp-entity-grid-retry`. The page keeps the favourites and sorts by them; a refill with `starred` is the way back from a refusal.
// The "+2" and the "More" are the package's menu button. Nothing runs on import.

export {
    ENTITY_GRID,
    ENTITY_CARD,
    ENTITY_ACTION_EVENT,
    ENTITY_FLAG_EVENT,
    ENTITY_TICK_EVENT,
    ENTITY_STAR_EVENT,
    ENTITY_RETRY_EVENT,
    ENTITY_NEW_EVENT,
    ENTITY_GRID_RETRY_EVENT,
} from './entity-card/constants.js';
export { setEntity } from './entity-card/set.js';
export { setEntityGrid, setEntityGridState, attachEntityCards } from './entity-card/grid.js';

/** @typedef {import('./entity-card/types.js').EntityData} EntityData */
/** @typedef {import('./entity-card/types.js').EntityEmptyOptions} EntityEmptyOptions */
