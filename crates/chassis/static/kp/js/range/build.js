// The range picker's markup: the preset bar with its radio group and the custom panel with its two bounds. Nothing here touches the host.

/** @typedef {import('../strings.js').Strings} Strings */
/** @typedef {{ set: HTMLFieldSetElement, picker: HTMLElement, date: HTMLInputElement, time: HTMLInputElement }} RangeBound */

/**
 * The bar of presets: a radio group of segmented items.
 * @param {Document} doc @param {Strings} s @param {string[]} presets @param {boolean} disabled
 * @returns {{ bar: HTMLElement, group: HTMLElement }}
 */
export function buildBar(doc, s, presets, disabled) {
    const bar = doc.createElement('div');
    bar.className = 'kp-range__bar';
    const group = doc.createElement('div');
    group.className = 'kp-segmented kp-range__presets';
    group.dataset.kpSegmented = 'single';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', s.rangePresets);
    if (disabled) group.setAttribute('aria-disabled', 'true');
    for (const key of presets) {
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'kp-segmented__item';
        item.dataset.value = key;
        item.setAttribute('role', 'radio');
        item.setAttribute('aria-checked', 'false');
        item.title = s.rangePresetName(key);
        const label = doc.createElement('span');
        label.className = 'kp-segmented__label';
        label.textContent = s.rangePresetShort(key);
        item.append(label);
        group.append(item);
    }
    bar.append(group);
    return { bar, group };
}

/**
 * The Custom… button that opens the panel.
 * @param {Document} doc @param {Strings} s @param {string} id @param {boolean} disabled
 */
export function buildCustomButton(doc, s, id, disabled) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'kp-button kp-button--sm kp-range__custom';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', `${id}-panel`);
    button.disabled = disabled;
    const text = doc.createElement('span');
    text.className = 'kp-button__text';
    text.textContent = s.rangeCustom;
    button.append(text);
    return button;
}

/**
 * The date picker of a bound: the input, the button that opens the calendar and the calendar's own panel.
 * @param {Document} doc @param {Strings} s @param {string} legendText
 */
function buildDatePicker(doc, s, legendText) {
    const picker = doc.createElement('div');
    picker.className = 'kp-datepicker kp-range__date';
    picker.dataset.kpDatepicker = '';
    const date = doc.createElement('input');
    date.className = 'kp-field__input';
    date.type = 'text';
    date.inputMode = 'numeric';
    date.autocomplete = 'off';
    date.dataset.kpDateInput = '';
    date.setAttribute('aria-label', s.rangeDateLabel(legendText));
    const open = doc.createElement('button');
    open.type = 'button';
    open.className = 'kp-button';
    open.dataset.kpDateOpen = '';
    open.setAttribute('aria-label', s.calendarOpen);
    open.title = s.calendarOpen;
    const glyph = doc.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = s.calendarButton;
    open.append(glyph);
    const datePanel = doc.createElement('div');
    datePanel.className = 'kp-datepicker__panel';
    datePanel.dataset.kpDatePanel = '';
    datePanel.hidden = true;
    picker.append(date, open, datePanel);
    return { picker, date };
}

/**
 * One bound of the window: a legend, a date picker and a time.
 * @param {Document} doc @param {Strings} s @param {'from' | 'to'} which
 * @returns {RangeBound}
 */
function buildBound(doc, s, which) {
    const set = doc.createElement('fieldset');
    set.className = 'kp-range__bound';
    const legend = doc.createElement('legend');
    legend.className = 'kp-field__label';
    legend.textContent = which === 'from' ? s.rangeFrom : s.rangeTo;
    const row = doc.createElement('div');
    row.className = 'kp-range__inputs';
    const { picker, date } = buildDatePicker(doc, s, legend.textContent ?? '');
    const time = doc.createElement('input');
    time.className = 'kp-field__input kp-range__time';
    time.type = 'text';
    time.inputMode = 'numeric';
    time.autocomplete = 'off';
    time.placeholder = s.rangeTimeHint;
    time.setAttribute('aria-label', s.rangeTimeLabel(legend.textContent ?? ''));
    row.append(picker, time);
    set.append(legend, row);
    return { set, picker, date, time };
}

/**
 * The custom panel: two bounds, an error line, Cancel and Apply.
 * @param {Document} doc @param {Strings} s @param {string} id
 */
export function buildPanel(doc, s, id) {
    const panel = doc.createElement('div');
    panel.className = 'kp-popover kp-range__panel';
    panel.id = `${id}-panel`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', s.rangeCustomTitle);
    panel.hidden = true;
    const title = doc.createElement('p');
    title.className = 'kp-range__title';
    title.textContent = s.rangeCustomTitle;
    const from = buildBound(doc, s, 'from');
    const to = buildBound(doc, s, 'to');
    const error = doc.createElement('p');
    error.className = 'kp-field__error kp-range__error';
    error.id = `${id}-error`;
    error.setAttribute('role', 'alert');
    const actions = doc.createElement('div');
    actions.className = 'kp-range__actions';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'kp-button';
    cancel.textContent = s.rangeCancel;
    const apply = doc.createElement('button');
    apply.type = 'button';
    apply.className = 'kp-button kp-button--primary';
    apply.textContent = s.rangeApply;
    actions.append(cancel, apply);
    panel.append(title, from.set, to.set, error, actions);
    return { panel, from, to, error, cancel, apply };
}
