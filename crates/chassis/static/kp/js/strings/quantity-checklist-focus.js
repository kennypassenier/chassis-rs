// The words of quantities, checklists, timers, the focus steps and the wheel.

/**
 * @typedef {object} QuantityChecklistFocusStrings
 * @property {(label: string) => string} quantityLess  The minus button's name, "Portions, less" (js/quantity.js) [kpadopt4]
 * @property {(label: string) => string} quantityMore  The plus button's name, "Portions, more" [kpadopt4]
 * @property {(value: string, unit: string) => string} quantityValue  The value with its unit, as a screen reader hears it, "6 portions" [kpadopt4]
 * @property {string} acceptVerb  The verb of a button that follows a quantity, when the button names none: "Add" (js/accept-follows.js) [mc-r2]
 * @property {(verb: string, amount: string, unit: string) => string} acceptFollowsLabel  The button's words for an amount: "Add 3 boxes" [mc-r2]
 * @property {(verb: string, unit: string) => string} acceptFollowsNone  The button's words while the amount makes no sense: "Add boxes" [mc-r2]
 * @property {(unit: string) => string} acceptFollowsReason  Why that button is off: "Choose how many boxes first." [mc-r2]
 * @property {(done: number, total: number) => string} checklistCount  A checklist group's count beside its heading, "4 of 9" (js/checklist.js) [kpadopt4]
 * @property {(done: number, total: number) => string} checklistSummary  The whole list's count in its bar, "4 of 9 done" [kpadopt4]
 * @property {string} checklistCheckAll  The bar's button that ticks every item [kpadopt4]
 * @property {string} checklistUncheckAll  The bar's button that takes the tick off every item [cook-1017]
 * @property {string} checklistClear  The bar's button that takes the ticked items away [kpadopt4]
 * @property {string} checklistUndo  The button that brings them back [kpadopt4]
 * @property {(n: number) => string} checklistCleared  The bar's line after a clear, "3 cleared" [kpadopt4]
 * @property {(n: number) => string} checklistRestored  Said after Undo [kpadopt4]
 * @property {string} checklistEmpty  An empty checklist [kpadopt4]
 * @property {string} checklistLoading  The words under a loading checklist's spinner [kpadopt4]
 * @property {string} checklistFailed  A checklist that could not be read, when the page gives no message [kpadopt4]
 * @property {(label: string) => string} checklistDone  Said when an item is ticked [kpadopt4]
 * @property {(label: string) => string} checklistDoneMoved  Said when an item is ticked with the keyboard and sank [kpadopt4]
 * @property {(label: string) => string} checklistOpen  Said when an item is unticked [kpadopt4]
 * @property {string} timerRunning  A kitchen timer's state word while it runs (js/timer.js) [kpadopt4]
 * @property {string} timerDoneWord  Its state word once it has ended [kpadopt4]
 * @property {(name: string) => string} timerDone  The large line on an ended timer, its notification and its alert, "Rice is done" [kpadopt4]
 * @property {(name: string) => string} timerSpoken  What a timer says aloud when it ends and the list speaks, "Rice is done" [cook-1017]
 * @property {string} timerStopRing  The button on an ended timer that stops it and takes it away [kpadopt4]
 * @property {(name: string) => string} timerAddMinuteTo  That button's accessible name [kpadopt4]
 * @property {(name: string) => string} timerRemove  The remove button's accessible name and tooltip [kpadopt4]
 * @property {string} timerEmpty  A list with no timer [kpadopt4]
 * @property {string} timersLoading  The busy card over a timer list that is being read [r6r8-1019]
 * @property {string} timersFailed  A timer list that could not be read, when the page gives no message [r6r8-1019]
 * @property {(name: string) => string} timerLastMinute  Said once when a timer has a minute left [kpadopt4]
 * @property {(name: string, clock: string) => string} timerStartedNamed  Said when a kitchen timer starts, with its name and its clock [kpadopt4]
 * @property {(name: string) => string} timerAlready  Said when a starter is pressed while its timer runs [kpadopt4]
 * @property {(n: number, total: number) => string} focusCount  The count over a step shown on its own, "Step 3 of 8" (js/focus-steps.js) [kpadopt4]
 * @property {string} focusNext  The button that goes on to the next step [kpadopt4]
 * @property {string} focusPrevious  The button that goes back a step [kpadopt4]
 * @property {string} focusDone  The next button on the last step [kpadopt4]
 * @property {string} focusNeeds  The heading over what a step needs [kpadopt4]
 * @property {(duration: string) => string} focusTimer  A step's timer button, "Start a timer · 10 min" [kpadopt4]
 * @property {string} focusReadAloud  The button that reads the step aloud [kpadopt4]
 * @property {string} focusStopReading  The same button while it reads [kpadopt4]
 * @property {string} focusWakeOn  The screen line while the screen is kept on [kpadopt4]
 * @property {string} focusWakeOff  The screen line when it is not [kpadopt4]
 * @property {string} focusWakeUnsupported  The screen line in a browser that cannot keep it on [kpadopt4]
 * @property {string} focusEmpty  A view with no steps [kpadopt4]
 * @property {string} focusLoading  The words under its spinner while the steps load [kpadopt4]
 * @property {string} focusFailed  Steps that could not be read, when the page gives no message [kpadopt4]
 * @property {string} wheelSpin  The button in the middle of a wheel that picks (js/wheel.js) [kpadopt4]
 * @property {string} wheelSpinAgain  The same button once the wheel has chosen [kpadopt4]
 * @property {string} wheelIdleKiosk  The same line on a kiosk wheel, which has no button [hover-wheel-1019]
 * @property {string} wheelSpinKiosk  The name of a kiosk wheel for a screen reader: it is the one control [hover-wheel-1019]
 * @property {string} wheelResting  Added to a resting choice's tooltip [hover-wheel-1019]
 * @property {string} wheelIdle  The line under a wheel that has not spun yet [kpadopt4]
 * @property {string} wheelChose  The line over the outcome, "The wheel chose" [kpadopt4]
 * @property {string} wheelSpinning  The line while it turns [kpadopt4]
 * @property {string} wheelOnlyOne  The line over the outcome when there was only one choice [kpadopt4]
 * @property {string} wheelEmpty  A wheel with no choices, when the page gives no sentence [kpadopt4]
 * @property {string} wheelLoading  The words under its spinner while the choices load [kpadopt4]
 * @property {string} wheelFailed  Choices that could not be read, when the page gives no message [kpadopt4]
 */

