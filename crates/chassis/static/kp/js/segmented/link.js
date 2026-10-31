// A group tied to a tag input or combobox: the chips and the field hold the same values, in both directions, always (`data-kp-segmented-for="<combobox id>"`).
//
// The pattern [mc-r2, Kenny's verdict on pills-none, 2026-10-31]: the chips are the common choices, the field searches all of them, and the two never
// disagree. Choosing in the field lights the chip; pressing a chip puts the value in the field (and taking it off removes it). The field exists only
// when the choices are more than the chips: when every choice is a chip, the page shows no field.
//
//   <div class="kp-segmented kp-segmented--chips" data-kp-segmented="multi" data-kp-segmented-for="symptoms" data-kp-segmented-top="4"></div>
//
// `data-kp-segmented-top="4"` makes the chips from the field's options: the 4 most used (`data-kp-uses` on an option, else the list's order).
// `all` makes every choice a chip, which leaves no field. A group that already holds chips keeps them. `data-kp-segmented-field="always"` keeps the field
// anyway. While the field is on the page and has no placeholder of its own it says "Search all 9". The options are read at attach and when these two
// attributes change.
//
// A group drawn after load [fix-1031]: attachSegmented(root) watches its root, so a linked group that arrives under a root that is attached is linked
// as it arrives (one attachSegmented(document) is enough); a group under no attached root is linked by calling attachSegmented on that root again.
// The attribute is read when the group is first wired, so it must be in the group's markup when it arrives.

import { Controller } from '../controller.js';
import { combobox } from '../combobox/handle.js';
import { CHANGE_EVENT, INPUT } from '../combobox/constants.js';
import { getStrings } from '../strings.js';
import { watchOptions } from '../live-options.js';
import { SEGMENTED_EVENT } from './constants.js';
import { getSegmentedValues, isMulti, itemsOf, valueOf } from './read.js';
import { buildItem, setSegmentedItems } from './items.js';
import { paint } from './paint.js';
import { FIELD_ATTRIBUTE, TOP_ATTRIBUTE, choiceNamed, choicesOf, chipCount, fieldNeeded, mostUsed } from './link-choices.js';

/** The attribute that names the combobox a group is tied to. */
export const LINK_ATTRIBUTE = 'data-kp-segmented-for';

/** On the field's input while its placeholder is the one this link wrote. */
const MADE = 'data-kp-search-placeholder';

/** One group tied to one combobox. Values in the field that no chip stands for (typed ones) are kept as they are. */
export class SegmentedLink extends Controller {
    constructor(/** @type {HTMLElement} */ host) {
        super(host);
        /** True while this link writes to the field, so its own change is not read back. */
        this.writing = false;
        /** Whether the first connect is over, after which chips are replaced through the group's own call. */
        this.ready = false;
    }

    /** The combobox the group names, or null while it is not on the page. @returns {HTMLElement | null} */
    target() {
        const id = this.host.getAttribute(LINK_ATTRIBUTE);
        return id ? this.host.ownerDocument.getElementById(id) : null;
    }

    /** Whether the field holds one value (a combobox) and not a set of tags. */
    single() {
        return !this.target()?.hasAttribute('data-kp-tags');
    }

    connect() {
        const root = this.host.ownerDocument;
        // Every value on is not "All" here: the chips are choices, not a filter.
        if (!this.host.hasAttribute('data-kp-segmented-collapse')) this.host.setAttribute('data-kp-segmented-collapse', 'false');
        this.makeChips();
        this.listen(this.host, SEGMENTED_EVENT, () => this.toField());
        this.listen(root, CHANGE_EVENT, (event) => {
            if (!this.writing && event.target === this.target()) this.fromField();
        });
        // Typing in a single field: the words name a choice, and its chip lights; other words let the chip go.
        this.listen(root, 'input', (event) => {
            const field = this.target();
            if (!this.writing && field && event.target instanceof HTMLInputElement && field.contains(event.target) && this.single()) this.fromField();
        });
        this.own(watchOptions(this.host, [TOP_ATTRIBUTE, FIELD_ATTRIBUTE], () => this.rebuild()));
        this.keepField();
        this.fitField();
        this.fromField();
        this.ready = true;
        // The field may be attached after the group: read it again once the page has attached everything.
        const frame = this.host.ownerDocument.defaultView?.requestAnimationFrame(() => this.fromField());
        if (frame !== undefined) this.own(() => this.host.ownerDocument.defaultView?.cancelAnimationFrame(frame));
    }

