// The words of the dependency list, the path trace and the entity card.

/**
 * @typedef {object} DeplistTraceEntityStrings
 * @property {(n: number) => string} deplistCount  The list's default heading, the exact count (js/deplist.js) [kpadopt6-ops]
 * @property {string} deplistReading  The heading while the rows are still being read [kpadopt6-ops]
 * @property {(from: string, to: string) => string} deplistNeeds  A row as a screen reader hears it, "paperless needs postgres" [kpadopt6-ops]
 * @property {(from: string, to: string) => string} deplistReaches  The same for a list that says what reaches what [kpadopt6-ops]
 * @property {string} deplistNeedsWord  The word between the names of a cycle, "paperless needs redis needs paperless" [kpadopt6-ops]
 * @property {(n: number) => string} deplistMore  The button that unfolds the rest, with the exact number of rows [kpadopt6-ops]
 * @property {string} deplistFewer  The button that folds it again [kpadopt6-ops]
 * @property {string} deplistEmpty  The empty plate's title when the page gives no sentence [kpadopt6-ops]
 * @property {string} deplistFailed  The failed plate's title [kpadopt6-ops]
 * @property {string} deplistFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} deplistRetry  Its action [kpadopt6-ops]
 * @property {string} deplistLoading  The words under the busy card's spinner [kpadopt6-ops]
 * @property {string} deplistRunning  The word for a needed thing that is running [kpadopt6-ops]
 * @property {string} deplistStopped  The word for a needed thing that is stopped [kpadopt6-ops]
 * @property {string} deplistUnknown  The word for a needed thing whose state is not known [kpadopt6-ops]
 * @property {string} deplistCopy  The button that copies the rows as text [kpadopt6-ops]
 * @property {string} deplistCopied  Its answer once the rows are on the clipboard [kpadopt6-ops]
 * @property {string} traceLabel  The hop list's accessible name [kpadopt6-ops]
 * @property {string} traceAllowed  The summary line when every hop lets the connection through [kpadopt6-ops]
 * @property {(hop: string, rule: string) => string} traceBlocked  The summary line when a hop refuses it, with the deciding rule when there is one [kpadopt6-ops]
 * @property {string} traceNotAll  The summary line when a hop could not be measured [kpadopt6-ops]
 * @property {string} traceAllowedWord  A hop's verdict word, allowed [kpadopt6-ops]
 * @property {string} traceRefusedWord  A hop's verdict word, refused [kpadopt6-ops]
 * @property {string} traceNotReached  The word for a hop after a refusal, which the connection never reaches [kpadopt6-ops]
 * @property {string} traceNotMeasured  The word for a hop whose verdict is not known [kpadopt6-ops]
 * @property {(rule: string) => string} traceRule  The deciding rule's chip, "Rule IoT to media" [kpadopt6-ops]
 * @property {string} traceRunning  The words under the busy card's spinner while the path is checked [kpadopt6-ops]
 * @property {string} traceEmpty  The empty plate's title before a question was asked [kpadopt6-ops]
 * @property {string} traceEmptyText  Its sentence [kpadopt6-ops]
 * @property {string} traceFailed  The failed plate's title [kpadopt6-ops]
 * @property {string} traceFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} traceRetry  Its action [kpadopt6-ops]
 * @property {string} traceCopy  The button that copies the trace as text [kpadopt6-ops]
 * @property {string} traceCopied  Its answer once the text is on the clipboard [kpadopt6-ops]
 * @property {string} traceSwap  The button that swaps source and target [kpadopt6-ops]
 * @property {string} traceKeySwap  What the swap key does in the shortcut sheet [kpadopt6-ops]
 * @property {string} traceKeyGroup  The group the swap key is listed under [kpadopt6-ops]
 * @property {(name: string) => string} entitySelect  A card's tick, named for a screen reader, "Select media" [kpadopt6-ops]
 * @property {string} entityFailed  The state word of a card that could not be read [kpadopt6-ops]
 * @property {string} entityNotMeasured  What a card says where it has nothing measured [kpadopt6-ops]
 * @property {(n: number) => string} entityMoreFlags  The "+2" button's accessible name [kpadopt6-ops]
 * @property {string} entityFlagsLabel  The name of the menu the "+2" opens [kpadopt6-ops]
 * @property {string} entityRetry  A failed card's or grid's Retry [kpadopt6-ops]
 * @property {string} entityMore  The button that opens the rest of a card's actions [kpadopt6-ops]
 * @property {string} entityMoreLabel  The name of that menu [kpadopt6-ops]
 * @property {string} entityLoading  The words under the busy card's spinner while the cards are read [kpadopt6-ops]
 * @property {string} entityGridFailed  The failed plate's title for a grid of cards [kpadopt6-ops]
 * @property {string} entityGridFailedText  Its sentence when the page gives no reason [kpadopt6-ops]
 * @property {string} entityGridEmpty  The empty plate's title for a grid with no cards [kpadopt6-ops]
 * @property {string} entityNew  The empty plate's action [kpadopt6-ops]
 * @property {(name: string) => string} entityStar  The favourite button's name, "Favourite jellyfin" [gap-entity-tiles-1019]
 * @property {string} entityOpensNew  What a screen reader adds to a link that opens a new tab [gap-entity-tiles-1019]
 * @property {string} entityTrend  The trend row's label when the data gives none [gap-entity-tiles-1019]
 * @property {string} entityTrendNone  What the trend row says where there are fewer than two readings [gap-entity-tiles-1019]
 * @property {(label: string, text: string) => string} entityTrendName  The trend line's text alternative, "CPU, last 24 h, now 34%" [gap-entity-tiles-1019]
 * @property {string} entityTileFailed  What a tile says where its app could not be read [gap-entity-tiles-1019]
 * @property {string} entityTileLoading  The busy card's words while a board of tiles is read [gap-entity-tiles-1019]
 * @property {string} entityTileGridFailed  The failed plate's title for a board of tiles [gap-entity-tiles-1019]
 * @property {string} entityTileGridEmpty  The empty plate's title for a board with no tile [gap-entity-tiles-1019]
 * @property {string} entityTileNew  The empty board's action [gap-entity-tiles-1019]
 */

