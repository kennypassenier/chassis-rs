// The DI5 table of js/effects.js: the three parts merged in the order the rows were written in.

import { TIMINGS_EARLY } from './timings-early.js';
import { TIMINGS_FORMAL } from './timings-formal.js';
import { TIMINGS_GRAMMARS } from './timings-grammars.js';

/**
 * DI5 for every animation the package runs [TH129, T20, AR40].
 *
 * One row per keyframe name: how long, how often, what moves, and the
 * opacity at each keyframe step (the luminance the gate rates). The
 * register's keyframes carry no comment of their own; this is the table
 * and gates/check-motion.mjs refuses a keyframe without a row or a row
 * whose steps drift from its keyframe. Rates are reported, never
 * corrected (S42).
 *
 * @type {Readonly<Record<string, { durationMs: number, cycles: number, property: string, luminanceSteps: number[] }>>}
 */

export const TIMINGS = Object.freeze({ ...TIMINGS_EARLY, ...TIMINGS_FORMAL, ...TIMINGS_GRAMMARS });
