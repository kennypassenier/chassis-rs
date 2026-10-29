// Forms, framework-free [TH38].
//
// The browser validates; this makes what it found reachable. Constraint
// validation already knows a field is invalid and why — what it does not
// do is put the message where a screen reader will read it, gather the
// errors into a summary, or move focus to the first one. That is the work
// here, and it is the work every hand-written form skips.
//
//   <form class="kp-form" data-kp-form novalidate>
//     <div class="kp-form__summary" data-kp-form-summary tabindex="-1" hidden></div>
//     <div class="kp-field">
//       <label class="kp-field__label" for="name">Name <span class="kp-field__required">required</span></label>
//       <input class="kp-field__input" id="name" name="name" required />
//       <span class="kp-field__error" data-kp-field-error hidden></span>
//     </div>
//     <button class="kp-button kp-button--primary" data-kp-submit>Save</button>
//   </form>
//
// `novalidate` on purpose: the browser's own bubbles disappear on the next
// keystroke, show one error at a time, and cannot be styled or read back.
// Turning them off and using `checkValidity()` keeps the validation and
// loses the popup.
//
// A valid form is not submitted natively [wish-1028, Kitchen 5]: attachForms calls preventDefault() on a valid submit, fires
// `kp-form-valid` and the page sends the data. A form that should also be sent by the browser (an `action` doing the work) says
// so with `data-kp-form-native-submit` or the `nativeSubmit` option. This changes behaviour for every consumer that relied on the
// native submit of a form carrying `data-kp-form`.
//
// Three rules this enforces, each because leaving it to care is how it
// gets skipped:
//
//   1. A message is announced, not only coloured. `aria-invalid` and
//      `aria-describedby` point at the text.
//   2. The summary is focused, not just rendered. A message that appears
//      above the fold is invisible to someone whose focus is at the
//      bottom of a long form.
//   3. Validation reports on blur, never on every keystroke. Telling
//      someone their email is invalid while they type the third character
//      is technically true and practically hostile.
//
// Since 3.0.0 [KT6]: showError and clearError are exported, because the
// errors a server finds are the ones every real form has to show and the
// first version kept them in a closure; attach returns a handle that
// validates, reads and shows errors on demand; every rule above is a
// default rather than a law — `validateOn`, `focusSummary`, the wrapper
// selector — and fields added after attach validate too, because the
// listener is on the form, not on the fields.

import { getStrings } from './strings.js';
const FORM = '[data-kp-form]';
const SUMMARY = '[data-kp-form-summary]';
const FIELD_ERROR = '[data-kp-field-error]';
const SUBMIT = '[data-kp-submit]';

/**
 * Fired when a form passes validation. A contract value [TH26]: the
 * detail carries the FormData and, since KT6, a `done()` that ends the
 * busy state. A consumer may call it, or return nothing and dispatch
 * `DONE_EVENT` on the form themselves — same effect.
 */
export const VALID_EVENT = 'kp-form-valid';
/** Fired when a submit failed validation: `{ fields, names }`. */
export const INVALID_EVENT = 'kp-form-invalid';
/** Fired on a field when its validity was checked: `{ valid, message }`. */
export const FIELD_EVENT = 'kp-field-validity';

/**
 * Ends the busy state the submit button took on `VALID_EVENT` [KT6].
 * Dispatched on the form by `detail.done()`, or by the consumer directly.
 * Nothing dispatches it on its own: a consumer who navigates away on
 * submit must not get back a button that double-sends.
 */
export const DONE_EVENT = 'kp-form-done';

/** What the browser's own message becomes when the field says nothing better. */
const fallback = () => getStrings().formInvalid;

/** Deterministic ids for error holders: no Math.random, so server and client agree. */
let counter = 0;

/**
 * The name a summary line uses for a field: its label, its
 * `aria-label`, or as a last resort its name attribute.
 *
 * @param {HTMLElement} field
 */
export function nameOf(field) {
    // A radio's own label names one option; the legend names the
    // question, which is what somebody left unanswered.
    if (field.getAttribute('type') === 'radio') {
        const legend = field.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
        if (legend !== undefined && legend !== '') return legend;
    }
    const id = field.getAttribute('id');
    const label = id === null ? null : field.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    const text = label?.textContent?.trim();
    if (text !== undefined && text !== '') return text;
    return field.getAttribute('aria-label') ?? field.getAttribute('name') ?? getStrings().fieldFallbackName;
}

