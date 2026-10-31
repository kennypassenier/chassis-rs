// One wired facet group: its rows brought in step, its status region, and the change and "only" presses, caught on the group so rows written later are covered.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { getFacetValues, setFacetValues } from './api.js';
import { el, nameOf, rowsOf, syncGroup } from './rows.js';
import { FACET_EVENT } from './values.js';

/** How long before the status region says its sentence, in ms: longer when the region was only just made, so a screen reader has it registered. */
const SAY_FIRST_MS = 100;
const SAY_MS = 30;

export class FacetGroup extends Controller {
    connect() {
        const group = this.host;
        syncGroup(group);
        this.region();
        this.listen(group, 'change', (event) => this.onChange(event));
        this.listen(group, 'click', (event) => this.onPress(event));
    }

    /** The group's status region, made on first need (right after the group). @returns {HTMLElement} */
    region() {
        const group = this.host;
        const next = group.nextElementSibling;
        if (next instanceof HTMLElement && next.classList.contains('kp-facets__live')) return next;
        const region = el('kp-sr-only kp-facets__live');
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        group.after(region);
        return region;
    }

    /** Say something through the group's region. @param {string} message */
    say(message) {
        const fresh = !(this.host.nextElementSibling?.classList.contains('kp-facets__live') ?? false);
        const region = this.region();
        // Cleared first so the same sentence twice in a row is still heard.
        region.textContent = '';
        setTimeout(() => (region.textContent = message), fresh ? SAY_FIRST_MS : SAY_MS);
    }

    /** @param {string} source @param {string} [value] */
    emit(source, value) {
        const group = this.host;
        group.dispatchEvent(new CustomEvent(FACET_EVENT, { bubbles: true, detail: { group, values: getFacetValues(group), source, value } }));
    }

    /** @param {Event} event */
    onChange(event) {
        const group = this.host;
        const check = event.target instanceof HTMLInputElement ? event.target : null;
        const row = check?.closest('.kp-facet');
        if (!check || !row || !group.contains(row)) return;
        if (row.hasAttribute('data-kp-facet-all')) {
            // Everything always means every row on; unchecking it again changes nothing.
            const before = getFacetValues(group).length;
            setFacetValues(group, null);
            this.say(getStrings().facetShowingAll);
            if (before !== rowsOf(group).length) this.emit('all');
            return;
        }
        syncGroup(group);
        this.emit('toggle', row.getAttribute('data-value') ?? '');
    }

    /** @param {Event} event */
    onPress(event) {
        const group = this.host;
        const only = event.target instanceof Element ? event.target.closest('.kp-facet__only') : null;
        const row = only?.closest('.kp-facet');
        if (!only || !row || !group.contains(row)) return;
        const value = row.getAttribute('data-value') ?? '';
        setFacetValues(group, [value]);
        this.say(getStrings().facetShowingOnly(nameOf(row)));
        this.emit('only', value);
    }
}
