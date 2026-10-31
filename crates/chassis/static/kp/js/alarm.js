// The alarm: a full-screen dramatic alert, framework-free [scope-94].
//
// Bigger than a toast on purpose. A toast is polite, positioned and
// stackable; an alarm owns the whole screen until it is dealt with, the way
// a film shows a lockout: a code line, one huge word, the reason under it
// and a single way out. Kenny approved the prototype in research/alarm/
// (2026-09-15, scope-94) with the full drama in every theme and an auto mode
// that blocks the page like the acknowledged one.
//
// What is hard here the browser does, as for every dialog in this package:
// `showModal()` puts the alarm in the top layer, makes the page behind it
// inert (nothing there can be clicked or tabbed to), keeps focus inside and
// hands focus back when it closes. This file adds the two ways out and the
// countdown:
//
//   mode: 'ack'   only its button closes it (a click, Enter or Space).
//                 Escape does nothing unless `escape: true`; a click outside
//                 the words never closes it.
//   mode: 'auto'  closes by itself after `seconds`, with a shrinking bar;
//                 Escape closes it; the first Tab reaches Keep open, which
//                 stops the countdown and turns it into an ack alarm.
//
// The promise resolves with why it closed: 'ack', 'timeout' or 'escape'.
// Every word the component adds itself comes from js/strings.js; the
// headline, the detail and the code line are the caller's.
//
// Motion is the stylesheet's alone (css/components.css, `.kp-alarm`, and
// each register): the package's arrival and a register's own (cyberpunk's
// decode and flicker, since scope-98 its alone) run only under
// `prefers-reduced-motion: no-preference`, so nothing here reads the
// preference. The tree keeps every part a register may opt into — the
// letter cells with their noise glyphs, the split copies' text, the scan and
// the bars — so both channels render the same tree in every theme. The countdown writes two numbers, a continuous share and the
// whole-second share, and the stylesheet picks the second when the reader
// asked for less motion, so the bar steps instead of sliding.

import { buildAlarm } from './alarm/build.js';
import { AlarmSession } from './alarm/session.js';
import { attachTriggers } from './alarm/trigger.js';

export { ALARM_CLOSE_EVENT, ALARM_OPEN_EVENT, ALARM_SECONDS } from './alarm/values.js';
export { noiseGlyph, glyphCells } from './alarm/glyphs.js';
export { buildAlarm } from './alarm/build.js';
export { writeCountdown } from './alarm/countdown.js';

/**
 * @typedef {object} AlarmOptions
 * @property {string} title  The huge word(s). Also the alarm's accessible name.
 * @property {string} [detail]  The line under the headline: what happened and what follows.
 * @property {string} [code]  The small line above the headline ("Security protocol 7 · lockout").
 * @property {'ack' | 'auto'} [mode]  'ack' (default): only its button closes it. 'auto': closes after `seconds`.
 * @property {number} [seconds]  Auto only. Default 8, at least 1.
 * @property {boolean} [escape]  Ack only: Escape closes it as well. An auto alarm always accepts Escape.
 * @property {string} [action]  The button's label. Default: the dictionary's `alarmAction`.
 * @property {Partial<import('./strings.js').Strings>} [strings]  Per-alarm words, over the dictionary.
 * @property {HTMLElement | null} [trigger]  Where focus returns and the close event is dispatched. Default: what had focus.
 */

/** @typedef {'ack' | 'timeout' | 'escape'} AlarmReason */

/**
 * Raise a full-screen alarm and wait for it to close.
 *
 *   const reason = await showAlarm({ title: 'Access denied', detail: '…', mode: 'ack' });
 *
 * @param {AlarmOptions} options
 * @returns {Promise<AlarmReason>}
 */
export function showAlarm(options) {
    const { mode = 'ack', escape = false } = options;
    const trigger = options.trigger !== undefined ? options.trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { dialog, ack, keep, when, left, strings, action, seconds } = buildAlarm(options);
    return new Promise((resolve) => {
        const session = new AlarmSession(dialog, { ack, keep, when, left, strings, action, seconds, mode, escape, trigger, resolve });
        try {
            session.connect();
            session.open();
        } catch (error) {
            session.destroy();
            throw error;
        }
    });
}

/**
 * Wire `[data-kp-alarm]` triggers: a press raises the alarm the trigger
 * describes, and the close event is dispatched on the trigger with the
 * reason. The value of `data-kp-alarm` is the headline.
 *
 *   <button type="button" class="kp-button kp-button--destructive"
 *           data-kp-alarm="Access denied"
 *           data-kp-alarm-code="Security protocol 7 · lockout"
 *           data-kp-alarm-detail="Three failed attempts. This console is locked."
 *           data-kp-alarm-mode="auto" data-kp-alarm-seconds="6">Test the alarm</button>
 *
 * `data-kp-alarm-escape` (present) lets Escape close an acknowledged alarm;
 * `data-kp-alarm-action` names its button.
 *
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('./strings.js').Strings> }} [options]
 * @returns {() => void} detach
 */
export function attachAlarms(root = document, { strings } = {}) {
    return attachTriggers(root, { strings, show: showAlarm });
}