/**
 * What carries the state for this control.
 *
 * For everything except a radio that is the control itself. A radio
 * belongs to a group, and `aria-invalid` on one button says the wrong
 * thing about the other three, so the group carries it.
 *
 * @param {HTMLElement} field
 * @returns {HTMLElement}
 */
function stateHolder(field) {
    if (field.getAttribute('type') !== 'radio') return field;
    return /** @type {HTMLElement | null} */ (field.closest('[role="radiogroup"], fieldset')) ?? field;
}

/**
 * Show a message on a field — the browser's, or one the server found.
 *
 * @param {HTMLElement} field
 * @param {string} message
 * @param {{ wrapper?: string, invalidClass?: string }} [options]
 */
export function showError(field, message, { wrapper = '.kp-field', invalidClass = 'kp-field--invalid' } = {}) {
    const box = field.closest(wrapper);
    const holder = /** @type {HTMLElement | null} */ (box?.querySelector(FIELD_ERROR) ?? null);
    const marked = stateHolder(field);
    marked.setAttribute('aria-invalid', 'true');
    box?.classList.add(invalidClass);
    if (holder === null) return;
    if (holder.id === '') holder.id = `${field.getAttribute('id') ?? `kp-field-${++counter}`}-error`;
    holder.textContent = message;
    holder.hidden = false;
    // Appended rather than replaced: a field with help text keeps
    // it, and overwriting describedby is how help disappears the
    // first time someone gets something wrong.
    const described = (marked.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (!described.includes(holder.id)) marked.setAttribute('aria-describedby', [...described, holder.id].join(' '));
}

/**
 * Clear what showError put there.
 *
 * @param {HTMLElement} field
 * @param {{ wrapper?: string, invalidClass?: string }} [options]
 */
export function clearError(field, { wrapper = '.kp-field', invalidClass = 'kp-field--invalid' } = {}) {
    const box = field.closest(wrapper);
    const holder = /** @type {HTMLElement | null} */ (box?.querySelector(FIELD_ERROR) ?? null);
    const marked = stateHolder(field);
    marked.removeAttribute('aria-invalid');
    box?.classList.remove(invalidClass);
    if (holder === null) return;
    holder.hidden = true;
    holder.textContent = '';
    const described = (marked.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== holder.id);
    if (described.length > 0) marked.setAttribute('aria-describedby', described.join(' '));
    else marked.removeAttribute('aria-describedby');
}

/**
 * @typedef {object} FormHandle
 * @property {HTMLFormElement} element
 * @property {() => boolean} validate check every field, show what is wrong, and return whether the form is valid
 * @property {() => HTMLElement[]} invalid the fields currently marked invalid
 * @property {(errors: Record<string, string>) => void} errors show messages by field name — what a server sends back
 * @property {() => void} clear clear every message
 * @property {() => void} done end the busy state
 */

/** @type {WeakMap<Element, FormHandle>} */
const handles = new WeakMap();

/** The handle for an attached form, for code that did not call attach. @param {Element} element */
export function form(element) {
    return handles.get(element) ?? null;
}

/**
 * Attach every form under `root`.
 *
 * @param {ParentNode} root
 * @param {{ validateOn?: 'blur' | 'input' | 'submit', revalidateOn?: 'input' | 'blur' | 'none', focusSummary?: boolean, focusFirstInvalid?: boolean, wrapper?: string, invalidClass?: string, summaryHeading?: string, summaryHeadingClass?: string, nativeSubmit?: boolean }} [options]
 *   Defaults, each also settable per form as `data-kp-validate-on`, `data-kp-revalidate-on`, `data-kp-focus-summary`, `data-kp-form-native-submit`.
 *   A valid submit is NOT sent by the browser: the form fires `kp-form-valid` and the page sends the data itself (`preventDefault()`),
 *   so a handler that saves with `fetch` is not followed by a reload of the page [wish-1028, Kitchen 5]. `nativeSubmit: true` (or
 *   `data-kp-form-native-submit` on the form) lets the browser submit a valid form as well, for a form whose `action` does the work.
 * @returns {(() => void) & { handles: FormHandle[] }} detach
 */
export function attachForms(
    root = document,
    {
        validateOn = 'blur',
        revalidateOn = 'input',
        focusSummary = true,
        focusFirstInvalid = true,
        wrapper = '.kp-field',
        invalidClass = 'kp-field--invalid',
        summaryHeading = 'p',
        summaryHeadingClass = 'kp-form__summary-title',
        nativeSubmit = false,
    } = {},
) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    /** @type {FormHandle[]} */
    const created = [];
    const marks = { wrapper, invalidClass };

    for (const element of root.querySelectorAll(FORM)) {
        const form = element;
        if (!(form instanceof HTMLFormElement) || form.dataset.kpFormAttached !== undefined) continue;
        form.dataset.kpFormAttached = '';
        // The browser's bubbles are replaced, not suppressed: checkValidity()
        // below still uses the same constraints. Restored on detach.
        const hadNoValidate = form.noValidate;
        form.noValidate = true;

        const when = /** @type {'blur' | 'input' | 'submit'} */ (form.dataset.kpValidateOn ?? validateOn);
        const again = /** @type {'input' | 'blur' | 'none'} */ (form.dataset.kpRevalidateOn ?? revalidateOn);
        const focusOnError = form.dataset.kpFocusSummary === undefined ? focusSummary : form.dataset.kpFocusSummary !== 'false';
        const summary = /** @type {HTMLElement | null} */ (form.querySelector(SUMMARY));
        /** `data-kp-form-native-submit` (or the option): the browser also submits a valid form [wish-1028]. */
        const native = () => (form.dataset.kpFormNativeSubmit === undefined ? nativeSubmit : form.dataset.kpFormNativeSubmit !== 'false');

        /** @returns {HTMLElement[]} */
        const fields = () =>
            /** @type {HTMLElement[]} */ (
                [...form.elements].filter((el) => el instanceof HTMLElement && 'checkValidity' in el && el.getAttribute('type') !== 'submit')
            );

        /** @param {HTMLElement} field @returns {boolean} */
        const validate = (field) => {
            const control = /** @type {HTMLInputElement} */ (field);
            const valid = control.checkValidity();
            if (valid) clearError(field, marks);
            else showError(field, control.validationMessage || fallback(), marks);
            field.dispatchEvent(
                new CustomEvent(FIELD_EVENT, { bubbles: true, detail: { valid, message: valid ? '' : control.validationMessage || fallback() } }),
            );
            return valid;
        };

        /** @param {Event} event */
        const fieldOf = (event) => {
            const field = /** @type {HTMLElement} */ (event.target);
            return field instanceof HTMLElement && 'checkValidity' in field && field.getAttribute('type') !== 'submit' ? field : null;
        };
        // Delegated, so a field added after attach validates too.
        /** @param {Event} event */
        const onFocusOut = (event) => {
            const field = fieldOf(event);
            if (field === null) return;
            // Only once someone has left the field. Reporting while they
            // type the third character of an email address is technically
            // true and practically hostile.
            if (when === 'blur' || (again === 'blur' && stateHolder(field).getAttribute('aria-invalid') === 'true')) validate(field);
        };
        /** @param {Event} event */
        const onInput = (event) => {
            const field = fieldOf(event);
            if (field === null) return;
            // "Punish late, reward early": once a field is marked, fixing
            // it clears the mark as you type.
            if (when === 'input' || (again === 'input' && stateHolder(field).getAttribute('aria-invalid') === 'true')) validate(field);
        };

        const dedupe = (/** @type {HTMLElement[]} */ list) => {
            // One line per group, not per radio button: four radios in one
            // group are one thing somebody forgot to answer.
            /** @type {Set<string>} */
            const groups = new Set();
            return list.filter((field) => {
                if (field.getAttribute('type') !== 'radio') return true;
                const name = field.getAttribute('name') ?? '';
                if (groups.has(name)) return false;
                groups.add(name);
                return true;
            });
        };

        /** @param {HTMLElement[]} bad */
        const showSummary = (bad) => {
            if (summary === null) {
                if (focusFirstInvalid) bad[0]?.focus();
                return;
            }
            summary.textContent = '';
            const heading = document.createElement(summaryHeading);
            heading.className = summaryHeadingClass;
            const s = getStrings();
            heading.textContent = bad.length === 1 ? s.formSummaryOne : s.formSummaryMany(bad.length);
            const list = document.createElement('ul');
            for (const field of bad) {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = `#${field.getAttribute('id') ?? ''}`;
                link.textContent = nameOf(field);
                link.addEventListener('click', (click) => {
                    click.preventDefault();
                    field.focus();
                });
                item.append(link);
                list.append(item);
            }
            summary.append(heading, list);
            summary.hidden = false;
            // Focused, not merely rendered: a message above the fold is
            // invisible to someone whose focus is at the bottom of a long
            // form, which is exactly where the submit button is.
            if (focusOnError) summary.focus();
        };

        const validateAll = () => {
            const bad = dedupe(fields().filter((field) => !validate(field)));
            if (bad.length === 0) {
                if (summary !== null) summary.hidden = true;
                return true;
            }
            showSummary(bad);
            form.dispatchEvent(new CustomEvent(INVALID_EVENT, { bubbles: true, detail: { fields: bad, names: bad.map(nameOf) } }));
            return false;
        };

        const done = () => form.dispatchEvent(new CustomEvent(DONE_EVENT, { bubbles: true }));

        /** @param {SubmitEvent} event */
        const onSubmit = (event) => {
            if (validateAll()) {
                // The page sends the data from `kp-form-valid`; the browser's own submit would reload the page and drop an
                // async save [wish-1028]. `nativeSubmit` / `data-kp-form-native-submit` keeps the old behaviour.
                if (!native()) event.preventDefault();
                form.dispatchEvent(new CustomEvent(VALID_EVENT, { bubbles: true, detail: { data: new FormData(form), done } }));
                return;
            }
            event.preventDefault();
        };

        form.addEventListener('focusout', onFocusOut);
        form.addEventListener('input', onInput);
        form.addEventListener('submit', onSubmit);

        /** @type {FormHandle} */
        const handle = {
            element: form,
            validate: validateAll,
            invalid: () => fields().filter((f) => stateHolder(f).getAttribute('aria-invalid') === 'true'),
            errors: (errors) => {
                /** @type {HTMLElement[]} */
                const bad = [];
                for (const [name, message] of Object.entries(errors)) {
                    const field = fields().find((f) => f.getAttribute('name') === name);
                    if (field === undefined) continue;
                    showError(field, message, marks);
                    bad.push(field);
                }
                if (bad.length > 0) showSummary(dedupe(bad));
            },
            clear: () => {
                for (const field of fields()) clearError(field, marks);
                if (summary !== null) summary.hidden = true;
            },
            done,
        };
        handles.set(form, handle);
        created.push(handle);

        cleanups.push(() => {
            form.removeEventListener('focusout', onFocusOut);
            form.removeEventListener('input', onInput);
            form.removeEventListener('submit', onSubmit);
            handle.clear();
            form.noValidate = hadNoValidate;
            handles.delete(form);
            delete form.dataset.kpFormAttached;
        });
    }

    // A submit button that says it is working. Without it, a slow save
    // looks like a click that missed, and the second click sends the form
    // twice.
    for (const element of root.querySelectorAll(SUBMIT)) {
        const button = /** @type {HTMLButtonElement} */ (element);
        if (button.dataset.kpSubmitAttached !== undefined) continue;
        button.dataset.kpSubmitAttached = '';
        const owner = button.closest('form');
        const busyText = button.dataset.kpBusy ?? getStrings().busy;
        const idleText = button.textContent ?? '';
        // A flash button owns its faces (rest, busy, result) in
        // `.kp-flash__stack`; replacing its children destroyed that stack
        // [kyu 45]. It is checked at submit time, since the flash may be
        // wired after this attach. The stack's own busy face is shown, and
        // the button's words are never touched.
        let ownsFaces = false;
        const onValid = () => {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            ownsFaces = button.querySelector(':scope > .kp-flash__stack') !== null;
            if (ownsFaces) {
                button.setAttribute('data-kp-flash-state', 'busy');
                return;
            }
            // The busy words in their own `.kp-button__label`, the element
            // the React button already has, so a register can style the
            // words alone [scope-143].
            const label = button.ownerDocument.createElement('span');
            label.className = 'kp-button__label';
            label.textContent = busyText;
            button.replaceChildren(label);
        };
        // The way back [KT6]. The first version restored the label only
        // on detach, so a failed save left the button dead for the life
        // of the page.
        const onDone = () => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            if (ownsFaces) {
                ownsFaces = false;
                // A result the page showed meanwhile stays; only our busy face is taken back.
                if (button.getAttribute('data-kp-flash-state') === 'busy') button.setAttribute('data-kp-flash-state', 'rest');
                return;
            }
            button.textContent = idleText;
        };
        owner?.addEventListener(VALID_EVENT, onValid);
        owner?.addEventListener(DONE_EVENT, onDone);
        cleanups.push(() => {
            owner?.removeEventListener(VALID_EVENT, onValid);
            owner?.removeEventListener(DONE_EVENT, onDone);
            onDone();
            delete button.dataset.kpSubmitAttached;
        });
    }

    const detach = () => {
        for (const c of cleanups) c();
    };
    return Object.assign(detach, { handles: created });
}

