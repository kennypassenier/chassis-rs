// The sentence form: a form that reads as a sentence [kpadopt5-time; homelab's `.sch-sentence`].
//
// "Run [backup] on [nextcloud] every [week] on [Mon Thu] at [03:00]": the fields stand inside the words, so a person
// reads what will happen as they fill it in. The fields are the package's own (an input, a select, a combobox, the
// date picker, the weekday picker), put inside `.kp-sentence__field`, which keeps each one's behaviour and draws it
// inline, an underline in the primary colour by default:
//
//   <form class="kp-sentence" data-kp-sentence>
//     <p class="kp-sentence__text">
//       Run <span class="kp-sentence__field"><select name="job" aria-label="What to run">…</select></span>
//       <span class="kp-sentence__when" data-kp-show-when="how=once"> on <span class="kp-sentence__field">…</span></span>
//       at <span class="kp-sentence__field"><input name="at" aria-label="At" value="03:00" /></span>.
//     </p>
//   </form>
//
// Options (markup attribute, each with a default [KT6]):
//   data-kp-look          underline | boxed: how a field is drawn                  underline
//   data-kp-sentence-size lg (1.125rem, line height 2.4) | md (1rem)               lg
//   data-kp-narrow        wrap | stack | flow: what a narrow screen does           wrap
//   data-kp-own-line-ratio how much of the line a field may take before it goes on a line of its own   0.7
//   data-kp-show-when     on a phrase: `field=value` (a comma lists values); the phrase shows only then   always
//   data-kp-block         on a field: it always takes a line of its own (the weekday picker)   off
//   data-kp-disabled-reason  on a disabled fieldset: the sentence that says why     none
//   data-kp-sentence-computed      on an `<output class="kp-sentence__computed">`: the name of a read-only field the sentence works out   none
//
// `wrap` (Kenny, 2026-10-17) lets the sentence run on over several lines with the fields between the words, and a field
// whose natural width is more than `data-kp-own-line-ratio` of the line (a stack name that is long) takes a line of its own,
// the full width; `stack` puts every field on its own line below 30rem; `flow` never does. A phrase that is hidden is
// `hidden` and `inert`, its controls disabled, so they are neither tabbed to nor submitted.
//
// A read-only computed field [audhd-opts-1019; AuDHD recipes 24]: a word the sentence works out from its other fields, such as
// "ready at 18:40" from the start time and the minutes:
//
//   Start at <span class="kp-sentence__field"><input name="start" aria-label="Start" value="17:30" /></span>,
//   it takes <span class="kp-sentence__field"><input name="minutes" aria-label="Minutes" value="70" /></span> min and is
//   ready at <span class="kp-sentence__field"><output class="kp-sentence__computed" data-kp-sentence-computed="ready"
//   aria-label="Ready at"></output></span>.
//
//   attachSentences(root, { computed: { ready: (values) => addMinutes(values.start, Number(values.minutes)) } });
//   sentence(form).compute('ready', (values, form) => …)    // the same, after attach
//   setSentenceComputed(form, 'ready', '18:40')              // or push the text yourself (an answer that arrives late)
//
// The function gets the value of every named control (`{ start: '17:30', minutes: '70' }`; a radio or checkbox that is not
// chosen is null) and is called again on every change, before the summary is spoken, so the summary holds the new text. It
// returns a string or a number; nothing (null, undefined, an empty string) draws a dash and the summary says "(Ready at)"; a
// function that throws draws the dash and warns once in the console. The field is drawn apart from the editable ones (a quiet
// plate, no underline in the primary colour), is not a control (no tab stop, no focus ring, never submitted) and is not
// announced on its own: `aria-live="off"`, because the sentence's own status line already speaks the whole sentence.
//
// A select in a sentence opens the package's drawn list (data-kp-select="native" keeps the browser's).
//
// Every control needs a name of its own (`aria-label`): the words round it are not its label to a screen reader. A
// control without one takes the words before it. A status region says the whole sentence in words when it changes
// ("Run backup on nextcloud every Monday at 03:00."), politely and after a pause, and `sentenceSummary(el)` reads the same
// text. Enter in the last field submits the form. An invalid control (`aria-invalid`) is drawn with a destructive
// underline; `setSentenceInvalid(el, name, why)` marks one and writes the line under the sentence that names the field.
// `setSentenceFieldState(field, 'loading')` shows a field's own skeleton at the width it had, so the sentence does not
// reflow when its choices arrive. Nothing runs on import; attachSentences(root) returns a detach.

