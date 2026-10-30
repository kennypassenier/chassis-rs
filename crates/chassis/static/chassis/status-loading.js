// The Status page's figures in their loading state: skeleton bars where the
// values go.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// A read somebody asked for shows that it is reading, in each part's own
// loading state: the cards' loading card, the figures' skeletons, the
// availability strip's loading cells. `scope` is 'page' or the cards a
// button or a Try again belongs to. A read that fails leaves the cards in
// their failed state with their own Try again (the page's, for 'page').
export function drawKpisLoading(root, setMeter) {
  for (const tile of root.querySelectorAll('.kp-ops__kpis .kp-kpi')) {
    tile.setAttribute('aria-busy', 'true');
    for (const [slot, width, height] of [['.kp-kpi__value', '6ch', '1.75rem'], ['.kp-kpi__trend', '80%', null]]) {
      const el = tile.querySelector(slot);
      if (!el) continue;
      const bar = document.createElement('span');
      bar.className = 'kp-skeleton';
      bar.style.inlineSize = width;
      if (height) bar.style.setProperty('--kp-skeleton-height', height);
      el.replaceChildren(bar);
    }
    const meter = tile.querySelector('.kp-kpi__meter');
    if (meter) setMeter(meter, { loading: true, label: 'Parts that can do their work' });
  }
}