/** The row of a switch, and the element its two words go into [gap-11]. */
const SWITCH = '.kp-switch';
const SWITCH_STATE = '.kp-switch__state';

/**
 * Give every switch under `root` its two words [gap-11, KT5].
 *
 * The switch itself needs no script — it is a checkbox, and Space flips
 * it natively. What a server cannot write is the dictionary: the On and
 * Off beside the track come from `js/strings.js`, so a consumer's
 * `setStrings()` (or `strings` here) reaches them like every other word.
 * A state element that already has content is left alone — a server that
 * wrote its own words has decided. The stylesheet shows the word that
 * applies; nothing here listens to the checkbox.
 *
 *   <label class="kp-switch">
 *     <input class="kp-switch__input" type="checkbox" role="switch" />
 *     <span class="kp-switch__state" aria-hidden="true"></span>
 *     <span>Night alarms</span>
 *   </label>
 *
 * @param {ParentNode} [root]
 * @param {{ strings?: Partial<import('./strings.js').Strings> }} [options]
 * @returns {() => void} detach: removes the words this call put in
 */
export function attachSwitches(root = document, { strings } = {}) {
    const s = { ...getStrings(), ...strings };
    /** @type {HTMLElement[]} */
    const filled = [];
    for (const state of root.querySelectorAll(`${SWITCH} ${SWITCH_STATE}`)) {
        if (!(state instanceof HTMLElement) || state.childNodes.length > 0) continue;
        const on = document.createElement('span');
        on.className = 'kp-switch__on';
        on.textContent = s.switchOn;
        const off = document.createElement('span');
        off.className = 'kp-switch__off';
        off.textContent = s.switchOff;
        state.append(on, off);
        filled.push(state);
    }
    return () => {
        for (const state of filled) state.replaceChildren();
    };
}

