// The default strings: the English of every component group, in one frozen object.
import { TOGGLE_PALETTE_ACK_STRINGS } from './toggle-palette-ack.js';
import { DEPLIST_TRACE_ENTITY_STRINGS } from './deplist-trace-entity.js';
import { ALERT_STATUS_IDMARK_STRINGS } from './alert-status-idmark.js';
import { PASSKEYS_THREAD_CHART_STRINGS } from './passkeys-thread-chart.js';
import { STACKBAR_BULLETS_CODE_STRINGS } from './stackbar-bullets-code.js';
import { SELECTION_UNDO_NEWPILL_STRINGS } from './selection-undo-newpill.js';
import { REQ_NOTICES_STRINGS } from './req-notices.js';
import { QUESTION_TRANSFER_CONN_STRINGS } from './question-transfer-conn.js';
import { TABLE_HEAT_STRINGS } from './table-heat.js';
import { FORM_DATE_COPY_STRINGS } from './form-date-copy.js';
import { SPLIT_CONFIRM_CHART_STRINGS } from './split-confirm-chart.js';
import { CALENDAR_WEEK_GANTT_STRINGS } from './calendar-week-gantt.js';
import { PIPELINE_UPTIME_TIMER_STRINGS } from './pipeline-uptime-timer.js';
import { RANGE_WEEKDAYS_RUNS_STRINGS } from './range-weekdays-runs.js';
import { SNOOZE_DATED_SLIDER_STRINGS } from './snooze-dated-slider.js';
import { VIEWER_PREVIEW_GALLERY_STRINGS } from './viewer-preview-gallery.js';
import { USES_UNSAVED_COMPARE_STRINGS } from './uses-unsaved-compare.js';
import { PROBLEM_GRAPH_DIAGNOSTICS_STRINGS } from './problem-graph-diagnostics.js';
import { QUANTITY_CHECKLIST_FOCUS_STRINGS } from './quantity-checklist-focus.js';
import { CLAIM_STRINGS } from './claim.js';
import { AVAILABILITY_QR_TIME_STRINGS } from './availability-qr-time.js';
import { CONSOLE_STRINGS } from './console.js';
import { DIFF_RATING_STRINGS } from './diff-rating.js';
import { QUOTE_STATUS_CALM_STRINGS } from './quote-status-calm.js';
import { FOCUS_STRINGS } from './focus.js';
import { USUAL_LOGVIEWER_STRINGS } from './usual-logviewer.js';
import { FEED_SEQUENCER_STRINGS } from './feed-sequencer.js';
import { ROWS_ATTENTION_STRINGS } from './rows-attention.js';
/** @typedef {import('./types.js').Strings} Strings */

/**
 * The defaults. English, by Kenny's decision of 2026-09-04 — the package
 * has to speak something, and English is the language a consumer is least
 * likely to have to replace.
 *
 * @type {Strings}
 */
export const DEFAULT_STRINGS = Object.freeze({
    ...TOGGLE_PALETTE_ACK_STRINGS,
    ...DEPLIST_TRACE_ENTITY_STRINGS,
    ...ALERT_STATUS_IDMARK_STRINGS,
    ...PASSKEYS_THREAD_CHART_STRINGS,
    ...STACKBAR_BULLETS_CODE_STRINGS,
    ...SELECTION_UNDO_NEWPILL_STRINGS,
    ...REQ_NOTICES_STRINGS,
    ...QUESTION_TRANSFER_CONN_STRINGS,
    ...TABLE_HEAT_STRINGS,
    ...FORM_DATE_COPY_STRINGS,
    ...SPLIT_CONFIRM_CHART_STRINGS,
    ...CALENDAR_WEEK_GANTT_STRINGS,
    ...PIPELINE_UPTIME_TIMER_STRINGS,
    ...RANGE_WEEKDAYS_RUNS_STRINGS,
    ...SNOOZE_DATED_SLIDER_STRINGS,
    ...VIEWER_PREVIEW_GALLERY_STRINGS,
    ...USES_UNSAVED_COMPARE_STRINGS,
    ...PROBLEM_GRAPH_DIAGNOSTICS_STRINGS,
    ...QUANTITY_CHECKLIST_FOCUS_STRINGS,
    ...CLAIM_STRINGS,
    ...AVAILABILITY_QR_TIME_STRINGS,
    ...CONSOLE_STRINGS,
    ...DIFF_RATING_STRINGS,
    ...QUOTE_STATUS_CALM_STRINGS,
    ...FOCUS_STRINGS,
    ...USUAL_LOGVIEWER_STRINGS,
    ...FEED_SEQUENCER_STRINGS,
    ...ROWS_ATTENTION_STRINGS,
});