import { getStrings } from './strings.js';
import { weekdays } from './weekdays.js';

/** A sentence form. */
export const SENTENCE = '[data-kp-sentence]';
/** Fired on the sentence, bubbling, after a change, once things have settled: `{ summary }`. */
export const SENTENCE_EVENT = 'kp-sentence-change';

const CONTROLS = 'input, select, textarea, button, [role="combobox"]';

/** @param {string} text */
const tidy = (text) =>
    text
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim();

/** @param {Element} control @returns {string} */
function nameOf(control) {
    const label = control.getAttribute('aria-label');
    if (label) return label;
    const by = control.getAttribute('aria-labelledby');
    if (by)
        return tidy(
            by
                .split(/\s+/)
                .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '')
                .join(' '),
        );
    return '';
}

/**
 * What a computed field shows, in words: its text, or "(Ready at)" while it has none.
 * @param {Element} output a `[data-kp-sentence-computed]` element
 * @returns {string}
 */
function computedText(output) {
    return output.hasAttribute('data-kp-sentence-empty') ? getStrings().sentenceEmpty(nameOf(output)) : (output.textContent?.trim() ?? '');
}

/** What a computed field draws when it has nothing to say. */
const COMPUTED_NONE = '\u2014';

/**
 * Write the text of a computed field (`[data-kp-sentence-computed="<name>"]`); null, undefined or '' draws a dash.
 * @param {Element} element a `.kp-sentence`
 * @param {string} name the field's `data-kp-sentence-computed`
 * @param {string | number | null | undefined} text
 */
export function setSentenceComputed(element, name, text) {
    const value = text === null || text === undefined ? '' : String(text).trim();
    for (const output of element.querySelectorAll('[data-kp-sentence-computed]')) {
        if (output.getAttribute('data-kp-sentence-computed') !== name) continue;
        output.toggleAttribute('data-kp-sentence-empty', value === '');
        const shown = value === '' ? COMPUTED_NONE : value;
        if (output.textContent !== shown) output.textContent = shown;
        output.setAttribute('aria-live', 'off');
    }
}

/**
 * What a field shows, in words.
 * @param {Element} field a `.kp-sentence__field`
 * @returns {string}
 */
function fieldText(field) {
    const s = getStrings();
    const computed = field.querySelector('[data-kp-sentence-computed]');
    if (computed) return computedText(computed);
    const picker = field.querySelector('.kp-weekdays');
    if (picker) return weekdays(picker)?.summary() ?? '';
    const select = field.querySelector('select');
    if (select instanceof HTMLSelectElement) return select.selectedOptions[0]?.textContent?.trim() || s.sentenceEmpty(nameOf(select));
    const input = field.querySelector('input:not([type="hidden"]), textarea');
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) return input.checked ? nameOf(input) : '';
        return input.value.trim() || s.sentenceEmpty(nameOf(input));
    }
    return field.textContent?.trim() ?? '';
}

/**
 * The sentence in words as it stands now: the text, with each field replaced by what it shows and each hidden phrase left out.
 * @param {Element} element a `.kp-sentence`
 * @returns {string}
 */
export function sentenceSummary(element) {
    /** @param {Node} node @returns {string} */
    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
        if (!(node instanceof HTMLElement) || node.hidden) return '';
        if (node.classList.contains('kp-sentence__field')) return ` ${fieldText(node)} `;
        if (node.hasAttribute('data-kp-sentence-computed')) return ` ${computedText(node)} `;
        if (node.classList.contains('kp-sr-only') || node.matches('script, style, [data-kp-sentence-skip]')) return '';
        return [...node.childNodes].map(walk).join('');
    };
    const text = element.querySelector('.kp-sentence__text') ?? element;
    return tidy(walk(text));
}

/**
 * Mark a control invalid and write the line under the sentence that names it; `why` null clears the mark.
 * @param {Element} element a `.kp-sentence`
 * @param {string} name the control's `name`
 * @param {string | null} why
 */