/** @type {QuantityChecklistFocusStrings} */
export const QUANTITY_CHECKLIST_FOCUS_STRINGS = {
    // A quantity with minus and plus (js/quantity.js) [kpadopt4].
    quantityLess: (label) => (label ? `${label}, less` : 'Less'),
    quantityMore: (label) => (label ? `${label}, more` : 'More'),
    quantityValue: (value, unit) => `${value} ${unit}`,
    // A button whose words follow a quantity in its dialog (js/accept-follows.js) [mc-r2].
    acceptVerb: 'Add',
    acceptFollowsLabel: (verb, amount, unit) => `${verb} ${amount} ${unit}`.trim(),
    acceptFollowsNone: (verb, unit) => `${verb} ${unit}`.trim(),
    acceptFollowsReason: (unit) => (unit ? `Choose how many ${unit} first.` : 'Choose an amount first.'),
    // A checklist (js/checklist.js) [kpadopt4].
    checklistCount: (done, total) => `${done} of ${total}`,
    checklistSummary: (done, total) => `${done} of ${total} done`,
    checklistCheckAll: 'Check all',
    checklistUncheckAll: 'Uncheck all',
    checklistClear: 'Clear checked',
    checklistUndo: 'Undo',
    checklistCleared: (n) => `${n} cleared`,
    checklistRestored: (n) => `${n} back on the list`,
    checklistEmpty: 'Nothing on the list.',
    checklistLoading: 'Loading the list…',
    checklistFailed: 'The list could not be read.',
    checklistDone: (label) => `${label} done`,
    checklistDoneMoved: (label) => `${label} done, moved to the end. Next item.`,
    checklistOpen: (label) => `${label} back on the list`,
    // Kitchen timers (js/timer.js) [kpadopt4].
    timerRunning: 'Running',
    timerDoneWord: 'Done',
    timerDone: (name) => `${name} is done`,
    timerSpoken: (name) => `${name} is done`,
    timerStopRing: 'Stop',
    timerAddMinuteTo: (name) => `One more minute for ${name}`,
    timerRemove: (name) => `Remove ${name}`,
    timerEmpty: 'No timers running.',
    timersLoading: 'Reading the timers…',
    timersFailed: 'The timers could not be read.',
    timerLastMinute: (name) => `${name}: one minute left`,
    timerStartedNamed: (name, clock) => `${name} started, ${clock}`,
    timerAlready: (name) => `${name} is already running`,
    // One step at a time (js/focus-steps.js) [kpadopt4].
    focusCount: (n, total) => `Step ${n} of ${total}`,
    focusNext: 'Next',
    focusPrevious: 'Back',
    focusDone: 'Done',
    focusNeeds: 'For this step',
    focusTimer: (duration) => `Start a timer · ${duration}`,
    focusReadAloud: 'Read aloud',
    focusStopReading: 'Stop reading',
    focusWakeOn: 'Screen stays on',
    focusWakeOff: 'Screen may dim',
    focusWakeUnsupported: 'Screen may dim: this browser cannot keep it on',
    focusEmpty: 'This recipe has no steps yet.',
    focusLoading: 'Loading the steps…',
    focusFailed: 'The steps could not be read.',
    // A wheel that picks (js/wheel.js) [kpadopt4].
    wheelSpin: 'Spin',
    wheelSpinAgain: 'Again',
    wheelIdleKiosk: 'Tap the wheel to let it choose.',
    wheelSpinKiosk: 'Spin the wheel',
    wheelResting: 'Resting',
    wheelIdle: 'Press Spin to let the wheel choose.',
    wheelChose: 'The wheel chose',
    wheelSpinning: 'Turning…',
    wheelOnlyOne: 'Only one fits: nothing to spin',
    wheelEmpty: 'Nothing fits these filters.',
    wheelLoading: 'Loading the choices…',
    wheelFailed: 'The choices could not be read.',
};
