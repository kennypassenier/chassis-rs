// The DI5 table of js/effects.js, part: the blueprint register, update motion, formal and the meter rounds.
// One row per keyframe name; js/effects-core/timings.js merges the parts in this order.

/** @type {Record<string, { durationMs: number, cycles: number, property: string, luminanceSteps: number[] }>} */
export const TIMINGS_FORMAL = {
    // The blueprint register [S48, LIFT_PLAN row 6]: the headline settling
    // in, and the two dimension lines extending like a tape measure (a
    // transform each, no luminance change) with their labels fading in.
    // The lede's marks and the dossier's redactions are plain transitions
    // on a later class toggle, not keyframes, so they carry no row here —
    // the same choice terminal's own redaction made [TM1].
    'kp-headline-fade': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // One fade, used twice: the brackets, then the readout behind them.
    // The two dimension lines this replaced needed four rows [scope-18].
    'kp-dim-label': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // Information that updates in place [Kenny's picks on research/update-motion,
    // 2026-10-05; js/update.js]: once per update, at the theme's
    // max(size, close) × 1.25 from themeMotion() (formal 300 ms, cyberpunk
    // 750 ms, titanium 240 ms; the CSS reads it from --kp-update-duration).
    // The steps are the opacity stops this gate parses (from/to included since
    // 2026-10-08).
    // formal's stamp: a frame that lands round the value and soaks in.
    // cyberpunk's count-down stutter [Kenny, research/cyberpunk-live,
    // 2026-10-07 02:49]: two unblurred text-shadow copies (yellow up, cyan
    // down) ticking home 6, 4, 2, 1 px in four hard steps, 0.64 of the
    // update time (480 ms); under reduced motion the copies stand still 2 px
    // out for 1.2 s and go.
    'kp-sig-cyberpunk-update-stutter': { durationMs: 480, cycles: 1, property: 'text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-update-still': { durationMs: 1200, cycles: 1, property: 'text-shadow', luminanceSteps: [] },
    // titanium's heat tint: a colour-blended band in, across and out.
    'kp-sig-titanium-update-anodise': { durationMs: 240, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1, 0] },
    // The meter with a mark, each theme's way [Kenny's round-3 picks on
    // research/character-meter, 2026-10-05]: the loading picture (loops while
    // loading), the share arriving, its re-ink or a single move when the tone
    // changes. Only terminal's caret blinks in opacity, once a second.
    'kp-sig-formal-meter-wipe-d': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-meter-wipe-o': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-meter-wipe-w': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // Formal's grammar [themes/formal/CHARACTER.md §4, Kenny, 2026-10-08]: every
    // one is a clip, a clip-path or a registered custom property that moves a
    // rule's extent; none changes a colour or an opacity but the bar's head.
    'kp-sig-formal-leave': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-leave-rtl': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-leave-pen': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-leave-pen-rtl': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-backdrop': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ledger': { durationMs: 2400, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-bar-band': { durationMs: 2400, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-bar-second': { durationMs: 2400, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-bar-head': { durationMs: 2400, cycles: Infinity, property: 'transform, opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-sig-formal-ruling': { durationMs: 860, cycles: 1, property: '--kp-fm-t', luminanceSteps: [] },
    'kp-sig-formal-loading': { durationMs: 2400, cycles: Infinity, property: '--kp-fm-l', luminanceSteps: [] },
    'kp-sig-formal-update-closed': { durationMs: 850, cycles: 1, property: '--kp-fm-u', luminanceSteps: [] },
    'kp-sig-formal-arc-outer': { durationMs: 2400, cycles: Infinity, property: '--kp-fm-a0, --kp-fm-a1', luminanceSteps: [] },
    'kp-sig-formal-arc-inner': { durationMs: 2400, cycles: Infinity, property: '--kp-fm-a0, --kp-fm-a1', luminanceSteps: [] },
    'kp-sig-formal-ruled-frame': { durationMs: 740, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ruled-frame-rtl': { durationMs: 740, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ruled-line': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ruled-line-rtl': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ruled-pen': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-ruled-pen-rtl': { durationMs: 560, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-formal-pen': { durationMs: 180, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-meter-grow-o': { durationMs: 600, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-synthwave-meter-pos': { durationMs: 1800, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-pastel-meter-drift': { durationMs: 1600, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-d': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-o': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-pastel-meter-drop-w': { durationMs: 600, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-forest-meter-wipe-o': { durationMs: 1000, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-forest-meter-wipe-o-rtl': { durationMs: 1000, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-d': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-o': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-bump-w': { durationMs: 500, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-grow-o': { durationMs: 1400, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-solstice-meter-pos': { durationMs: 4000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-d': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-o': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-knock-w': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-deco-meter-wipe-o': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-meter-scan': { durationMs: 2000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-nostromo-meter-wipe-o': { durationMs: 1600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // titanium's loading is the anodising bath on every carrier (themes/titanium/CHARACTER.md G10).
    'kp-sig-titanium-bath': { durationMs: 2200, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-titanium-meter-grow-o': { durationMs: 300, cycles: 1, property: 'scale', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-d': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-o': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-titanium-meter-jolt-w': { durationMs: 160, cycles: 1, property: 'translate', luminanceSteps: [] },
    // The meter, round 4 [Kenny's picks on research/character-meter, 2026-10-05]:
    // dark (loading and arrival redrawn), cyberpunk and grotesk
    // (high-contrast and retro have since been removed). Every loading picture loops while loading.
    'kp-sig-cyberpunk-meter-slip-o': { durationMs: 320, cycles: 1, property: 'translate', luminanceSteps: [] },
    // ── Rows added by the port session [scope-143, 2026-10-08]: every keyframe the
    // character rounds declared without a row. Generated from the stylesheets,
    // not measured in a browser: the duration is the literal, else the shortest
    // value the stylesheet gives the custom property it names (durationBound in
    // gates/check-motion.mjs, the bound the gate rates with); the cycles come
    // from the shorthand; the property is what the keyframe animates.
    // cyberpunk-register
    'kp-sig-cyberpunk-bars-1': { durationMs: 3000, cycles: Infinity, property: '--kp-cp-h1', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-2': { durationMs: 3000, cycles: 1, property: '--kp-cp-h2', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-3': { durationMs: 3000, cycles: 1, property: '--kp-cp-h3', luminanceSteps: [] },
    'kp-sig-cyberpunk-bars-4': { durationMs: 3000, cycles: 1, property: '--kp-cp-h4', luminanceSteps: [] },
    'kp-sig-cyberpunk-tear': { durationMs: 3000, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-cyberpunk-word': { durationMs: 1800, cycles: Infinity, property: 'content', luminanceSteps: [] },
    'kp-sig-cyberpunk-word-tear': { durationMs: 1800, cycles: 1, property: 'translate, clip-path, text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-lock': { durationMs: 360, cycles: 1, property: '--kp-cp-lk', luminanceSteps: [] },
    'kp-sig-cyberpunk-pen': { durationMs: 180, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-cyberpunk-dot': { durationMs: 180, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-cyberpunk-split': { durationMs: 480, cycles: 1, property: 'clip-path, box-shadow, text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-split-out': { durationMs: 480, cycles: 1, property: 'clip-path, box-shadow, text-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-split-bar-out': { durationMs: 480, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-cp-charge': { durationMs: 520, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-cp-stream-144': { durationMs: 1800, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-cp-stream-216': { durationMs: 1200, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // synthwave-register
    'kp-sw-flow': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-floor-drive': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-tile-flow': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-tile-floor-drive': { durationMs: 225, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sw-bar-fill': { durationMs: 225, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sw-bar-head': { durationMs: 225, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-set': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-sheen': { durationMs: 2600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-sw-tube': { durationMs: 2600, cycles: 1, property: 'opacity', luminanceSteps: [0.3, 1, 0.55, 1, 1] },
    'kp-sig-synthwave-climb': { durationMs: 2600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-beam': { durationMs: 2600, cycles: 1, property: 'inset-block-start', luminanceSteps: [] },
    'kp-sig-synthwave-glow': { durationMs: 2600, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 0] },
    'kp-sig-synthwave-sw-horizon': { durationMs: 225, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sw-road': { durationMs: 600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-size-rise': { durationMs: 225, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-sink': { durationMs: 225, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-synthwave-sun': { durationMs: 225, cycles: 1, property: 'translate, visibility', luminanceSteps: [] },
    'kp-sig-synthwave-update-laser': { durationMs: 225, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
};