    /** The chips the field's choices ask for: the first time written straight into the group, which the group then enhances. */
    makeChips() {
        const field = this.target();
        const choices = field ? choicesOf(field) : [];
        const count = chipCount(this.host.getAttribute('data-kp-segmented-top'), choices.length);
        if (count === null || (!this.ready && itemsOf(this.host).length > 0)) return;
        const specs = mostUsed(choices, count).map(({ value, label }) => ({ value, label }));
        if (this.ready) return setSegmentedItems(this.host, specs);
        const look = { multi: isMulti(this.host), tri: false, kept: new Map() };
        this.host.replaceChildren(...specs.map((spec) => buildItem(spec, look)));
    }

    /** The chips or the way the field is shown changed: draw both again and bring the chips into step with the field. */
    rebuild() {
        this.makeChips();
        this.fitField();
        this.fromField();
    }

    /** Remember the field as the page left it, and put it back on detach. */
    keepField() {
        const field = this.target();
        if (!field) return;
        const was = field.hidden;
        this.own(() => {
            field.hidden = was;
            const input = field.querySelector(INPUT);
            if (input instanceof HTMLInputElement && input.hasAttribute(MADE)) {
                input.removeAttribute(MADE);
                input.placeholder = '';
            }
        });
    }

    /** Leave the field out while every choice is a chip, say what it searches while it stays. */
    fitField() {
        const field = this.target();
        if (!field) return;
        const choices = choicesOf(field);
        const needed = fieldNeeded(choices, this.chipValues(), this.host.getAttribute('data-kp-segmented-field'));
        field.hidden = !needed;
        const input = field.querySelector(INPUT);
        if (!(input instanceof HTMLInputElement)) return;
        const mine = input.hasAttribute(MADE);
        const says = needed && choices.length > this.chipValues().size && (mine || input.placeholder === '');
        if (says) input.placeholder = getStrings().segmentedSearchAll(choices.length);
        else if (mine) input.placeholder = '';
        input.toggleAttribute(MADE, says);
    }

    /** The values the chips stand for. @returns {Set<string>} */
    chipValues() {
        return new Set(itemsOf(this.host).map(valueOf));
    }

    /** The chips pressed: a tag input keeps its own values and takes the chips' on top; a combobox takes the chip chosen, or empties when none is. */
    toField() {
        const handle = combobox(this.target() ?? this.host);
        if (!handle) return;
        const pressed = getSegmentedValues(this.host);
        const chips = this.chipValues();
        const own = this.single() ? [] : handle.values().filter((value) => !chips.has(value));
        this.writing = true;
        try {
            handle.set([...own, ...pressed]);
        } finally {
            this.writing = false;
        }
    }

    /** The field changed: the chips turn on for the choices it holds, and off for the ones it let go. */
    fromField() {
        const field = this.target();
        const handle = combobox(field ?? this.host);
        if (!field || !handle) return;
        const chips = this.chipValues();
        if (!this.single()) {
            paint(this.host, handle.values().filter((value) => chips.has(value)));
            return;
        }
        const named = choiceNamed([...choicesOf(field), ...this.chipChoices()], handle.values()[0] ?? '');
        paint(this.host, named && chips.has(named.value) ? [named.value] : []);
    }

    /** The chips as choices, for a field whose list does not hold them. @returns {import('./link-choices.js').Choice[]} */
    chipChoices() {
        return itemsOf(this.host).map((item) => ({ value: valueOf(item), label: item.textContent?.trim() ?? '', uses: 0 }));
    }
}
