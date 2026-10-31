// The DI5 table of js/effects.js, part: the phantom throw and the light and dark grammars.
// One row per keyframe name; js/effects-core/timings.js merges the parts in this order.

/** @type {Record<string, { durationMs: number, cycles: number, property: string, luminanceSteps: number[] }>} */
export const TIMINGS_GRAMMARS = {
    // The Phantom throw (theme removed 2026-10-16): the `shout` headline
    // routine in js/effects/headline.js still times its words by this row.
    'kp-sig-phantom-fly': { durationMs: 700, cycles: 1, property: 'translate, rotate, scale, visibility', luminanceSteps: [] },
    // brutalism-register
    'kp-progressbar-brutalism-hop': { durationMs: 2400, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    'kp-sig-brutalism-hoist': { durationMs: 1200, cycles: Infinity, property: 'background-position-y', luminanceSteps: [] },
    'kp-sig-brutalism-tip': { durationMs: 34, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-brutalism-set': { durationMs: 34, cycles: 1, property: 'translate', luminanceSteps: [] },
    'kp-sig-brutalism-drop': { durationMs: 34, cycles: 1, property: 'translate, box-shadow', luminanceSteps: [] },
    'kp-sig-brutalism-hold': { durationMs: 1500, cycles: 1, property: 'visibility', luminanceSteps: [] },
    'kp-sig-brutalism-leave': { durationMs: 300, cycles: 1, property: 'translate, visibility', luminanceSteps: [] },
    'kp-sig-brutalism-leave-slab': { durationMs: 300, cycles: 1, property: 'translate, box-shadow, visibility', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-brutalism-update-slam': { durationMs: 300, cycles: 12, property: 'translate, filter', luminanceSteps: [] },
    'kp-sig-brutalism-meter-throw': { durationMs: 300, cycles: 1, property: 'translate', luminanceSteps: [] },
    // titanium-register
    'kp-sig-titanium-ti-facing': { durationMs: 120, cycles: Infinity, property: 'rotate', luminanceSteps: [] },
    'kp-sig-titanium-ti-stamp': { durationMs: 120, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-titanium-ti-rail': { durationMs: 120, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-titanium-ti-scribe': { durationMs: 160, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-titanium-ti-cut': { durationMs: 120, cycles: 1, property: '--kp-sig-ti-cut', luminanceSteps: [] },
    'kp-sig-titanium-ti-cutter': { durationMs: 240, cycles: 1, property: 'opacity', luminanceSteps: [1, 1] },
    'kp-sig-titanium-ti-appear': { durationMs: 120, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-titanium-size-drawer': { durationMs: 260, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-titanium-leave': { durationMs: 400, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-titanium-leave-2': { durationMs: 400, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    // pastel-register
    'kp-sig-pastel-pastel-hop': { durationMs: 420, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-pastel-flow': { durationMs: 4000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-pastel-register-sm': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 0, 1] },
    'kp-sig-pastel-pastel-pop': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-slap': { durationMs: 560, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-sheet': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-pastel-pastel-bubble': { durationMs: 420, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-progressbar-pastel-busy': { durationMs: 1600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-leave': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // forest-register
    'kp-sig-forest-sprout': { durationMs: 1000, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-forest-plant': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [0.7, 0.85, 1, 1] },
    'kp-sig-forest-grow': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-forest-grow-back': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // the palette's close, the growth played reverse
    'kp-sig-forest-root': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-sig-forest-root-back': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // the phone menu's close, the growth played reverse
    'kp-sig-forest-arrive': { durationMs: 1000, cycles: 1, property: 'translate, clip-path, filter', luminanceSteps: [] },
    'kp-sig-forest-fade': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-forest-fade-back': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-forest-ground': { durationMs: 1000, cycles: 1, property: 'background-color', luminanceSteps: [] },
    'kp-sig-forest-alarm-ring': { durationMs: 3200, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-progressbar-forest-breath': { durationMs: 6600, cycles: Infinity, property: '--kp-fo-breath', luminanceSteps: [] },
    'kp-sig-forest-leave': { durationMs: 1000, cycles: 1, property: 'translate, clip-path, filter', luminanceSteps: [] },
    'kp-sig-forest-meter-ring-d': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-forest-meter-ring-w': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-skeleton-forest-treeline': { durationMs: 6600, cycles: Infinity, property: '--kp-fo-grow', luminanceSteps: [] },
    'kp-sig-forest-update-ring': { durationMs: 1000, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-forest-edge': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // the drawer's --kp-sig-dur, the theme's growth time
    'kp-sig-forest-edge-rtl': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    // deco-register
    'kp-sig-deco-arrive': { durationMs: 480, cycles: 1, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-fan': { durationMs: 720, cycles: 1, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-wipe': { durationMs: 360, cycles: 1, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-gilded': { durationMs: 1000, cycles: 1, property: 'filter', luminanceSteps: [] },
    'kp-sig-deco-doors': { durationMs: 2400, cycles: Infinity, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-glint': { durationMs: 2400, cycles: Infinity, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-seal': { durationMs: 400, cycles: 1, property: 'custom-property', luminanceSteps: [] },
    'kp-sig-deco-deco-turn': { durationMs: 3600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-deco-deco-unfold': { durationMs: 340, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-deco-deco-grow': { durationMs: 340, cycles: 1, property: 'transform', luminanceSteps: [] },
    // Light's grammar, 2026-10-08 (themes/light/CHARACTER.md §4): the exposure
    // and its leave (opacity, 0 to 1 and 1 to 0), the filter keyframes (a
    // re-exposure, out of focus, the burnt bead, the shutter), the bead on the
    // hairline and the line exposed start to end.
    // blueprint-register
    'kp-sig-blueprint-callout': { durationMs: 300, cycles: 1, property: 'color, border-color, background-color, --kp-bp-r', luminanceSteps: [] },
    'kp-sig-blueprint-leader': { durationMs: 360, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-sig-blueprint-node': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 0, 1, 1] },
    'kp-sig-blueprint-blueprint-compass': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 1, 0] },
    'kp-sig-blueprint-blueprint-draw': { durationMs: 300, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-blueprint-blueprint-mark': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-blueprint-read': {
        durationMs: 34,
        cycles: 1,
        property: 'visibility, --kp-bp-rp, --kp-bp-nib, --kp-bp-pv, --kp-bp-rv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-trace': {
        durationMs: 300,
        cycles: 1,
        property: 'visibility, overflow, --kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-trace-out': {
        durationMs: 300,
        cycles: 1,
        property: 'visibility, overflow, --kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv',
        luminanceSteps: [],
    },
    'kp-sig-blueprint-update-read': { durationMs: 34, cycles: 1, property: '--kp-bp-p, --kp-bp-rv', luminanceSteps: [] },
    'kp-sig-blueprint-stroke': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-place': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-frame': { durationMs: 34, cycles: Infinity, property: '--kp-bp-r, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    'kp-sig-blueprint-ring': { durationMs: 34, cycles: Infinity, property: '--kp-bp-p, --kp-bp-nib, --kp-bp-pv, --kp-bp-tv', luminanceSteps: [] },
    // nostromo-register
    'kp-sig-nostromo-compute': { durationMs: 1600, cycles: Infinity, property: 'background-position-x', luminanceSteps: [] },
    'kp-sig-nostromo-raster': { durationMs: 160, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-beam': { durationMs: 160, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-nostromo-beam-layer': {
        durationMs: 160,
        cycles: 1,
        property: 'background-image, background-repeat, background-origin, background-size, background-position',
        luminanceSteps: [],
    },
    'kp-sig-nostromo-beam-layer-erase': {
        durationMs: 320,
        cycles: 1,
        property: 'background-image, background-repeat, background-origin, background-size, background-position',
        luminanceSteps: [],
    },
    'kp-sig-nostromo-lamp-on': { durationMs: 80, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-nostromo-no-reel': { durationMs: 260, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-nostromo-no-punch': { durationMs: 160, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-nostromo-hum': { durationMs: 160, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw-row-1': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] },
    'kp-sig-nostromo-redraw-row-2': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-nostromo-redraw-row-3': { durationMs: 160, cycles: Infinity, property: 'clip-path, background-position', luminanceSteps: [] }, // swapped in by animation-name on the rule that runs its sibling
    'kp-sig-nostromo-update-redraw': { durationMs: 640, cycles: 1, property: '-webkit-mask-position, mask-position', luminanceSteps: [] },
    'kp-sig-nostromo-update-beam': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-sig-nostromo-update-lamp': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [1, 1] },
    'kp-sig-nostromo-size-scan': { durationMs: 320, cycles: 1, property: 'clip-path, filter', luminanceSteps: [] },
    'kp-sig-nostromo-erase': { durationMs: 320, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // dark-register
    // The dark register's grammar [themes/dark/CHARACTER.md §4, Kenny, 2026-10-09]:
    // every pass is a mask or a clip over the part's own box, linear, with a
    // 2px line of film; the turn is a registered angle; a loop is 2400 ms.
    'kp-sig-dark-sweep': { durationMs: 880, cycles: 1, property: 'mask-size', luminanceSteps: [] },
    'kp-sig-dark-pass-line': { durationMs: 880, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1, 0, 0] },
    'kp-sig-dark-pass-live': { durationMs: 660, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1, 0] },
    'kp-sig-dark-film': { durationMs: 880, cycles: 1, property: '--kp-sig-dk-turn', luminanceSteps: [] },
    'kp-sig-dark-figure': { durationMs: 660, cycles: 1, property: '--kp-sig-dk-at', luminanceSteps: [] },
    'kp-sig-dark-lay': { durationMs: 660, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-sig-dark-comet': { durationMs: 2400, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-cyberpunk-blink': { durationMs: 1800, cycles: Infinity, property: 'box-shadow', luminanceSteps: [] },
    'kp-sig-cyberpunk-feed': { durationMs: 1800, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-synthwave-bulb': { durationMs: 900, cycles: Infinity, property: 'background-color', luminanceSteps: [] },
    'kp-sig-synthwave-chase': { durationMs: 900, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-synthwave-lane': { durationMs: 600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-pastel-tape-drift': { durationMs: 600, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-blueprint-hatch': { durationMs: 2880, cycles: Infinity, property: 'background-size', luminanceSteps: [] },
    'kp-sig-blueprint-chain': { durationMs: 960, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-nostromo-bank': { durationMs: 1600, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-dark-run': { durationMs: 2400, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-sig-dark-bars': { durationMs: 2400, cycles: Infinity, property: '--kp-sig-dk-ph', luminanceSteps: [] },
    'kp-sig-dark-tap': { durationMs: 220, cycles: 1, property: 'background-position', luminanceSteps: [] },
    'kp-sig-dark-meter-lay': { durationMs: 660, cycles: 1, property: 'mask-size', luminanceSteps: [] },
    // formal-register
    // solstice-register
    'kp-sig-solstice-solstice-arc': { durationMs: 2400, cycles: Infinity, property: 'opacity', luminanceSteps: [0, 1, 1, 0, 0] },
    'kp-sig-solstice-solstice-light': { durationMs: 3600, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-solstice-solstice-warm': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-solstice-solstice-rise': { durationMs: 640, cycles: 1, property: 'transform, clip-path', luminanceSteps: [] },
    'kp-sig-solstice-solstice-dawn': { durationMs: 560, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-sig-solstice-solstice-ember': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-progressbar-solstice-arc': { durationMs: 2400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-sig-solstice-size-rise': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    'kp-sig-solstice-leave': { durationMs: 540, cycles: 1, property: 'opacity', luminanceSteps: [0] },
    // ── end of the port session's rows
};
