// The words of the alert, the attention band, the age words, steps, status rows, cards, facets and id marks.

/**
 * @typedef {object} AlertStatusIdmarkStrings
 * @property {string} alertSuccess
 * @property {string} alertWarning
 * @property {string} alertInfo
 * @property {string} alertError
 * @property {string} attentionCritical  The word a screen reader hears before a critical problem on the attention band (setAttention) [scope-143]
 * @property {string} attentionWarning  The same, before a warning [scope-143]
 * @property {string} attentionInfo  The same, before an information [scope-143]
 * @property {(verb: string, duration: string) => string} agoText  A ticking freshness line, "updated 12 s ago" (js/freshness.js) [scope-143]
 * @property {(verb: string) => string} agoNever  The same line with no moment yet, "not updated yet" [scope-143]
 * @property {(n: number) => string} agoSeconds  A duration's seconds part, "12 s" [scope-143]
 * @property {(n: number) => string} agoMinutes  Its minutes part, "2 min" [scope-143]
 * @property {(n: number) => string} agoHours  Its hours part, "3 h" [scope-143]
 * @property {(n: number) => string} agoDays  Its days part, "1 day", "2 days" [scope-143]
 * @property {string} agoVerb  The verb a freshness line uses when its element names none [scope-143]
 * @property {(text: string) => string} agoStale  What a freshness line with `data-kp-ago-announce="state"` announces once it turns stale [scope-143]
 * @property {(text: string) => string} agoFresh  What it announces once it is fresh again [scope-143]
 * @property {string} agoInLiveRegion  The console warning for a ticking line inside a live region [scope-143]
 * @property {string} stepPending  A step list's waiting step, as a screen reader hears it (js/steplist.js)
 * @property {string} stepRunning  The step being run
 * @property {string} stepDone  A finished step
 * @property {string} stepFailed  A step that failed
 * @property {string} stepSkipped  A step that was left out
 * @property {string} stepCurrent  The step a journey stands at now, neither running nor done (`data-state="current"`) [kpadopt4]
 * @property {(title: string, state: string) => string} stepAnnounce  What the list's status region says when a step changes, "Pull the images: running"
 * @property {string} statusOk  A status row that is fine, as a screen reader hears it (js/statusrow.js)
 * @property {string} statusLoading  A status row still being read
 * @property {string} statusFailed  A status row that failed
 * @property {string} statusEmpty  A status row with nothing to show
 * @property {string} statusWarn  A status row that passes with a reservation, `data-state="warn"` [kpadopt4-rows]
 * @property {string} cardLoading  What a loading card's busy card says under its spinner (js/card-state.js) [kpadopt4-rows]
 * @property {string} cardEmpty  An empty card's note when the page gives no title [kpadopt4-rows]
 * @property {string} cardFailed  A failed card's note when the page gives no title [kpadopt4-rows]
 * @property {string} cardRetry  The Try again button of a failed card [kpadopt4-rows]
 * @property {string} statusRetry  The Retry button of a failed status row
 * @property {(label: string) => string} statusRetryLabel  That button's accessible name, "Retry vault"
 * @property {(label: string, state: string, detail: string) => string} statusAnnounce  What the list's status region says when a row changes, "vault: failed, The host did not answer"
 * @property {(count: number, failed: number) => string} statusAnnounceMany  What it says when more than three rows change in one tick, "12 updated, 2 failed"
 * @property {string} facetOnly  The "only" button's text on a facet row (js/facets.js)
 * @property {(label: string) => string} facetOnlyLabel  That button's accessible name, "Show only Host"
 * @property {string} facetAll  The "Everything" row's text when the group gives none
 * @property {(label: string) => string} facetShowingOnly  What a facet group's status region says after "only", "Showing only Host"
 * @property {string} facetShowingAll  What it says after "Everything"
 * @property {string} idmarkUnknown  The glyph of an identity mark with no name (js/idmark.js) [kpadopt4-data]
 * @property {string} idmarkOnline  A mark's status word, online (js/idmark.js) [kpadopt5-people]
 * @property {string} idmarkAway  A mark's status word, away
 * @property {string} idmarkBusy  A mark's status word, busy
 * @property {(name: string, status: string) => string} idmarkLabel  A mark with a status as a screen reader hears it, "Ada, online"
 * @property {(count: number) => string} idmarkGroup  A group of marks, named by its size, "5 people"
 * @property {(count: number) => string} idmarkMore  The "+N" button of a group, "Show the 3 more people"
 * @property {(count: number) => string} idmarkMoreTitle  The heading of the list the "+N" opens, "3 more people"
 */

