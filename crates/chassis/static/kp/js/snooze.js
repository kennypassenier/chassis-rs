// The "remind me later" picker [kpadopt5-time; homelab's SNOOZE_CHOICES, Life's nudges, JobTracker's follow-ups].
//
// A reminder is put off with a few quick choices in plain words, each with the exact moment it means, so nobody has
// to work out when "1 day" falls:
//
//   <div class="kp-snooze" data-kp-snooze data-kp-snooze-choices="1h 4h tonight tomorrow monday pick"></div>
//
// The choices (Kenny, 2026-10-17: a mix of durations and moments): `1h`, `4h` (any number with m, h, d or w),
// `tonight`, `tomorrow`, `monday`, `next-week` and `pick`, the last one a panel with a date and a time. The default is
// `1h 4h tonight tomorrow monday pick`. A choice that has passed (tonight, after the evening hour) or lies past the
// longest a reminder may be put off (`data-kp-snooze-max`, 7d) is left out, not greyed. Beside each choice stands the
// exact moment it resolves to, "Sun 18/10/2026 09:00 · in 18 h 55 min", in Europe/Brussels unless `data-kp-time-zone`
// names another zone. The last custom moment that is still ahead is offered at the top ("Your last pick"); it is kept
// for the page's visit, and across visits when the element has `data-kp-remember="<name>"`.
//
// Options (markup, then the option of attachSnoozes()), each with a default [KT6]:
//   data-kp-snooze-choices  the list above
//   data-kp-snooze-morning  HH:MM that "tomorrow", "monday" and "next-week" mean          09:00
//   data-kp-snooze-evening  HH:MM that "tonight" means                                    18:00
//   data-kp-snooze-max      the longest a reminder may be put off                          7d
//   data-kp-look            chips (one row of choices, the default, Kenny 2026-10-17) | menu (a button with a menu)      chips
//   data-kp-time-zone       an IANA zone                                                   Europe/Brussels
//   data-kp-snoozed-until   an ISO moment: shows "Snoozed until …" with End snooze         none
//   data-kp-now             an ISO moment: a fixed clock for a demo or a test              the real clock
//   data-kp-snooze-words    the name of a set of words, `pause` ("Pause until…", "Paused until", "Resume now") built in, more with
//                           registerSnoozeWords(name, words); `data-kp-snooze-trigger`, `-change`, `-none`, `-end`, `-apply`, `-saving`
//                           and `-until` (with `{when}`) word one picker alone [wish-1120, homelab 125]            the reminder words
//
// A choice fires `kp-snooze` on the element: `{ until, choice }` (until is an ISO string); End snooze fires
// `kp-snooze-end`. The page stores the moment and tells the picker back with setSnoozedUntil(el, iso | null) (no
// event) and, while it saves, setSnoozeBusy(el, true), which shows the theme's spinner in the button and says no to a
// press. Nothing runs on import; attachSnoozes(root) returns a detach.
//
// Each picker is one SnoozePicker controller (js/snooze/controller.js over panel.js, on js/controller.js); the parts are
// listed in js/README.md.

import { attachAll, controllerOf } from './controller.js';
import { SNOOZE } from './snooze/choices.js';
import { SnoozePicker } from './snooze/controller.js';

export { SNOOZE, SNOOZE_EVENT, SNOOZE_END_EVENT, SNOOZE_CHOICES, registerSnoozeWords, snoozeWords, dayAt, snoozeChoices } from './snooze/choices.js';

/** @typedef {import('./snooze/choices.js').SnoozeChoice} SnoozeChoice */
/** @typedef {import('./snooze/choices.js').SnoozeRules} SnoozeRules */

/**
 * @typedef {object} SnoozeHandle
 * @property {HTMLElement} element
 * @property {() => number | null} until the moment snoozed until (ms), or null
 * @property {(until: number | string | Date | null) => void} setUntil no event
 * @property {(busy: boolean) => void} setBusy
 * @property {() => SnoozeChoice[]} choices what is offered now
 * @property {() => void} openPanel show the date and time panel
 * @property {() => void} closePanel hide it, the focus left where it is
 */

/** The handle of an attached picker. @param {Element} element @returns {SnoozeHandle | null} */
export function snooze(element) {
    return controllerOf(element, SnoozePicker)?.handle ?? null;
}

/**
 * Show a picker as snoozed until a moment, or not snoozed (null), without the event.
 * @param {Element} element @param {number | string | Date | null} until
 */
export function setSnoozedUntil(element, until) {
    snooze(element)?.setUntil(until);
}

/**
 * Show a picker at work (the page is saving the reminder): its button shows the spinner and says no to a press.
 * @param {Element} element @param {boolean} busy
 */
export function setSnoozeBusy(element, busy) {
    snooze(element)?.setBusy(busy);
}

/**
 * Open a picker's date and time panel, as the "Pick a date and time…" choice does, or close it.
 * @param {Element} element @param {boolean} [open]
 */
export function openSnoozePanel(element, open = true) {
    const h = snooze(element);
    if (open) h?.openPanel();
    else h?.closePanel();
}

/**
 * Wire every snooze picker under `root`.
 * @param {ParentNode} [root]
 * @param {{ now?: () => number }} [options]
 * @returns {() => void} detach
 */
export function attachSnoozes(root = document, { now } = {}) {
    return attachAll(root, SNOOZE, SnoozePicker, { now });
}
