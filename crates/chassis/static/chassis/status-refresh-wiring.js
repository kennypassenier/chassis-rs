// The status page's refresh triggers: the header's refresh control, the
// page-level Retry, a failed row's Retry, and the Try again of a card or
// table. Each one routes into a quiet read or a loud re-read.
export function wireRefresh(ctx) {
  const { root } = ctx;
  const retryCard = (event) => {
    const card = event.target.closest('.kp-card[data-chassis-section]');
    if (!card) return;
    if (card.matches('[data-chassis-json]')) ctx.loadJson(card);
    else ctx.reread([card]).catch(() => {});
  };

  // The table's own Try again reads its card again.
  root.addEventListener('kp-datatable-retry', retryCard);

  root.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-chassis-retry]')) return;
    try {
      await ctx.reread('page');
    } catch (_) {
      /* the plate is back */
    }
  });

  // The kit's refresh tick (chassisRefresh, ux-chassis-10): the page reads,
  // the control keeps the line. A failed read returns false, so the control says so.
  // The first read after the page is drawn shows that it reads, in every
  // part's own loading state (and its failed plate when the service does not
  // answer); the reads after it are quiet.
  let firstRead = true;
  window.chassisRefresh.onTick(async () => {
    try {
      if (firstRead) {
        firstRead = false;
        await ctx.reread('page');
      } else await ctx.refreshAll();
      ctx.failures = 0;
      ctx.showFailure(false);
    } catch (_) {
      ctx.failures += 1;
      // One blip is the refresh line's to report; a second in a row means
      // the numbers on the page can no longer be trusted.
      if (ctx.failures >= 2) ctx.showFailure(true);
      return false;
    }
  });

  // A failed row's Retry reads the status again; the rest of the page
  // follows, so a row never keeps saying "loading".
  root.addEventListener(
    'kp-status-retry',
    async (event) => {
      const list = event.target.closest('.kp-statuslist');
      const id = event.detail?.id ?? event.detail?.key;
      if (list && id) ctx.setStatus(list, id, { state: 'loading', detail: 'Reading again…' });
      try {
        await ctx.refreshAll({ force: true });
      } catch (_) {
        if (list && id) ctx.setStatus(list, id, { state: 'failed', detail: 'The service did not answer' });
      }
    },
    true,
  );

  root.addEventListener('kp-card-retry', (event) => {
    const card = event.target.closest('.kp-card[data-kp-state]');
    if (!card) return;
    if (card.matches('[data-chassis-json]')) ctx.loadJson(card);
    else ctx.reread([card]).catch(() => {});
  });
}
