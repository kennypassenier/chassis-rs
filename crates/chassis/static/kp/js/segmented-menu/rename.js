// A chip renamed in place [forms-1102]: the chip becomes a field with its words selected; Enter saves (the page may refuse, at
// once or after its promise), Escape or leaving the field cancels, and the focus comes back to the chip either way.

import { getStrings } from '../strings.js';
import { SEGMENTED } from '../segmented/constants.js';
import { labelOf, valueOf } from '../segmented/read.js';
import { layout } from '../segmented/plate.js';
import { RENAMING, RENAME_EVENT } from './constants.js';

/** The page's answer read as a refusal (words), or null when the name went through. @param {unknown} answer */
function refusalIn(answer) {
    if (typeof answer === 'string' && answer !== '') return answer;
    return answer === false ? getStrings().segmentedRenameRefused : null;
}

/** One chip being renamed. */
export class ChipRename {
    /** @param {HTMLElement} item the chip */
    constructor(item) {
        this.item = item;
        this.group = /** @type {HTMLElement} */ (item.parentElement?.closest(SEGMENTED));
        this.previous = labelOf(item);
        this.busy = false;
        const doc = item.ownerDocument;
        this.field = doc.createElement('input');
        this.field.type = 'text';
        this.field.className = 'kp-field__input kp-segmented__rename';
        this.field.value = this.previous;
        this.field.setAttribute('aria-label', getStrings().segmentedRenameField(this.previous));
        this.field.style.setProperty('--kp-seg-rename-w', `${Math.max(item.getBoundingClientRect().width, 0).toFixed(1)}px`);
        this.why = doc.createElement('p');
        this.why.className = 'kp-field__error kp-segmented__refusal';
        this.why.id = `${valueOf(item).replace(/\W+/g, '-') || 'chip'}-rename-${Math.random().toString(36).slice(2, 8)}`;
        this.why.setAttribute('role', 'alert');
        this.why.hidden = true;
        this.field.setAttribute('aria-describedby', this.why.id);
        this.onKey = (/** @type {KeyboardEvent} */ event) => this.key(event);
        this.onBlur = () => !this.busy && this.end(false);
    }

    /** Turn the chip into the field, its words selected. */
    start() {
        this.item.setAttribute(RENAMING, '');
        this.item.before(this.field);
        this.group.append(this.why);
        this.field.addEventListener('keydown', this.onKey);
        this.field.addEventListener('blur', this.onBlur);
        this.field.focus();
        this.field.select();
    }

    /** @param {KeyboardEvent} event */
    key(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.end(false);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            void this.save();
        }
    }

    /** Ask the page; write the new words, or say why not and keep the field. */
    async save() {
        const label = this.field.value.trim();
        if (label === '') return this.refuse(getStrings().segmentedRenameEmpty);
        if (label === this.previous) return this.end(false);
        /** @type {Promise<unknown> | null} */
        let wait = null;
        const detail = { value: valueOf(this.item), label, previous: this.previous, item: this.item, waitUntil: (/** @type {Promise<unknown>} */ p) => (wait = p) };
        if (!this.group.dispatchEvent(new CustomEvent(RENAME_EVENT, { bubbles: true, cancelable: true, detail }))) return this.refuse(getStrings().segmentedRenameRefused);
        this.busy = true;
        this.field.setAttribute('aria-busy', 'true');
        try {
            const why = refusalIn(await (wait ?? Promise.resolve(null)));
            if (why !== null) return this.refuse(why);
            const words = this.item.querySelector('.kp-segmented__label') ?? this.item;
            words.textContent = label;
            this.end(true);
        } catch (error) {
            this.refuse(error instanceof Error && error.message ? error.message : getStrings().segmentedRenameRefused);
        } finally {
            this.busy = false;
            this.field.removeAttribute('aria-busy');
        }
    }

    /** @param {string} words */
    refuse(words) {
        this.why.textContent = words;
        this.why.hidden = false;
        // Under the field, over what follows: the chips around it do not move.
        this.why.style.setProperty('inset-inline-start', `${this.field.offsetLeft}px`);
        this.why.style.setProperty('inset-block-start', `${this.field.offsetTop + this.field.offsetHeight + 4}px`);
        this.field.setAttribute('aria-invalid', 'true');
        this.field.focus();
    }

    /** Back to the chip, the focus on it. @param {boolean} saved */
    end(saved) {
        this.field.removeEventListener('keydown', this.onKey);
        this.field.removeEventListener('blur', this.onBlur);
        this.field.remove();
        this.why.remove();
        this.item.removeAttribute(RENAMING);
        layout(this.group);
        this.item.focus();
        if (saved) this.item.dispatchEvent(new CustomEvent('kp-segmented-renamed', { bubbles: true, detail: { value: valueOf(this.item), label: labelOf(this.item) } }));
    }
}