/** The blocks of a form grid that give their rows to the grid in a row-sharing card (css: display: contents). */
const FORMGRID_BLOCK = '.kp-formgrid__group, .kp-formrows, .kp-kv, form';

/**
 * The rows a row-sharing form grid lays on its stage: every shown child is a row, and a block (a key-value list, a
 * group, a list of form rows) counts its own children, one level of blocks deep, as the stylesheet flattens them.
 * @param {Element} grid
 * @param {number} [depth]
 * @returns {number}
 */
function formgridRows(grid, depth = 0) {
    let rows = 0;
    for (const child of grid.children) {
        if (child instanceof HTMLElement && child.hidden) continue;
        if (child.matches('template, script, style')) continue;
        rows += depth < 2 && child.matches(FORMGRID_BLOCK) ? formgridRows(child, depth + 1) : 1;
    }
    return rows;
}

/**
 * Form grids that share rows [gapform-1019; HTTPSwitchboard 31]. In a `[data-kp-formgrid-stage]`, a `.kp-formgrid` with
 * `data-kp-formgrid-rows="subgrid"` takes its rows from the stage, so "Source" in one card stands beside "Source" in
 * the next with one height. A subgrid has to say how many rows it spans, and a count kept by hand drifts the day a row
 * is added: this writes `--kp-formgrid-rows` on each stage, the row count of its longest card, and writes it again when
 * a card gains or loses a row or one is hidden.
 *
 *   <div data-kp-formgrid-stage>
 *     <section class="kp-card kp-formgrid" data-kp-formgrid-rows="subgrid">…</section>
 *     <section class="kp-card kp-formgrid" data-kp-formgrid-rows="subgrid">…</section>
 *   </div>
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops watching and removes the counts it wrote
 */
