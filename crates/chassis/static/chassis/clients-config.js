// The Clients page's fixed settings: filter words, the State column, the
// poll interval and the kp modules the page loads.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// What each figure searches for in the State column. The words are the ones
// the server writes in the badges.
export const CLIENTS_FILTER_WORDS = { 'in use': 'active', idle: 'idle', new: 'not used yet', revoked: 'revoked' };
// The State column: Client is the first.
export const CLIENTS_STATE_COLUMN = 1;
export const CLIENTS_POLL_MS = 5000;

// [selector the module is for, module, what it attaches]. The same
// selectors js/auto.js asks; the page loads only what it carries.
export const CLIENTS_MODULES = [
  ['[data-kp-remember]', 'remember', 'attachRemembered'],
  ['.kp-lede', 'lede', 'attachLedes'],
  ['.kp-kpis[data-kp-kpis-columns]', 'kpi', 'attachKpiStrips'],
  ['.kp-table-wrap', 'tables', 'attachTableRegions'],
  ['[data-kp-datatable]', 'datatable', 'attachDataTables'],
  ['[data-kp-idmark]', 'idmark', 'attachIdmarks'],
  ['.kp-steplist', 'steplist', 'attachSteplists'],
  ['[data-kp-art]', 'art', 'attachArt'],
  ['[data-kp-problems]', 'problems', 'attachProblems'],
  ['[data-kp-refresh]', 'auto-refresh', 'attachRefresh'],
  // The refresh line counts on only with the freshness ticker (see Storage).
  ['[data-kp-refresh], [data-kp-ago]', 'freshness', 'attachAgo'],
  ['.kp-ops', 'footprint', 'attachFootprints'],
  ['dialog.kp-dialog, .kp-datatable', 'motion', 'attachMotion'],
  ['.kp-card, [data-kp-datatable]', 'loading-pieces', 'attachLoadingPieces'],
];
