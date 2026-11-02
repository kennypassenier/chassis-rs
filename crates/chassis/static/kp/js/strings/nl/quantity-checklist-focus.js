// The Dutch words of the quantity, the checklist, the kitchen timers, the step-by-step view and the wheel [habits-1101].
/** @typedef {import('../types.js').Strings} Strings */

/**
 * Dutch puts the verb last: "3 eieren toevoegen". The verb and the unit come
 * as the app wrote them (a unit like "kWh" or a verb like "Print PDF" keeps
 * its letters); only the first letter of the verb gives way to the head, and
 * a line that starts with the verb gets its capital back.
 *
 * @param {string} head @param {string} verb @returns {string}
 */
const verbLast = (head, verb) => {
    const before = String(head).trim();
    const word = String(verb);
    if (before === '') return word.charAt(0).toUpperCase() + word.slice(1);
    return `${before} ${word.charAt(0).toLowerCase()}${word.slice(1)}`;
};

/** @type {Partial<Strings>} */
export const NL_QUANTITY_CHECKLIST_FOCUS = {
    quantityLess: (label) => (label ? `${label}, minder` : 'Minder'),
    quantityMore: (label) => (label ? `${label}, meer` : 'Meer'),
    quantityValue: (value, unit) => `${value} ${unit}`,
    acceptVerb: 'Toevoegen',
    acceptFollowsLabel: (verb, amount, unit) => verbLast(`${amount} ${unit}`, verb),
    acceptFollowsNone: (verb, unit) => verbLast(unit ?? '', verb),
    acceptFollowsReason: (unit) => (unit ? `Kies eerst hoeveel ${unit}.` : 'Kies eerst een hoeveelheid.'),
    checklistCount: (done, total) => `${done} van ${total}`,
    checklistSummary: (done, total) => `${done} van ${total} klaar`,
    checklistCheckAll: 'Alles aanvinken',
    checklistUncheckAll: 'Alles uitvinken',
    checklistClear: 'Aangevinkte wissen',
    checklistUndo: 'Ongedaan maken',
    checklistCleared: (n) => `${n} gewist`,
    checklistRestored: (n) => `${n} terug op de lijst`,
    checklistEmpty: 'Niets op de lijst.',
    checklistLoading: 'De lijst laden…',
    checklistFailed: 'De lijst kon niet gelezen worden.',
    checklistDone: (label) => `${label} klaar`,
    checklistDoneMoved: (label) => `${label} klaar, naar het einde verplaatst. Volgend item.`,
    checklistOpen: (label) => `${label} terug op de lijst`,
    timerRunning: 'Loopt',
    timerDoneWord: 'Klaar',
    timerDone: (name) => `${name} is klaar`,
    timerSpoken: (name) => `${name} is klaar`,
    timerStopRing: 'Stop',
    timerAddMinuteTo: (name) => `Nog een minuut voor ${name}`,
    timerRemove: (name) => `${name} weghalen`,
    timerEmpty: 'Er lopen geen timers.',
    timersLoading: 'De timers worden gelezen…',
    timersFailed: 'De timers konden niet gelezen worden.',
    timerLastMinute: (name) => `${name}: nog één minuut`,
    timerStartedNamed: (name, clock) => `${name} gestart, ${clock}`,
    timerAlready: (name) => `${name} loopt al`,
    focusCount: (n, total) => `Stap ${n} van ${total}`,
    focusNext: 'Volgende',
    focusPrevious: 'Terug',
    focusDone: 'Klaar',
    focusNeeds: 'Voor deze stap',
    focusTimer: (duration) => `Een timer starten · ${duration}`,
    focusReadAloud: 'Voorlezen',
    focusStopReading: 'Stoppen met voorlezen',
    focusWakeOn: 'Scherm blijft aan',
    focusWakeOff: 'Scherm mag dimmen',
    focusWakeUnsupported: 'Scherm mag dimmen: deze browser kan het niet aan houden',
    focusEmpty: 'Dit recept heeft nog geen stappen.',
    focusLoading: 'De stappen laden…',
    focusFailed: 'De stappen konden niet gelezen worden.',
    wheelSpin: 'Draaien',
    wheelSpinAgain: 'Nog eens',
    wheelIdleKiosk: 'Tik op het rad om het te laten kiezen.',
    wheelSpinKiosk: 'Het rad draaien',
    wheelResting: 'In rust',
    wheelIdle: 'Druk op Draaien om het rad te laten kiezen.',
    wheelChose: 'Het rad koos',
    wheelSpinning: 'Draait…',
    wheelOnlyOne: 'Er past er maar één: niets om te draaien',
    wheelEmpty: 'Niets past bij deze filters.',
    wheelLoading: 'De keuzes laden…',
    wheelFailed: 'De keuzes konden niet gelezen worden.',
    wheelLocked: 'Draait zodra het andere rad gekozen heeft.',
};
