// What a combobox does with a choice: take an option, add or remove a tag, and replace the held values.
import { OPTION_SELECTOR } from '../listbox.js';
import { getStrings } from '../strings.js';
import { ComboboxBase } from './core.js';
import { labelOf } from './helpers.js';

export class ComboboxTags extends ComboboxBase {
    /** A tag list written `hidden` is hidden while it holds no tag. */
    showTags() {
        if (this.tagList !== null && this.tagsHidden) this.tagList.hidden = this.chosen.length === 0;
    }

    /** @param {string} value @param {string} label */
    tagElement(value, label) {
        const { renderTag, removeGlyph } = this.settings;
        if (renderTag !== undefined) {
            const custom = renderTag(value, label);
            custom.dataset.value = value;
            custom.classList.add('kp-tag');
            return custom;
        }
        const tag = document.createElement('span');
        tag.className = 'kp-tag';
        tag.dataset.value = value;
        const text = document.createElement('span');
        text.textContent = label;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'kp-tag__remove';
        // A bare glyph is "times" to a screen reader; the name says what it removes, because a row of ten identical buttons is
        // useless without it.
        remove.setAttribute('aria-label', getStrings().removeNamed(label));
        remove.textContent = this.host.dataset.kpRemoveGlyph ?? removeGlyph;
        tag.append(text, remove);
        return tag;
    }

    /** @param {string} value @param {string} label */
    addTag(value, label) {
        const { chosen, tagList } = this;
        if (chosen.length >= this.cap) return;
        if (this.duplicates || !chosen.includes(value)) {
            chosen.push(value);
            if (tagList !== null) tagList.append(this.tagElement(value, label));
            this.showTags();
        }
        this.input.value = '';
        this.filter();
        // Kept open: adding one tag almost always means adding another, and reopening the list by hand is friction the
        // keyboard user pays and the mouse user does not.
        if (this.stays) this.open();
        else this.close();
        this.announce(value, label, 'add');
    }

    /** @param {HTMLElement} option */
    take(option) {
        if (this.hook?.choose?.(option)) return;
        // Two different things, and conflating them is a real bug the contract suite caught between the channels: the LABEL
        // is what a person reads in the field, the VALUE is what the consumer gets in the event. `data-value` is optional,
        // so an option without one uses its own text for both.
        const label = labelOf(option);
        const value = option.dataset.value ?? label;
        if (this.isTags) {
            this.addTag(value, label);
            return;
        }
        this.input.value = label;
        this.close();
        this.announce(value, label, 'add');
    }

    /**
     * Typed text ends a tag [scope-60]. Before this, Enter with nothing highlighted had nothing to take, so a tag input
     * filtered and removed but never added from the keyboard. Text naming an option takes it; other text becomes its own tag
     * where the box allows new values.
     * @returns {boolean} whether a tag was added
     */
    addTyped() {
        const typed = this.input.value.trim();
        if (typed === '') return false;
        const named = [...this.list.querySelectorAll(OPTION_SELECTOR)].find(
            (element) =>
                !element.matches('[aria-disabled="true"], [data-kp-disabled]') && (element.textContent ?? '').trim().toLowerCase() === typed.toLowerCase(),
        );
        if (named instanceof HTMLElement) {
            this.take(named);
            return true;
        }
        if (!this.creates) return false;
        this.addTag(typed, typed);
        return true;
    }

    /** @param {string} value */
    removeValue(value) {
        const at = this.chosen.indexOf(value);
        if (at === -1) return;
        this.chosen.splice(at, 1);
        const tag = /** @type {HTMLElement | null} */ (this.tagList?.querySelector(`.kp-tag[data-value="${CSS.escape(value)}"]`) ?? null);
        const label = tag?.querySelector('span')?.textContent ?? value;
        tag?.remove();
        this.showTags();
        this.filter();
        this.announce(value, label, 'remove');
    }

    /** Replace the held values (a combobox takes the first). @param {readonly string[]} values */
    setValues(values) {
        const { chosen, tagList, input } = this;
        if (this.isTags) {
            chosen.splice(0, chosen.length);
            if (tagList) tagList.replaceChildren();
            for (const value of values.slice(0, this.cap)) {
                if (!this.duplicates && chosen.includes(value)) continue;
                chosen.push(value);
                tagList?.append(this.tagElement(value, labelOf(this.optionFor(value), value)));
            }
            this.showTags();
            this.filter();
            this.announce(values[values.length - 1] ?? '', '', 'set');
        } else {
            const value = values[0] ?? '';
            input.value = labelOf(this.optionFor(value), value);
            this.announce(value, input.value, 'set');
        }
    }
}
