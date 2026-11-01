// The kp-themes parts the Storage page attaches to a fragment, fetched when
// the fragment asks for them.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// What a fragment carries is attached by its own module, fetched when the
// fragment asks for it (kp-themes' auto.js does the same for a document;
// importing that file would attach the whole shell a second time).
export const PARTS = [
  ['remember', '[data-kp-remember]', (m, r) => { m.restoreRemembered(r); m.attachRemembered(r); }],
  ['overlays', 'dialog, [data-kp-dialog-close]', (m, r) => m.attachDialogs(r)],
  ['components', '[data-kp-type-confirm]', (m, r) => m.attachTypeConfirms(r)],
  ['combobox', 'select', (m, r) => m.attachSelects(r)],
  ['forms', '.kp-switch, [data-kp-formgrid-stage], .kp-formgrid', (m, r) => { m.attachSwitches(r); m.attachFormgridStages(r); m.attachFormgridColumns(r); }],
  ['datepicker', '[data-kp-datepicker]', (m, r) => m.attachDatePickers(r)],
  ['segmented', '[data-kp-segmented]', (m, r) => m.attachSegmented(r)],
  ['steplist', '.kp-steplist', (m, r) => m.attachSteplists(r)],
  ['kpi', '.kp-kpis[data-kp-kpis-columns]', (m, r) => m.attachKpiStrips(r)],
  ['quantity', '[data-kp-quantity]', (m, r) => m.attachQuantities(r)],
  ['lede', '.kp-lede', (m, r) => m.attachLedes(r)],
  ['attention', '.kp-attention', (m, r) => m.attachAttention(r)],
  ['flash', '[data-kp-flash-button]', (m, r) => m.attachFlashButtons(r)],
  ['tables', '.kp-table-wrap', (m, r) => m.attachTableRegions(r)],
  ['datatable', '[data-kp-datatable]', (m, r) => m.attachDataTables(r)],
  ['card-state', '.kp-card[data-kp-state]', (m, r) => m.attachCardStates(r)],
  // The refresh control's "updated … ago" only counts on when the freshness
  // ticker runs; without it the line stayed at "0 s ago" (Kenny,
  // 2026-10-30, almanac and kyu). The control draws its line after attach,
  // so the ticker is asked for wherever a refresh control is.
  ['freshness', '[data-kp-refresh], [data-kp-ago]', (m, r) => m.attachAgo(r)],
  ['loading-pieces', '.kp-meter, .kp-kpi, .kp-card, [data-kp-datatable]', (m, r) => m.attachLoadingPieces(r)],
  ['motion', 'dialog.kp-dialog, .kp-datatable, .kp-field', (m, r) => m.attachMotion(r)],
  ['footprint', '.kp-ops, [data-kp-datatable]', (m, r) => m.attachFootprints(r)],
];
export const partsAttacher = (kp) => (scope) =>
  Promise.all(
    PARTS.filter(([, when]) => scope.matches?.(when) || scope.querySelector(when)).map(async ([name, , attach]) => {
      try {
        attach(await kp(name), scope);
      } catch (e) {
        console.warn(`chassis storage: ${name} did not attach`, e);
      }
    }),
  );
