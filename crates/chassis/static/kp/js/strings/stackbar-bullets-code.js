// The words of the stack bar, the bullets, code blocks and rows.

/**
 * @typedef {object} StackbarBulletsCodeStrings
 * @property {string} stackbarRest  The legend row of a share bar's free rest (js/stackbar.js)
 * @property {string} stackbarOther  The legend row the parts too small to draw are merged into
 * @property {(label: string, value: string, percent: string) => string} stackbarPart  One part, as a screen reader and the hover card read it
 * @property {(value: string) => string} stackbarOver  The free row when the parts add up to more than the whole
 * @property {(parts: string[]) => string} stackbarLabel  The bar's accessible name: every part in order
 * @property {string} stackbarLoading  A share bar being read
 * @property {string} stackbarEmpty  A share bar with nothing read yet
 * @property {string} stackbarError  A share bar that could not be read
 * @property {string} stackbarRetry  The Retry button of a failed share bar
 * @property {string} bulletsLoading  What the busy card over a bullet list says (js/bullets.js)
 * @property {string} bulletsEmpty  A bullet list with no rows, when the page gives no reason
 * @property {string} bulletsError  A bullet list that could not be read, when the page gives no sentence
 * @property {string} bulletsRetry  The Retry button of a failed bullet list
 * @property {string} bulletsUnknown  A row with nothing to measure, for a screen reader
 * @property {(figure: string, threshold: string) => string} bulletsValueText  A row's meter as a screen reader reads it
 * @property {string} codeLabel  A code block's accessible name when it has no title (js/code.js)
 * @property {string} codeWrap  The code block's Wrap toggle
 * @property {string} codePretty  The JSON view laid out with indents
 * @property {string} codeRaw  The JSON view as it came
 * @property {string} codeFormat  The accessible name of the Pretty / Raw choice
 * @property {(lines: number) => string} codeShowAll  The button under a folded block
 * @property {string} codeShowLess  The same button once the block is open
 * @property {(lines: number) => string} codeLines  The block's line count beside its title
 * @property {string} codeEmpty  A block with nothing in it
 * @property {(size: string) => string} codeBinary  A block whose content is not text
 * @property {(shown: string, total: string) => string} codeTruncated  The foot of a block that holds only the start
 * @property {string} codeLoading  What the busy card over a block says
 * @property {string} codeError  A block that could not be read, when the page gives no sentence
 * @property {(title: string) => string} codeCopiedAnnouncement  Announced after a copy, naming the block
 * @property {(n: number) => string} rowSelectCount  Said after a tick, a range or a clear: how many rows are selected (js/row-select.js) [kpadopt5]
 * @property {(n: number) => string} rowSelectSkipped  Said after a range that passed rows that cannot be selected [kpadopt5]
 * @property {(n: number) => string} rowSelectAllShown  Said after Ctrl+A: every row the table shows is ticked [kpadopt5]
 * @property {(label: string, at: number, of: number) => string} rowSelectCursor  Said when the cursor moves to a row, "INC-4471, row 3 of 12" [kpadopt5]
 * @property {string} rowSelectMode  Said when a long press starts selection mode on a phone [kpadopt5]
 * @property {string} rowSelectModeEnd  Said when selection mode ends [kpadopt5]
 * @property {string} rowKeysMove  The hint line under a selectable table: j and k [kpadopt5]
 * @property {string} rowKeysTick  The hint line: x [kpadopt5]
 * @property {string} rowKeysRange  The hint line: Shift and x [kpadopt5]
 * @property {string} rowKeysClear  The hint line: Esc [kpadopt5]
 * @property {string} rowKeysOpen  The hint line: Enter [kpadopt5]
 * @property {string} rowKeysAll  The hint line: Ctrl and A, when the table offers it [kpadopt5]
 */

/** @type {StackbarBulletsCodeStrings} */
export const STACKBAR_BULLETS_CODE_STRINGS = {
    stackbarRest: 'Free',
    stackbarOther: 'Other',
    stackbarPart: (label, value, percent) => `${label}: ${value} (${percent})`,
    stackbarOver: (value) => `Over by ${value}`,
    stackbarLabel: (parts) => parts.join('; '),
    stackbarLoading: 'Reading…',
    stackbarEmpty: 'Not read yet.',
    stackbarError: 'Could not be read.',
    stackbarRetry: 'Retry',
    bulletsLoading: 'Reading…',
    bulletsEmpty: 'Nothing to show.',
    bulletsError: 'Could not be read.',
    bulletsRetry: 'Retry',
    bulletsUnknown: 'nothing to measure',
    bulletsValueText: (figure, threshold) => `${figure}; the threshold is ${threshold}`,
    codeLabel: 'Code',
    codeWrap: 'Wrap',
    codePretty: 'Pretty',
    codeRaw: 'Raw',
    codeFormat: 'Layout',
    codeShowAll: (lines) => `Show all ${lines} lines`,
    codeShowLess: 'Show less',
    codeLines: (lines) => (lines === 1 ? '1 line' : `${lines} lines`),
    codeEmpty: 'Nothing to show.',
    codeBinary: (size) => `Binary data (${size}), not shown as text.`,
    codeTruncated: (shown, total) => `Showing the first ${shown} of ${total}.`,
    codeLoading: 'Reading…',
    codeError: 'Could not be read.',
    codeCopiedAnnouncement: (title) => `${title} copied`,
    // The rows group, formal first (js/row-select.js, selection-bar.js, undo-toast.js, newpill.js, request-inspector.js) [kpadopt5].
    rowSelectCount: (n) => (n === 0 ? 'None selected' : `${n} selected`),
    rowSelectSkipped: (n) => `${n} skipped: cannot be selected`,
    rowSelectAllShown: (n) => `All ${n} rows shown are selected`,
    rowSelectCursor: (label, at, of) => `${label}, row ${at} of ${of}`,
    rowSelectMode: 'Selection mode: tap rows to tick them',
    rowSelectModeEnd: 'Selection mode ended',
    rowKeysMove: 'move',
    rowKeysTick: 'tick',
    rowKeysRange: 'tick up to here',
    rowKeysClear: 'clear',
    rowKeysOpen: 'open',
    rowKeysAll: 'tick all shown',
};
