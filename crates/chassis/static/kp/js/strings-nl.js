// kp's own words in Dutch [habits-1101], the dictionary a page with `<html lang="nl">` (nl, nl-BE, nl-NL, or
// `data-kp-lang="nl"` on the root) speaks without a `setStrings()`.
//
// A separate entry on purpose. js/strings/runtime.js is vendored by chassis-rs, and the vendored set must stay closed
// under import (gates/check-closure.mjs), so the runtime knows nothing about any language: it holds a register of
// dictionaries, and this module only exports the words. js/auto.js registers them as a loader, so an English page
// never downloads them; a consumer without auto.js registers them itself:
//
//   import { registerDictionary } from '@kp-soft/themes/js/strings';
//   import { NL_STRINGS } from '@kp-soft/themes/js/strings-nl';
//   registerDictionary('nl', NL_STRINGS);
//
// A key missing here stays English, and the app's own `setStrings()` always wins over this. The words live in
// js/strings/nl/, one file per group of the English files; gates/strings-nl.test.mjs reports every English key the
// Dutch does not have yet.

import { NL_ALERT_STATUS_IDMARK } from './strings/nl/alert-status-idmark.js';
import { NL_AVAILABILITY_QR_TIME } from './strings/nl/availability-qr-time.js';
import { NL_BOARD_MENU_MARKDOWN } from './strings/nl/board-menu-markdown.js';
import { NL_CALENDAR_WEEK_GANTT } from './strings/nl/calendar-week-gantt.js';
import { NL_CLAIM } from './strings/nl/claim.js';
import { NL_CONSOLE } from './strings/nl/console.js';
import { NL_DEPLIST_TRACE_ENTITY } from './strings/nl/deplist-trace-entity.js';
import { NL_DIFF_RATING } from './strings/nl/diff-rating.js';
import { NL_FEED_SEQUENCER } from './strings/nl/feed-sequencer.js';
import { NL_FOCUS } from './strings/nl/focus.js';
import { NL_FORM_DATE_COPY } from './strings/nl/form-date-copy.js';
import { NL_PASSKEYS_THREAD_CHART } from './strings/nl/passkeys-thread-chart.js';
import { NL_PIPELINE_UPTIME_TIMER } from './strings/nl/pipeline-uptime-timer.js';
import { NL_PROBLEM_GRAPH_DIAGNOSTICS } from './strings/nl/problem-graph-diagnostics.js';
import { NL_QUANTITY_CHECKLIST_FOCUS } from './strings/nl/quantity-checklist-focus.js';
import { NL_QUESTION_TRANSFER_CONN } from './strings/nl/question-transfer-conn.js';
import { NL_QUOTE_STATUS_CALM } from './strings/nl/quote-status-calm.js';
import { NL_RANGE_WEEKDAYS_RUNS } from './strings/nl/range-weekdays-runs.js';
import { NL_REQ_NOTICES } from './strings/nl/req-notices.js';
import { NL_ROWS_ATTENTION } from './strings/nl/rows-attention.js';
import { NL_SELECTION_UNDO_NEWPILL } from './strings/nl/selection-undo-newpill.js';
import { NL_SNOOZE_DATED_SLIDER } from './strings/nl/snooze-dated-slider.js';
import { NL_SPLIT_CONFIRM_CHART } from './strings/nl/split-confirm-chart.js';
import { NL_STACKBAR_BULLETS_CODE } from './strings/nl/stackbar-bullets-code.js';
import { NL_TABLE_HEAT } from './strings/nl/table-heat.js';
import { NL_TOGGLE_PALETTE_ACK } from './strings/nl/toggle-palette-ack.js';
import { NL_USES_UNSAVED_COMPARE } from './strings/nl/uses-unsaved-compare.js';
import { NL_USUAL_LOGVIEWER } from './strings/nl/usual-logviewer.js';
import { NL_UX_PARTS } from './strings/nl/ux-parts.js';
import { NL_VIEWER_PREVIEW_GALLERY } from './strings/nl/viewer-preview-gallery.js';
export { NL_KEPT_ENGLISH } from './strings/nl/kept-english.js';
/** @typedef {import('./strings/types.js').Strings} Strings */

/**
 * Every Dutch word kp writes itself, frozen. Partial: a key added in English later stays English here until it is
 * translated.
 *
 * @type {Readonly<Partial<Strings>>}
 */
export const NL_STRINGS = Object.freeze({
    ...NL_ALERT_STATUS_IDMARK,
    ...NL_AVAILABILITY_QR_TIME,
    ...NL_BOARD_MENU_MARKDOWN,
    ...NL_CALENDAR_WEEK_GANTT,
    ...NL_CLAIM,
    ...NL_CONSOLE,
    ...NL_DEPLIST_TRACE_ENTITY,
    ...NL_DIFF_RATING,
    ...NL_FEED_SEQUENCER,
    ...NL_FOCUS,
    ...NL_FORM_DATE_COPY,
    ...NL_PASSKEYS_THREAD_CHART,
    ...NL_PIPELINE_UPTIME_TIMER,
    ...NL_PROBLEM_GRAPH_DIAGNOSTICS,
    ...NL_QUANTITY_CHECKLIST_FOCUS,
    ...NL_QUESTION_TRANSFER_CONN,
    ...NL_QUOTE_STATUS_CALM,
    ...NL_RANGE_WEEKDAYS_RUNS,
    ...NL_REQ_NOTICES,
    ...NL_ROWS_ATTENTION,
    ...NL_SELECTION_UNDO_NEWPILL,
    ...NL_SNOOZE_DATED_SLIDER,
    ...NL_SPLIT_CONFIRM_CHART,
    ...NL_STACKBAR_BULLETS_CODE,
    ...NL_TABLE_HEAT,
    ...NL_TOGGLE_PALETTE_ACK,
    ...NL_USES_UNSAVED_COMPARE,
    ...NL_USUAL_LOGVIEWER,
    ...NL_UX_PARTS,
    ...NL_VIEWER_PREVIEW_GALLERY,
});
