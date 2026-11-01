// The kp-themes modules the Status page attaches, fetched only when the
// page carries their markup.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

export async function attachStatusModules(root, kp) {
  // Only what this page carries is fetched, as kp-themes' auto.js does; the
  // theme picker and the confirmations are chassis.js's own and stay single.
  const modules = [
    ['freshness', '[data-kp-ago]', (m) => m.attachAgo(root)],
    ['patterns', '[data-kp-copy]', (m) => m.attachPatterns(root)],
    ['version-delta', '[data-kp-version-to]', (m) => m.attachVersionDeltas(root)],
    ['uptime', '[data-kp-uptime]', (m) => m.attachUptimes(root)],
    ['problems', '[data-kp-problems]', (m) => m.attachProblems(root)],
    ['kpi', '.kp-kpis[data-kp-kpis-columns]', (m) => m.attachKpiStrips(root)],
    ['statusrow', '.kp-statuslist', (m) => m.attachStatusLists(root)],
    ['card-state', '.kp-card[data-kp-state]', (m) => m.attachCardStates(root)],
    ['flash', '[data-kp-flash-button]', (m) => m.attachFlashButtons(root)],
    ['datatable', '[data-kp-datatable]', (m) => m.attachDataTables(root)],
    ['tables', '.kp-table-wrap', (m) => m.attachTableRegions(root)],
    ['menu-button', '[data-kp-menu-button]', (m) => m.attachMenuButtons(root)],
    ['lede', '.kp-lede', (m) => m.attachLedes(root)],
    ['attention', '.kp-attention', (m) => m.attachAttention(root)],
    ['loading-pieces', '.kp-kpi, .kp-card, [data-kp-datatable], [data-kp-menu-button]', (m) => m.attachLoadingPieces(root)],
    ['footprint', '.kp-ops', (m) => m.attachFootprints(root)],
    ['motion', '.kp-card, .kp-datatable, .kp-toasts', (m) => m.attachMotion(root)],
  ];
  await Promise.all(
    modules
      .filter(([, when]) => root.querySelector(when))
      .map(async ([name, , attach]) => attach(await kp(name))),
  );
  if (root.querySelector('[data-kp-disabled-reason]')) (await kp('reason')).attachDisabledReasons(root);

}
