// Building a snooze picker's parts: the bar (a row of chips or a menu button, and End snooze), the status line, and the
// date and time panel on the popover plate.

/** @typedef {ReturnType<typeof import('./choices.js').snoozeWords>} Words */

/** @param {Document} doc @param {string} tag @param {string} className @param {string} [text] */
function make(doc, tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** @param {Document} doc @param {string} className @param {string} [text] */
function button(doc, className, text) {
    const b = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    b.type = 'button';
    b.className = className;
    if (text !== undefined) b.textContent = text;
    return b;
}

/**
 * The bar and the status line. The trigger is a button with a menu, or one row of chips; both end in the same list of choices.
 * @param {Document} doc @param {Words} s @param {string} id @param {boolean} chips
 */
export function buildBar(doc, s, id, chips) {
    const bar = make(doc, 'div', 'kp-snooze__bar');
    const status = make(doc, 'p', 'kp-snooze__status');
    status.id = `${id}-status`;
    status.setAttribute('aria-live', 'polite');
    const end = button(doc, 'kp-button kp-button--ghost kp-snooze__end', s.snoozeEnd);
    end.hidden = true;
    if (chips) {
        const row = make(doc, 'div', 'kp-segmented kp-segmented--chips kp-snooze__chips');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', s.snoozeChoicesLabel);
        bar.append(row, end);
        return { bar, status, end, trigger: row, wrapper: null, row };
    }
    const wrapper = make(doc, 'div', 'kp-menu-button kp-snooze__menu');
    wrapper.dataset.kpMenuButton = '';
    const trigger = button(doc, 'kp-button kp-snooze__trigger');
    const menu = make(doc, 'div', 'kp-menu kp-menu--rich kp-snooze__list');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', s.snoozeTrigger);
    wrapper.append(trigger, menu);
    bar.append(wrapper, end);
    return { bar, status, end, trigger, wrapper, row: null };
}

/** A text field that takes digits. @param {Document} doc @param {string} className @param {string} label */
function field(doc, className, label) {
    const input = /** @type {HTMLInputElement} */ (make(doc, 'input', className));
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    return input;
}

/** The pick panel: a date (the package's date picker) and a time, an error line, Cancel and Apply. @param {Document} doc @param {Words} s @param {string} id */
export function buildPanel(doc, s, id) {
    const panel = make(doc, 'div', 'kp-popover kp-snooze__panel');
    panel.id = `${id}-panel`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', s.snoozePickTitle);
    panel.hidden = true;
    const picker = make(doc, 'div', 'kp-datepicker kp-snooze__date');
    picker.dataset.kpDatepicker = '';
    const date = field(doc, 'kp-field__input', s.snoozeDateLabel);
    date.dataset.kpDateInput = '';
    const open = button(doc, 'kp-button');
    open.dataset.kpDateOpen = '';
    open.setAttribute('aria-label', s.calendarOpen);
    open.title = s.calendarOpen;
    const glyph = make(doc, 'span', '', s.calendarButton);
    glyph.removeAttribute('class');
    glyph.setAttribute('aria-hidden', 'true');
    open.append(glyph);
    const datePanel = make(doc, 'div', 'kp-datepicker__panel');
    datePanel.dataset.kpDatePanel = '';
    datePanel.hidden = true;
    picker.append(date, open, datePanel);
    const time = field(doc, 'kp-field__input kp-snooze__time', s.snoozeTimeLabel);
    time.placeholder = s.rangeTimeHint;
    const inputs = make(doc, 'div', 'kp-snooze__inputs');
    inputs.append(picker, time);
    const error = make(doc, 'p', 'kp-field__error kp-snooze__error');
    error.id = `${id}-error`;
    error.setAttribute('role', 'alert');
    const cancel = button(doc, 'kp-button', s.snoozeCancel);
    const apply = button(doc, 'kp-button kp-button--primary', s.snoozeApply);
    const actions = make(doc, 'div', 'kp-snooze__actions');
    actions.append(cancel, apply);
    panel.append(make(doc, 'p', 'kp-snooze__panel-title', s.snoozePickTitle), inputs, error, actions);
    return { panel, picker, date, time, error, cancel, apply };
}