/** @type {AlertStatusIdmarkStrings} */
export const ALERT_STATUS_IDMARK_STRINGS = {
    alertSuccess: 'Success',
    alertWarning: 'Warning',
    alertInfo: 'Info',
    alertError: 'Error',
    // The attention band's severities, for a screen reader [scope-143].
    attentionCritical: 'Critical',
    attentionWarning: 'Warning',
    attentionInfo: 'Information',
    // A ticking freshness line [scope-143]: exact numbers, the two largest
    // units, a zero part left out ("2 min", "2 min 5 s", "1 day 1 h").
    agoText: (verb, duration) => `${verb} ${duration} ago`,
    agoNever: (verb) => `not ${verb} yet`,
    agoSeconds: (n) => `${n} s`,
    agoMinutes: (n) => `${n} min`,
    agoHours: (n) => `${n} h`,
    agoDays: (n) => (n === 1 ? '1 day' : `${n} days`),
    agoVerb: 'updated',
    agoStale: (text) => `${text}, out of date`,
    agoFresh: (text) => `${text}, up to date`,
    agoInLiveRegion:
        'kp-themes: a ticking freshness line (data-kp-ago) sits inside a live region, so a screen reader would hear it every second. It is silenced (aria-live="off"); move it out of the region, or use data-kp-ago-announce="state".',
    // A step list's states and its announcement (js/steplist.js).
    stepPending: 'waiting',
    stepRunning: 'running',
    stepDone: 'done',
    stepFailed: 'failed',
    stepSkipped: 'skipped',
    stepCurrent: 'current',
    stepAnnounce: (title, state) => `${title}: ${state}`,
    // A status row's states, its Retry and its announcement (js/statusrow.js).
    statusOk: 'ok',
    statusLoading: 'loading',
    statusFailed: 'failed',
    statusEmpty: 'nothing to show',
    statusWarn: 'needs attention',
    // A card's data states (js/card-state.js).
    cardLoading: 'Loading…',
    cardEmpty: 'Nothing to show yet.',
    cardFailed: 'Could not be read.',
    cardRetry: 'Try again',
    statusRetry: 'Retry',
    statusRetryLabel: (label) => `Retry ${label}`,
    statusAnnounce: (label, state, detail) => (detail ? `${label}: ${state}, ${detail}` : `${label}: ${state}`),
    statusAnnounceMany: (count, failed) => (failed ? `${count} updated, ${failed} failed` : `${count} updated`),
    // A facet list's "only" button and its announcements (js/facets.js).
    facetOnly: 'only',
    facetOnlyLabel: (label) => `Show only ${label}`,
    facetAll: 'Everything',
    facetShowingOnly: (label) => `Showing only ${label}`,
    facetShowingAll: 'Showing everything',
    // Data pieces [kpadopt4-data]: the identity mark, the share bar, the bullet list and the code block.
    idmarkUnknown: '?',
    // People [kpadopt5-people]: the avatar, the sign-in methods list, the conversation and the chart's markers.
    idmarkOnline: 'online',
    idmarkAway: 'away',
    idmarkBusy: 'busy',
    idmarkLabel: (name, status) => `${name}, ${status}`,
    idmarkGroup: (count) => `${count} ${count === 1 ? 'person' : 'people'}`,
    idmarkMore: (count) => `Show the ${count} more ${count === 1 ? 'person' : 'people'}`,
    idmarkMoreTitle: (count) => `${count} more ${count === 1 ? 'person' : 'people'}`,
};