export function setSentenceInvalid(element, name, why) {
    const control = [...element.querySelectorAll('[name]')].find((c) => c.getAttribute('name') === name);
    if (!control) return;
    const field = control.closest('.kp-sentence__field');
    const line = HANDLES.get(element)?.line;
    if (why === null) {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
        field?.removeAttribute('data-kp-invalid');
        if (line && !element.querySelector('[aria-invalid="true"]')) setSentenceWhy(element, null);
        return;
    }
    control.setAttribute('aria-invalid', 'true');
    field?.setAttribute('data-kp-invalid', '');
    if (line) {
        control.setAttribute('aria-describedby', line.id);
        setSentenceWhy(element, getStrings().sentenceWhy(nameOf(control), why));
    }
}

/**
 * Write (or clear, with null) the line under the sentence.
 * @param {Element} element a `.kp-sentence` @param {string | null} text
 */
export function setSentenceWhy(element, text) {
    const line = HANDLES.get(element)?.line;
    if (!line) return;
    line.textContent = text ?? '';
    line.hidden = !text;
}

/**
 * Put a field in a state: `loading` shows its own skeleton at the width it had and switches its control off; `ready` brings it back.
 * @param {Element} field a `.kp-sentence__field`
 * @param {'loading' | 'ready'} state
 */
export function setSentenceFieldState(field, state) {
    if (!(field instanceof HTMLElement)) return;
    const doc = field.ownerDocument;
    const old = field.querySelector(':scope > .kp-sentence__skeleton');
    if (state === 'loading') {
        if (old) return;
        field.style.minInlineSize = `${field.getBoundingClientRect().width}px`;
        field.dataset.kpState = 'loading';
        field.setAttribute('aria-busy', 'true');
        const skeleton = doc.createElement('span');
        skeleton.className = 'kp-sentence__skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        const bar = doc.createElement('span');
        bar.className = 'kp-skeleton kp-skeleton--block kp-sentence__bar';
        skeleton.append(bar);
        field.append(skeleton);
        for (const c of field.querySelectorAll(CONTROLS)) {
            if (c instanceof HTMLElement && !c.hasAttribute('disabled')) {
                c.setAttribute('disabled', '');
                c.setAttribute('data-kp-was-enabled', '');
            }
        }
    } else {
        old?.remove();
        field.style.minInlineSize = '';
        delete field.dataset.kpState;
        field.removeAttribute('aria-busy');
        for (const c of field.querySelectorAll('[data-kp-was-enabled]')) {
            c.removeAttribute('disabled');
            c.removeAttribute('data-kp-was-enabled');
        }
    }
}

/**
 * @typedef {object} SentenceHandle
 * @property {HTMLElement} element
 * @property {HTMLElement} line the line under the sentence
 * @property {() => string} summary the sentence in words
 * @property {() => void} refresh show and hide the phrases, work the computed fields out again and place the fields
 * @property {(name: string, fn: ComputedFn | null) => void} compute set (or with null, drop) the function behind a computed field
 */

/**
 * @callback ComputedFn
 * @param {Record<string, string | null>} values the value of every named control
 * @param {Element} element the sentence
 * @returns {string | number | null | undefined}
 */

/** @type {WeakMap<Element, SentenceHandle>} */
const HANDLES = new WeakMap();

/** The handle of an attached sentence. @param {Element} element */
export function sentence(element) {
    return HANDLES.get(element) ?? null;
}

let seq = 0;

/** @param {Element} root @param {string} name @returns {string | null} what the control of that name holds */
function valueOfControl(root, name) {
    const controls = [...root.querySelectorAll('[name]')].filter((c) => c.getAttribute('name') === name);
    const radios = controls.filter((c) => c instanceof HTMLInputElement && c.type === 'radio');
    if (radios.length)
        return /** @type {HTMLInputElement | undefined} */ (radios.find((r) => /** @type {HTMLInputElement} */ (r).checked))?.value ?? null;
    const c = controls[0];
    if (c instanceof HTMLInputElement && c.type === 'checkbox') return c.checked ? c.value || 'on' : null;
    if (c instanceof HTMLInputElement || c instanceof HTMLSelectElement || c instanceof HTMLTextAreaElement) return c.value;
    return null;
}

/**
 * Wire every sentence form under `root`.
 * @param {ParentNode} [root]
 * @param {{ computed?: Record<string, ComputedFn> }} [options] the functions behind the computed fields, by `data-kp-sentence-computed`
 * @returns {() => void} detach
 */