export function attachFormgridStages(root = document) {
    /** @type {Array<() => void>} */
    const undo = [];
    for (const stage of root.querySelectorAll('[data-kp-formgrid-stage]')) {
        if (!(stage instanceof HTMLElement)) continue;
        const count = () => {
            let rows = 0;
            for (const grid of stage.querySelectorAll(":scope > .kp-formgrid[data-kp-formgrid-rows='subgrid']")) {
                rows = Math.max(rows, formgridRows(grid));
            }
            const value = String(Math.max(rows, 1));
            if (stage.style.getPropertyValue('--kp-formgrid-rows') !== value) stage.style.setProperty('--kp-formgrid-rows', value);
        };
        count();
        const watch = new MutationObserver(count);
        watch.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-kp-formgrid-rows'] });
        undo.push(() => {
            watch.disconnect();
            stage.style.removeProperty('--kp-formgrid-rows');
        });
    }
    return () => {
        for (const fn of undo) fn();
    };
}

const WIDE_BLOCKS =
    '[data-kp-formgrid-span], .kp-jsonfield, .kp-code, textarea, .kp-refresh, .kp-formrow--wide, .kp-attention, .kp-problems, .kp-command, .kp-segmented--block, .kp-formgrid__fill';

/**
 * Groups side by side [formgrid-columns-1019]. A `.kp-formgrid` whose children are all `.kp-formgrid__group` (facts and
 * settings, say) stands them in a row when the panel holds all of them: this puts `data-kp-formgrid-wide` on it while each
 * group, laid on tracks of its own, fits beside the others with `--kp-formgrid-group-gap` between. Without the attribute
 * the groups stand under each other on the grid's shared tracks (one label edge for all). `data-kp-formgrid-columns="never"`,
 * a row-sharing card (`data-kp-formgrid-rows="subgrid"`) and a stacked grid (`data-kp-formgrid-stack="always"`) are left alone.
 * Measured on the grid's own width, so a panel in a dialog or a column answers the same as a page.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach: stops watching and removes the attribute it wrote
 */