/** @type {DeplistTraceEntityStrings} */
export const DEPLIST_TRACE_ENTITY_STRINGS = {
    // The dependency list (js/deplist.js) [kpadopt6-ops].
    deplistCount: (n) => `${n} ${n === 1 ? 'dependency' : 'dependencies'}`,
    deplistReading: 'Reading what depends on what',
    deplistNeeds: (from, to) => `${from} needs ${to}`,
    deplistReaches: (from, to) => `${from} reaches ${to}`,
    deplistNeedsWord: 'needs',
    deplistMore: (n) => `Show all ${n}`,
    deplistFewer: 'Show fewer',
    deplistEmpty: 'Nothing depends on these',
    deplistFailed: 'The dependencies could not be read',
    deplistFailedText: 'Try again in a moment.',
    deplistRetry: 'Retry',
    deplistLoading: 'Reading the dependencies…',
    deplistRunning: 'running',
    deplistStopped: 'stopped',
    deplistUnknown: 'unknown',
    deplistCopy: 'Copy as text',
    deplistCopied: 'Copied',
    // The path of a connection (js/path-trace.js) [kpadopt6-ops].
    traceLabel: 'The path of the connection',
    traceAllowed: 'Allowed',
    traceBlocked: (hop, rule) => (rule === '' ? `Blocked at ${hop}` : `Blocked at rule "${rule}"`),
    traceNotAll: 'Not every step could be measured',
    traceAllowedWord: 'allowed',
    traceRefusedWord: 'refused',
    traceNotReached: 'not reached',
    traceNotMeasured: 'not measured',
    traceRule: (rule) => `Rule ${rule}`,
    traceRunning: 'Checking the path…',
    traceEmpty: 'Pick a source and a target',
    traceEmptyText: 'The path they take shows here.',
    traceFailed: 'The path could not be checked',
    traceFailedText: 'Try again in a moment.',
    traceRetry: 'Retry',
    traceCopy: 'Copy as text',
    traceCopied: 'Copied',
    traceSwap: 'Swap direction',
    traceKeySwap: 'Swap source and target',
    traceKeyGroup: 'Path',
    // The entity card (js/entity-card.js) [kpadopt6-ops].
    entitySelect: (name) => `Select ${name}`,
    entityFailed: 'failed',
    entityNotMeasured: 'not measured',
    entityMoreFlags: (n) => `${n} more ${n === 1 ? 'flag' : 'flags'}`,
    entityFlagsLabel: 'More flags',
    entityRetry: 'Retry',
    entityMore: 'More',
    entityMoreLabel: 'More actions',
    entityLoading: 'Reading the stacks…',
    entityGridFailed: 'The stacks could not be read',
    entityGridFailedText: 'Try again in a moment.',
    entityGridEmpty: 'No stacks yet',
    entityNew: 'New stack',
    entityStar: (name) => `Favourite ${name}`,
    entityOpensNew: 'opens in a new tab',
    entityTrend: 'Trend',
    entityTrendNone: 'no line yet',
    entityTrendName: (label, text) => (text ? `${label}, now ${text}` : label),
    entityTileFailed: 'reading failed',
    entityTileLoading: 'Reading the apps…',
    entityTileGridFailed: 'The apps could not be read',
    entityTileGridEmpty: 'No apps yet',
    entityTileNew: 'New app',
};
