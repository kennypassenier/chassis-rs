// The DI5 table of js/effects.js, part: the 5.0.0 register, the synthwave and alarm rows and the first theme ports.
// One row per keyframe name; js/effects-core/timings.js merges the parts in this order.

/** @type {Record<string, { durationMs: number, cycles: number, property: string, luminanceSteps: number[] }>} */
export const TIMINGS_EARLY = {
    // The 5.0.0 register [S41, C2]: the navbar strip entering, the hover
    // glitch (two steps, once), the headline's slice burst (one burst of
    // six bands, once) and the charge sweep (a transform, no luminance).
    // The synthwave register [SW1]: the tracking wipe and the shine of the
    // chrome headline, the tube that switches on (one dip), the sun cut on
    // a button, the bar entering, the floor's drift and the CRT switching
    // the boot overlay off — every one once, except the drift, which moves
    // a pattern and never changes luminance.
    // The side navigation's backdrop [feat-nav-3]: one fade in, at the
    // theme's own duration, on a layer that is already a dimming. It runs
    // once because the element is created when the panel opens and removed
    // when it closes.
    'kp-sidenav-backdrop': { durationMs: 220, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // Solstice's raking light [scope-12]: one pass of a warm band across a
    // control, on hover. The band is a gradient that fades to transparent at
    // both ends, so no edge of it is an opposing luminance change.
    'kp-rake': { durationMs: 620, cycles: 1, property: 'translate', luminanceSteps: [] },
    // Titanium's headline [scope-17]: one short linear pass as the word
    // slides square. No blur and no chromatic split — those belong to the
    // spectral instrument. Opacity 0 to 1 once, so no opposing change.
    'kp-mill': { durationMs: 340, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-tracking': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 0.35, 1, 1, 0] },
    'kp-shine': { durationMs: 1400, cycles: 1, property: 'background-position', luminanceSteps: [] },
    'kp-tube-on': { durationMs: 1100, cycles: 1, property: 'color', luminanceSteps: [0, 1, 0, 1] },
    'kp-sun-cut': { durationMs: 360, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-bar-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-floor-drift': { durationMs: 6000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-crt-off': { durationMs: 550, cycles: 1, property: 'opacity', luminanceSteps: [1, 0] },
    // The Phantom register (theme removed 2026-10-16) [PH1]: the arrival
    // card's bar and its shove out to the left; js/effects/arrival.js still
    // times a card arrival by these two rows.
    'kp-bar-run': { durationMs: 900, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-load-out': { durationMs: 640, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The Retro register (theme removed 2026-10-09) [RT1]: the dither clearing off a headline and off
    // the boot screen (four densities, one direction), the selection bar
    // dragging across a mark, the redaction brush lifting.
    'kp-dither-clear': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 1, 0] },
    'kp-dither-out': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 1, 1, 0] },
    'kp-drag-select': { durationMs: 360, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-redact-lift': { durationMs: 400, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // The alarm [scope-94]: the plate fading in, the frame's glow breathing
    // (one half-cycle per 1.4 s), the panel flickering in once (cyberpunk's
    // own keyframe since scope-100, below), each letter cell's two noise glyphs and its letter (once per
    // cell), the split copies slicing through once and then every 5 s, the
    // headline's short dip every 5 s, the detail line fading in, the caret,
    // the hazard stripes marching and the faint band sweeping down. Measured
    // from rendered frames in tests/alarm.spec.mjs as well.
    // Since scope-98 the flicker, the decode, the split, the dip, the caret,
    // the march and the sweep are cyberpunk's alone; the package's default
    // arrives whole: the panel settling and the headline arriving, once each.
    // The plate's row keeps cyberpunk's 180 ms, the shorter of the two.
    'kp-alarm-ground-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-settle': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-arrive': { durationMs: 480, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-pulse': { durationMs: 1400, cycles: Infinity, property: 'opacity', luminanceSteps: [0.4, 1] },
    // Cyberpunk's panel striking like a failing tube [scope-100], in its
    // register: 0, 0.6, a sag to 0.52 under the 10% step, 1 — one direction,
    // where the package's kp-alarm-flicker-in (0, 1, 0.3, 1) read 3.00/s.
    'kp-alarm-cyberpunk-flicker': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.6, 0.52, 1, 1] },
    'kp-alarm-jitter': { durationMs: 5000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0.6, 1] },
    'kp-alarm-slice-in': { durationMs: 600, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-alarm-slice': { durationMs: 5000, cycles: Infinity, property: 'clip-path', luminanceSteps: [] },
    'kp-alarm-decode-letter': { durationMs: 180, cycles: 1, property: 'color', luminanceSteps: [] },
    'kp-alarm-decode-noise': { durationMs: 90, cycles: 1, property: 'opacity', luminanceSteps: [1, 0] },
    'kp-alarm-detail-in': { durationMs: 300, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-alarm-caret': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-alarm-march': { durationMs: 1600, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-alarm-sweep': { durationMs: 6000, cycles: Infinity, property: 'translate', luminanceSteps: [] },
    // The Shade (dark) register (theme removed 2026-10-06) [S48, LIFT_PLAN row 24]: the headline's words
    // arriving out of a blur, the hero button and the dossier card settling
    // out of the same blur once on load, and the confirmation dialog's
    // native open/close — the last two shared with academia's, which mounts
    // its dialog the same way.
    // One keyframe for both grains since scope-100 (the two were identical):
    // the words at 600ms, the hero button and dossier card at 500ms.
    'kp-focus': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-dialog-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-backdrop-in': { durationMs: 180, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The nostromo register [S48, LIFT_PLAN row 19]: the headline and the
    // dossier stamp popping down under a clip-path, once, on load.
    'kp-popdown': { durationMs: 340, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The dark register [S48, LIFT_PLAN row 15]: the headline's word-by-word
    // resolve out of a blur, and the mark's ignite and the rule's sweep —
    // both scroll-bound (animation-timeline: view()), not time-based, so
    // their duration is the demo's own measured pace across the range
    // rather than a clock the browser runs.
    'kp-resolve': { durationMs: 640, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-ignite': { durationMs: 600, cycles: 1, property: 'color', luminanceSteps: [0, 1] },
    'kp-sweep-in': { durationMs: 600, cycles: 1, property: 'background-position', luminanceSteps: [] },
    // The solstice register [S48, LIFT_PLAN row 18]: the calibration wipe
    // over the headline, the rule draw, and the dossier's redaction lift.
    'kp-cal-slide': { durationMs: 740, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    'kp-cal-rule': { durationMs: 480, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-cal-redact': { durationMs: 320, cycles: 1, property: 'background-size', luminanceSteps: [] },
    // The mono register [S48, LIFT_PLAN row 11]: a hard-edge mask sweeping
    // once across a headline (the whole line, unsplit) or a redaction bar.
    // No luminance step: the mask moves, the content under it does not
    // change colour.
    'kp-wipe': { durationMs: 600, cycles: 1, property: 'mask-position', luminanceSteps: [] },
    // The Lapis register (theme removed 2026-10-06) [S48, LIFT_PLAN row 6]: the burnish, a single
    // clip-path wipe over the headline once, no loop.
    'kp-burnish': { durationMs: 900, cycles: 1, property: 'clip-path', luminanceSteps: [] },
    // The brutalism register [BR1]: the words dropping onto their offset and
    // the seamless marquee.
    'kp-slam': { durationMs: 260, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-marquee': { durationMs: 42000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-slice-a': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [1, 1, 0] },
    'kp-slice-1': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [1, 0, 0] },
    'kp-slice-2': { durationMs: 600, cycles: 1, property: 'opacity', luminanceSteps: [1, 0, 0] },
    'kp-slide-in': { durationMs: 140, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The base layer's shared rule draw. One keyframe, seven registers, each
    // with its own duration: nostromo 280ms, blueprint 420ms, light and retro
    // 480ms, deco 600ms, brutalism 620ms, terminal 900ms.
    // The row carries the shortest, the worst case a rate is read at; it
    // used to say 420ms, blueprint's alone [scope-100].
    'kp-rule-in': { durationMs: 280, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-settle': { durationMs: 140, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-blink': { durationMs: 1000, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 1, 0, 0] },
    'kp-drift': { durationMs: 40000, cycles: Infinity, property: 'background-position', luminanceSteps: [] },
    'kp-ember': { durationMs: 840, cycles: 1, property: 'box-shadow', luminanceSteps: [] },
    'kp-spin': { durationMs: 900, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    'kp-pulse': { durationMs: 1600, cycles: Infinity, property: 'opacity', luminanceSteps: [1, 0.6, 1] },
    // The drawer and the tour card [scope-143]: each arrives once, a fade
    // (the drawer also slides 2rem); opacity 0 to 1, no opposing change.
    'kp-drawer-in': { durationMs: 200, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-tour-in': { durationMs: 160, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The busy progress bar's sweep [scope-140]: a band a third of the
    // track wide translating across it, no luminance change of its own.
    'kp-progressbar-sweep': { durationMs: 1400, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // Cyberpunk's data stream [scope-96]: two dash tiles drifting by one
    // tile width per loop (144px and 216px in 8000ms), no luminance change.
    'kp-stream-144': { durationMs: 8000, cycles: Infinity, property: 'mask-position', luminanceSteps: [] },
    'kp-stream-216': { durationMs: 8000, cycles: Infinity, property: 'mask-position', luminanceSteps: [] },
    // The shared marquee [M1, 2026-09-08]: one transform across a doubled
    // row, no luminance change of its own, and the only loop besides
    // brutalism's hatch. The duration is a knob, so this row carries the
    // package default the base layer declares.
    'kp-marquee-pass': { durationMs: 42000, cycles: Infinity, property: 'transform', luminanceSteps: [] },
    // offset — a translate only, no luminance change.
    'kp-kento-blue': { durationMs: 700, cycles: 1, property: 'transform', luminanceSteps: [] },
    'kp-kento-red': { durationMs: 700, cycles: 1, property: 'transform', luminanceSteps: [] },
    // The pastel register [S48, LIFT_PLAN row 6]: the overprint layer's
    // spring-in (opacity, matched against its own keyframe below) and the
    // mark fill and the rule draw, both transform-free size changes with
    // no luminance step of their own.
    'kp-registration': { durationMs: 650, cycles: 1, property: 'opacity', luminanceSteps: [0, 0.55] },
    'kp-fill': { durationMs: 420, cycles: 1, property: 'background-size', luminanceSteps: [] },
    'kp-draw': { durationMs: 500, cycles: 1, property: 'width', luminanceSteps: [] },
    // The Shade (light) register (theme removed 2026-10-06) [SL2]: the headline's words resolving out
    // of a blur, the lede's marks filling in (a size, not a luminance
    // change), and the dialog rising into place.
    'kp-word-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-mark-in': { durationMs: 300, cycles: 1, property: 'background-size', luminanceSteps: [] },
    // The forest register [S48, LIFT_PLAN forest row]: the headline's own
    // fade-in and the contour trace that draws beside it, both CSS-only
    // (no routine — see css/forest-register.css's type section).
    'kp-headline-in': { durationMs: 1000, cycles: 1, property: 'translate, clip-path', luminanceSteps: [] },
    'kp-trace': { durationMs: 1000, cycles: 1, property: 'stroke-dashoffset', luminanceSteps: [] },
    // The deco register [S48, LIFT_PLAN row 8]: the cartouche's frame
    // scaling in once with the headline, and the dossier's jewel plates
    // clearing on the "Open the file" trigger, staggered 140ms apart.
    'kp-cartouche-in': { durationMs: 520, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    'kp-redaction-clear': { durationMs: 320, cycles: 1, property: 'opacity', luminanceSteps: [0, 1] },
    // The light register [S48, LIFT_PLAN, A1]: the headline's rounded clip
    // window opening once (a shape and a fade, never a loop), and the lede
    // marks' background-size sweep with its one colour swap — a highlighter
    // reveal, not a flash.
    'kp-clip-reveal': { durationMs: 700, cycles: 1, property: 'opacity', luminanceSteps: [0, 1, 1] },
    'kp-mark-sweep': { durationMs: 700, cycles: 1, property: 'filter', luminanceSteps: [] },
    // The grotesk register [S48, LIFT_PLAN row 12]: the headline's optical
    // resolve, a monotone blur+brightness sweep, once, on the whole,
    // unsplit line (`kp-sharpen-in` — not `kp-focus`/`focus`, which the
    // dark and the removed Shade (dark) registers owned for their own, different
    // mechanics). The confirmation dialog's one-shot open reuses the
    // `kp-dialog-in` row above, which nostromo (and the removed academia and Shade (dark))
    // already share.
    'kp-sharpen-in': { durationMs: 640, cycles: 1, property: 'filter', luminanceSteps: [] },
};