export function attachFormgridColumns(root = document) {
    /** @type {Array<() => void>} */
    const undo = [];
    for (const grid of root.querySelectorAll('.kp-formgrid')) {
        if (!(grid instanceof HTMLElement)) continue;
        const kids = () => [...grid.children].filter((c) => !c.matches('template, script, style') && !(c instanceof HTMLElement && c.hidden));
        const eligible = () => {
            const groups = kids();
            return (
                groups.length > 1 &&
                groups.every((c) => c.matches('.kp-formgrid__group')) &&
                grid.getAttribute('data-kp-formgrid-columns') !== 'never' &&
                grid.getAttribute('data-kp-formgrid-rows') !== 'subgrid' &&
                grid.getAttribute('data-kp-formgrid-stack') !== 'always' &&
                // A grid with a wide block (a code block, a JSON field, a text area, a refresh bar, a spanning cell) keeps its stretching tracks.
                !grid.querySelector(WIDE_BLOCKS)
            );
        };
        const decide = () => {
            const was = grid.hasAttribute('data-kp-formgrid-wide');
            if (!eligible()) {
                grid.removeAttribute('data-kp-formgrid-wide');
                return;
            }
            // Measured with the groups side by side, put back when they do not fit (one task, nothing is painted between).
            grid.setAttribute('data-kp-formgrid-wide', '');
            // What each group needs is its own tracks' width, not the equal column it is given.
            grid.style.gridAutoColumns = 'max-content';
            const groups = kids();
            const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
            const need = groups.reduce((sum, g) => sum + g.getBoundingClientRect().width, 0) + gap * (groups.length - 1);
            const have = grid.getBoundingClientRect().width;
            grid.style.gridAutoColumns = '';
            if (need > have + 0.5) grid.removeAttribute('data-kp-formgrid-wide');
            else if (!was) grid.setAttribute('data-kp-formgrid-wide', '');
        };
        // Every group is watched too: a time field or a stepper that builds itself after the first look makes a group wider.
        const watch = new ResizeObserver(decide);
        decide();
        watch.observe(grid);
        for (const group of grid.children) watch.observe(group);
        undo.push(() => {
            watch.disconnect();
            grid.removeAttribute('data-kp-formgrid-wide');
        });
    }
    return () => {
        for (const fn of undo) fn();
    };
}