export function attachSentences(root = document, { computed = {} } = {}) {
    /** @type {(() => void)[]} */
    const cleanups = [];
    const found = /** @type {HTMLElement[]} */ ([
        ...(root instanceof Element && root.matches(SENTENCE) ? [root] : []),
        ...root.querySelectorAll(SENTENCE),
    ]);
    for (const el of found) {
        if (HANDLES.has(el)) continue;
        const doc = el.ownerDocument;
        const id = `kp-sentence-${++seq}`;
        el.classList.add('kp-sentence');
        // A select in a sentence opens the package's drawn list (the combobox's own plate, js/combobox.js), not the
        // browser's, which Firefox paints from the transparent field: almost black in formal [Kenny, 2026-10-17 22:09].
        // `data-kp-select="native"` on a select keeps the browser's.
        const drawn = [...el.querySelectorAll('.kp-sentence__field > select:not([multiple]):not([data-kp-select])')];
        for (const select of drawn) select.setAttribute('data-kp-select', '');
        if (drawn.length) void import('./combobox.js').then((m) => m.attachSelects(el));
        const narrow = el.dataset.kpNarrow === 'stack' || el.dataset.kpNarrow === 'flow' ? el.dataset.kpNarrow : 'wrap';
        const ratio = Math.min(1, Math.max(0.2, Number(el.dataset.kpOwnLineRatio) || 0.7));

        // The line under the sentence, the reason a disabled one is off, and the summary a screen reader hears.
        let line = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-sentence__why'));
        if (!line) {
            line = doc.createElement('p');
            line.className = 'kp-field__error kp-sentence__why';
            el.append(line);
        }
        line.id ||= `${id}-why`;
        line.hidden = !line.textContent?.trim();
        line.setAttribute('role', 'alert');
        const reason = el.dataset.kpDisabledReason;
        /** @type {HTMLElement | null} */
        let reasonLine = null;
        if (reason && el.hasAttribute('disabled')) {
            reasonLine = doc.createElement('p');
            reasonLine.className = 'kp-sentence__reason';
            reasonLine.textContent = reason;
            el.append(reasonLine);
        }
        const live = doc.createElement('p');
        live.className = 'kp-sr-only kp-sentence__live';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        el.append(live);

        // Every control has a name of its own: the words before it when the page gave none.
        const text = el.querySelector('.kp-sentence__text') ?? el;
        for (const field of el.querySelectorAll('.kp-sentence__field')) {
            for (const control of field.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="combobox"]')) {
                if (nameOf(control) || (control.id && doc.querySelector(`label[for="${CSS.escape(control.id)}"]`))) continue;
                const before = [];
                for (let n = field.previousSibling; n && before.length < 3; n = n.previousSibling) {
                    if (n.nodeType === Node.TEXT_NODE)
                        before.unshift(
                            ...(n.textContent ?? '')
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean)
                                .reverse()
                                .slice(0, 3 - before.length)
                                .reverse(),
                        );
                    else break;
                }
                control.setAttribute('aria-label', before.join(' ') || getStrings().sentenceField);
            }
        }

        /** Show the phrases whose condition holds, hide the others and take their controls out of reach. */
        const phrases = () => {
            for (const phrase of el.querySelectorAll('[data-kp-show-when]')) {
                if (!(phrase instanceof HTMLElement)) continue;
                const [name, wanted = ''] = (phrase.dataset.kpShowWhen ?? '').split('=');
                const held = valueOfControl(el, name.trim());
                const show =
                    held !== null &&
                    wanted
                        .split(',')
                        .map((v) => v.trim())
                        .includes(held);
                if (phrase.hidden === !show) continue;
                phrase.hidden = !show;
                phrase.toggleAttribute('inert', !show);
                for (const c of phrase.querySelectorAll(CONTROLS)) {
                    if (!(c instanceof HTMLElement)) continue;
                    if (!show && !c.hasAttribute('disabled')) {
                        c.setAttribute('disabled', '');
                        c.setAttribute('data-kp-hidden-off', '');
                    } else if (show && c.hasAttribute('data-kp-hidden-off')) {
                        c.removeAttribute('disabled');
                        c.removeAttribute('data-kp-hidden-off');
                    }
                }
            }
        };

        /** A field that is more of the line than it may be takes a line of its own. */
        const place = () => {
            const room = (text instanceof HTMLElement ? text : el).clientWidth;
            for (const field of el.querySelectorAll('.kp-sentence__field')) {
                if (!(field instanceof HTMLElement) || field.closest('[hidden]')) continue;
                let own = false;
                if (field.hasAttribute('data-kp-block')) own = true;
                else if (narrow === 'stack') own = room < 480;
                else if (narrow === 'wrap' && room > 0) {
                    field.removeAttribute('data-kp-own-line');
                    const was = field.style.inlineSize;
                    field.style.inlineSize = 'max-content';
                    own = field.getBoundingClientRect().width > room * ratio;
                    field.style.inlineSize = was;
                }
                field.toggleAttribute('data-kp-own-line', own);
            }
        };

        /** @type {Map<string, ComputedFn>} */
        const fns = new Map(Object.entries(computed));
        let warnedComputed = false;
        /** Work every computed field out from the controls as they stand. */
        const compute = () => {
            if (fns.size === 0) return;
            /** @type {Record<string, string | null>} */
            const values = {};
            for (const control of el.querySelectorAll('[name]')) {
                const name = control.getAttribute('name') ?? '';
                if (name && !(name in values)) values[name] = valueOfControl(el, name);
            }
            for (const [name, fn] of fns) {
                /** @type {string | number | null | undefined} */
                let text = null;
                try {
                    text = fn(values, el);
                } catch (error) {
                    if (!warnedComputed) {
                        warnedComputed = true;
                        console.warn(`kp-sentence: the computed field "${name}" threw`, error);
                    }
                }
                setSentenceComputed(el, name, text);
            }
        };

        const refresh = () => {
            phrases();
            compute();
            place();
        };

        let timer = 0;
        const say = () => {
            const summary = sentenceSummary(el);
            live.textContent = summary;
            el.dispatchEvent(new CustomEvent(SENTENCE_EVENT, { bubbles: true, detail: { summary } }));
        };
        const onChange = () => {
            refresh();
            clearTimeout(timer);
            timer = window.setTimeout(say, 500);
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
            const target = event.target;
            if (
                !(target instanceof HTMLInputElement) ||
                target.type === 'button' ||
                target.type === 'submit' ||
                target.closest('[aria-expanded="true"]')
            )
                return;
            if (!(el instanceof HTMLFormElement) && !el.closest('form')) return;
            const controls = [
                ...el.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'),
            ].filter((c) => !c.closest('[hidden]') && !(c instanceof HTMLInputElement && (c.type === 'button' || c.type === 'submit')));
            if (controls.at(-1) !== target) return;
            event.preventDefault();
            (el instanceof HTMLFormElement ? el : /** @type {HTMLFormElement} */ (el.closest('form'))).requestSubmit();
        };
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
        el.addEventListener('kp-weekdays-change', onChange);
        el.addEventListener('kp-combobox-change', onChange);
        el.addEventListener('keydown', onKey);
        const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place());
        watch?.observe(el);
        void doc.fonts?.ready.then(place);

        /** @type {SentenceHandle} */
        const handle = {
            element: el,
            line,
            summary: () => sentenceSummary(el),
            refresh,
            compute: (name, fn) => {
                if (fn) fns.set(name, fn);
                else fns.delete(name);
                refresh();
                live.textContent = sentenceSummary(el);
            },
        };
        HANDLES.set(el, handle);
        // A computed field with no text yet shows its dash, and one with authored text keeps it until its function speaks.
        for (const output of el.querySelectorAll('[data-kp-sentence-computed]'))
            setSentenceComputed(el, output.getAttribute('data-kp-sentence-computed') ?? '', output.textContent);
        refresh();
        live.textContent = sentenceSummary(el);

        cleanups.push(() => {
            clearTimeout(timer);
            el.removeEventListener('input', onChange);
            el.removeEventListener('change', onChange);
            el.removeEventListener('kp-weekdays-change', onChange);
            el.removeEventListener('kp-combobox-change', onChange);
            el.removeEventListener('keydown', onKey);
            watch?.disconnect();
            live.remove();
            reasonLine?.remove();
            HANDLES.delete(el);
        });
    }
    return () => {
        for (const c of cleanups) c();
    };
}
