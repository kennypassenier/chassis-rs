// The inspector's card: its bar (count, status filter, voice), its stage and list, and the list drawn from the memory:
// the filter's exact counts, the requests shown, "no match" and "show older".

import { attachSegmented } from '../segmented.js';
import { getStrings } from '../strings.js';
import { classOf, make, msOf, readOptions } from './format.js';
import { drawRequest } from './request.js';

/** @typedef {import('./format.js').Memory} Memory */

/** @param {HTMLElement} el */
export function partsOf(el) {
    const doc = el.ownerDocument;
    if (!el.classList.contains('kp-card')) el.classList.add('kp-card');
    el.classList.add('kp-inspector');
    let bar = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-inspector__bar'));
    let stage = /** @type {HTMLElement | null} */ (el.querySelector(':scope > .kp-card__stage'));
    if (!bar) {
        bar = make(doc, 'kp-inspector__bar');
        const count = make(doc, 'kp-inspector__count', 'p');
        const filter = make(doc, 'kp-segmented kp-inspector__filter');
        filter.setAttribute('data-kp-segmented', 'single');
        filter.setAttribute('role', 'radiogroup');
        filter.setAttribute('aria-label', getStrings().reqFilterLabel);
        const said = make(doc, 'kp-sr-only kp-inspector__live');
        said.setAttribute('role', 'status');
        said.setAttribute('aria-live', 'polite');
        bar.append(count, filter, said);
        el.prepend(bar);
    }
    if (!stage) {
        stage = make(doc, 'kp-card__stage');
        el.append(stage);
    }
    // The card's own module may have made the stage first: the list goes into its data area either way.
    let data = /** @type {HTMLElement | null} */ (stage.querySelector(':scope > .kp-card__data'));
    if (!data) {
        data = make(doc, 'kp-card__data');
        stage.prepend(data);
    }
    if (!data.querySelector('.kp-inspector__list')) {
        const made = make(doc, 'kp-inspector__list');
        made.setAttribute('role', 'list');
        made.setAttribute('aria-label', getStrings().reqLabel);
        data.append(made);
    }
    const list = /** @type {HTMLElement} */ (stage.querySelector('.kp-inspector__list'));
    return {
        bar,
        count: /** @type {HTMLElement} */ (bar.querySelector('.kp-inspector__count')),
        filter: /** @type {HTMLElement} */ (bar.querySelector('.kp-inspector__filter')),
        stage,
        list,
    };
}

/** @param {HTMLElement} el @param {Memory} memory */
export function draw(el, memory) {
    // The attributes are read each time, so a page that flips one is heard at once.
    memory.options = { ...readOptions(el), ...memory.given };
    const strings = getStrings();
    const doc = el.ownerDocument;
    const p = partsOf(el);
    const all = [...memory.list].sort((a, b) => (msOf(b.at) || 0) - (msOf(a.at) || 0));
    // The filter's counts, exact.
    const byClass = new Map();
    for (const r of all) byClass.set(classOf(r.status), (byClass.get(classOf(r.status)) ?? 0) + 1);
    const choices = [['all', strings.reqFilterAll, all.length], ...['2xx', '3xx', '4xx', '5xx'].map((c) => [c, c, byClass.get(c) ?? 0])];
    if (!p.filter.querySelector('.kp-segmented__item')) {
        for (const [value] of choices) {
            const item = make(doc, 'kp-segmented__item', 'button');
            item.setAttribute('type', 'button');
            item.setAttribute('role', 'radio');
            item.dataset.value = String(value);
            item.append(make(doc, 'kp-segmented__label', 'span'), make(doc, 'kp-segmented__count', 'span'));
            p.filter.append(item);
        }
        attachSegmented(p.bar);
    }
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (p.filter.querySelectorAll('.kp-segmented__item'))) {
        const choice = choices.find((c) => String(c[0]) === item.dataset.value);
        if (!choice) continue;
        /** @type {HTMLElement} */ (item.querySelector('.kp-segmented__label')).textContent = String(choice[1]);
        /** @type {HTMLElement} */ (item.querySelector('.kp-segmented__count')).textContent = String(choice[2]);
        item.setAttribute('aria-checked', String(item.dataset.value === memory.filter));
    }
    const matching = memory.filter === 'all' ? all : all.filter((r) => classOf(r.status) === memory.filter);
    const visible = matching.slice(0, memory.shown);
    p.count.textContent = strings.reqCount(visible.length, matching.length);

    const nodes = /** @type {Node[]} */ ([]);
    visible.forEach((request, i) => nodes.push(drawRequest(el, memory, request, i, all.indexOf(request))));
    if (matching.length === 0 && all.length > 0) {
        const none = make(doc, 'kp-inspector__nomatch');
        const title = make(doc, 'kp-inspector__nomatch-title', 'strong');
        title.textContent = strings.reqNoMatch;
        const reset = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button', 'button'));
        reset.type = 'button';
        reset.dataset.kpRequestsFilter = 'all';
        reset.textContent = strings.reqFilterAll;
        none.append(title, reset);
        nodes.push(none);
    }
    if (matching.length > visible.length) {
        const more = /** @type {HTMLButtonElement} */ (make(doc, 'kp-button kp-inspector__older', 'button'));
        more.type = 'button';
        more.dataset.kpRequestsOlder = '';
        more.textContent = strings.reqShowOlder(matching.length - visible.length);
        nodes.push(more);
    }
    p.list.replaceChildren(...nodes);
}

