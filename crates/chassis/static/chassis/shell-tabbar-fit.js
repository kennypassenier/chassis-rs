// The phone tab bar's labels never end in an ellipsis [fix-hsb-cycle-1].
// A label wraps to two lines first (shell.css); a single word wider than its
// tab ("TRANSLATION" in a 78 px tab of a five-tab bar) used to be cut at
// "TRANSLATI…". The label now steps down through FIT_LEVELS until its words
// fit, and the CSS gives each level a smaller size. A page that wants a
// better word still sets Page::short_label; this is the net under it.
// Pure parts (isClipped, fitLevel) are tested with node --test.

export const FIT_LEVELS = ['', 'small', 'smaller'];

// A label is clipped when its content is taller (the two-line clamp cut a
// word) or wider (a word that cannot break) than its box. One pixel of slack
// absorbs sub-pixel rounding.
export function isClipped(box) {
  return box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
}

// The first level at which `clippedAt(level)` is false; the last level when
// none fits (the label then clamps like before, never worse).
export function fitLevel(clippedAt, levels = FIT_LEVELS) {
  for (const level of levels) if (!clippedAt(level)) return level;
  return levels[levels.length - 1];
}

function fitLabel(label) {
  const level = fitLevel((candidate) => {
    if (candidate) label.dataset.fit = candidate;
    else delete label.dataset.fit;
    return isClipped(label);
  });
  if (level) label.dataset.fit = level;
  else delete label.dataset.fit;
}

// Returns nothing; `joined` collects what this file attached. Runs when the
// bar is laid out, when the window changes size and when the fonts arrive.
export function attachTabbarFit(joined) {
  const bar = document.querySelector('.chassis-tabbar');
  if (!bar) return;
  const run = () => bar.querySelectorAll('.kp-tabbar__label').forEach(fitLabel);
  run();
  if (document.fonts?.ready) document.fonts.ready.then(run);
  if (typeof ResizeObserver === 'function') new ResizeObserver(run).observe(bar);
  joined.push('tabbar-fit');
}
