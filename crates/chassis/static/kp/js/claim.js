// Who brings it: a claim on every row of a checklist [kpadopt6; kp-soft's packing list "Ik breng mee"].
//
// A checklist (js/checklist.js) whose items can be taken on by people. The row keeps its box, its label and its detail;
// one more cell stands at the end of it, in a column of its own so the names line up from row to row:
//
//   <div class="kp-checklist" data-kp-checklist data-kp-checklist-claim aria-label="Packing list"></div>
//
//   setClaimViewer(list, { id: 'kenny', name: 'Kenny' });          // who is looking: the page decides, the module reads no session
//   setChecklistItems(list, [{ id: 'stove', label: 'Gas stove', group: 'Kitchen', claim: { by: [{ id: 'tom', name: 'Tom' }] } }, …]);
//   list.addEventListener('kp-claim-change', (e) => e.detail.settle(api.claim(e.detail.id, e.detail.by)));
//
// Kenny, 2026-10-17 ("Meerdere personen kunnen een item meenemen"): an item has a list of people, not one. Taking an item
// adds you, letting go takes you off, and nobody ever takes an item over from somebody else; `data-kp-claim-max` caps how
// many may bring one (0, the default, no cap). That answers the spec's question about taking over: there is nothing to
// take over.
//
// What a row shows. The people who bring it (`both`: their mark in their own colour and their name; a long list wraps),
// or, when nobody does, a loud gap: the destructive edge, a glyph and the words "Nobody yet", never colour alone. Then one
// button: "I'll bring it", or while you are one of them "I'm bringing it" (pressed; a press lets go). Its three faces
// ("I'll bring it", the held one, the spinner) share one grid cell, so the button never changes width.
//
// What a press does. The page hears the cancelable `kp-claim-change` and may call `detail.settle(promise)`: the button
// shows the spinner and the row does not move until the answer. A promise that resolves (to nothing or `true`) lets the
// change stand; one that rejects, resolves `false` or resolves `{ refused: true, by?, error? }` puts the row back to
// what the server says (`by`), flashes the row's edge for 3000 ms and says it in a polite line ("Tom took it just before
// you"). Without `settle` the change stands at once. Letting go (and removing somebody in assign mode) offers Undo.
//
// Options (attributes on the list, each also an option of `attachClaims`):
//   data-kp-checklist-claim        present: the claim part is on
//   data-kp-claim-mode             `claim` (default, a button on each row) or `assign` (a person menu on each row)
//   data-kp-claim-gap              `loud` (default) or `quiet`
//   data-kp-claim-gap-sort         `keep` (default) or `top` (rows nobody takes go first inside their group)
//   data-kp-claim-filter           `all` (default) | `gaps` | `mine`, shown as a chip group in the bar; `false` hides the chips
//   data-kp-claim-person           `both` (default) | `idmark` | `name`
//   data-kp-claim-count            `both` (default) | `bar` | `group` | `none`
//   data-kp-claim-undo-ms          Undo after a release (default 6000, 0 for none)
//   data-kp-claim-self-label       the take face's words (default the dictionary's)
//   data-kp-claim-max              how many people may bring one item (default 0: no cap)
//   data-kp-claim-keys             `false` turns the keys off (`c` on a focused row, `Shift C` for the gaps)
//   data-kp-claim-take-all         present: "Take every open item" in the bar, behind Undo
//   data-kp-claim-copy             present: "Copy the open list" in the bar
//   data-kp-claim-disabled         present: nobody can press (with `data-kp-claim-disabled-reason`)
//   data-kp-remember="claim-filter" keeps the chip across visits
//
// Events (bubbling, on the list): `kp-claim-change` `{ id, action, person, by, previousBy, items, settle }` (cancelable),
// `kp-claim-filter` `{ filter }`, `kp-claim-retry` (the Retry of a failed list). `setClaim(list, id, claim)` is a push
// update (another person took it while the page was open). Every word is in js/strings.js; nothing runs on import.

import { getStrings } from './strings.js';
import { CHECKLIST_RENDER_EVENT, getChecklistItems, setChecklistItems } from './checklist.js';
import { setIdmark } from './idmark.js';
import { setMenu, attachMenuButtons, MENU_SELECT_EVENT } from './menu-button.js';
import { attachDisabledReasons } from './reason.js';
import { registerShortcuts } from './shortcuts.js';
import { undoToast } from './undo-toast.js';
import { memoryFor } from './remember.js';
import { statePlate } from './state-plate.js';

/** The lists this module looks after. */
export const CLAIM = '[data-kp-checklist-claim]';
/** Fired on the list, bubbling and cancelable, when somebody takes an item, lets go or is assigned. */
export const CLAIM_EVENT = 'kp-claim-change';
/** Fired when the filter chip changes: `{ filter }`. */
export const CLAIM_FILTER_EVENT = 'kp-claim-filter';
/** Fired when the Retry of a failed list is pressed. */
export const CLAIM_RETRY_EVENT = 'kp-claim-retry';
/** The filters of the chip group. */
export const CLAIM_FILTERS = Object.freeze(['all', 'gaps', 'mine']);
/** How long a refused row keeps its mark [ms]. */
export const CLAIM_REFUSED_MS = 3000;
/** How long Undo is offered after a release [ms]. */
export const CLAIM_UNDO_MS = 6000;

/**
 * @typedef {object} ClaimPerson
 * @property {string} id
 * @property {string} name
 */

/**
 * What an item carries as `claim`. `by` may also be one person or null.
 * @typedef {object} ClaimInfo
 * @property {ClaimPerson | ClaimPerson[] | null} [by]  who brings it
 * @property {string} [locked]  the reason nobody can change it ("Already packed in the van")
 */

/**
 * @typedef {object} ClaimDetail
 * @property {string} id
 * @property {'join' | 'leave' | 'assign' | 'unassign' | 'restore' | 'take-all'} action
 * @property {ClaimPerson | null} person  who the change is about
 * @property {ClaimPerson[]} by  who bring it after the change
 * @property {ClaimPerson[]} previousBy
 * @property {(answer: Promise<unknown>) => void} settle  hold the row on its spinner until the server has answered
 */

/** @typedef {{ viewer: ClaimPerson | null, people: ClaimPerson[], busy: Set<string>, refused: Map<string, number>, filter: string, off: (() => void)[], said: string }} ClaimState */
/** @type {WeakMap<Element, ClaimState>} */
const STATE = new WeakMap();

let serial = 0;

/** @param {string} className @param {string} [tag] */
const el = (className, tag = 'div') => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
};

/** @param {ClaimPerson | ClaimPerson[] | null | undefined} by @returns {ClaimPerson[]} */
export function claimPeople(by) {
    if (!by) return [];
    return (Array.isArray(by) ? by : [by]).filter((p) => p && p.id !== undefined).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) }));
}

/** @param {Element} list @param {string} name @param {string} fallback */
const attr = (list, name, fallback) => list.getAttribute(`data-kp-claim-${name}`) ?? fallback;

/** @param {Element} list */
const stateOf = (list) => {
    let s = STATE.get(list);
    if (!s) {
        s = { viewer: null, people: [], busy: new Set(), refused: new Map(), filter: 'all', off: [], said: '' };
        STATE.set(list, s);
    }
    return s;
};

/**
 * Say who is looking. Their button is the live one, their name the held face.
 * @param {Element} list @param {ClaimPerson | null} viewer
 */
export function setClaimViewer(list, viewer) {
    if (!(list instanceof HTMLElement)) return;
    stateOf(list).viewer = viewer ? claimPeople(viewer)[0] : null;
    decorate(list);
}

/**
 * Give the assign menu its people (the viewer is added first when missing).
 * @param {Element} list @param {ClaimPerson[]} people
 */
export function setClaimPeople(list, people) {
    if (!(list instanceof HTMLElement)) return;
    stateOf(list).people = claimPeople(people);
    decorate(list);
}

/** The filter now shown. @param {Element} list */
export function claimFilter(list) {
    return stateOf(list).filter;
}

/** @param {Element} list @param {string} filter */
export function setClaimFilter(list, filter) {
    if (!(list instanceof HTMLElement) || !CLAIM_FILTERS.includes(filter)) return;
    const s = stateOf(list);
    if (s.filter === filter) return;
    s.filter = filter;
    memoryFor(list, 'claim')?.write('filter', filter);
    decorate(list);
    list.dispatchEvent(new CustomEvent(CLAIM_FILTER_EVENT, { bubbles: true, detail: { filter } }));
}

/** @param {HTMLElement} list @param {string} message */
function say(list, message) {
    let region = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-claim__live'));
    if (!region) {
        region = el('kp-sr-only kp-claim__live', 'span');
        region.setAttribute('role', 'status');
        list.append(region);
    }
    const target = region;
    target.textContent = '';
    setTimeout(() => (target.textContent = message), 60);
}

/** The claim of an item as a normalised list. @param {{ claim?: ClaimInfo }} item */
const byOf = (item) => claimPeople(item.claim?.by);

/** @param {HTMLElement} list @param {string} id */
const itemOf = (list, id) => getChecklistItems(list).find((i) => i.id === id);

/**
 * Write a new claim onto one item, through the checklist so the rows are changed in place.
 * @param {HTMLElement} list @param {string} id @param {ClaimPerson[]} by
 */
function write(list, id, by) {
    setChecklistItems(
        list,
        getChecklistItems(list).map((i) => (i.id === id ? { ...i, claim: { ...i.claim, by } } : i)),
    );
}

/**
 * A push update: the item's claim as the server says it now, without an event.
 * @param {Element} list @param {string} id @param {ClaimInfo} claim
 */
export function setClaim(list, id, claim) {
    if (!(list instanceof HTMLElement)) return;
    setChecklistItems(
        list,
        getChecklistItems(list).map((i) => (i.id === id ? { ...i, claim: { ...claim, by: claimPeople(claim.by) } } : i)),
    );
}

/** @param {HTMLElement} list */
const mode = (list) => (attr(list, 'mode', 'claim') === 'assign' ? 'assign' : 'claim');

/** Whether this person is one of those who bring the item. @param {ClaimPerson | null} person @param {ClaimPerson[]} by */
const among = (person, by) => person !== null && by.some((p) => p.id === person.id);

/** Words for a list of names: "Tom", "Tom and Anna", "Tom, Anna and Bo". @param {string[]} names */
function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} ${getStrings().claimAnd} ${names[names.length - 1]}`;
}

/** Why a row cannot be pressed now, or null. @param {HTMLElement} list @param {{ claim?: ClaimInfo }} item @param {ClaimPerson[]} by */
function whyOff(list, item, by) {
    const s = getStrings();
    const st = stateOf(list);
    if (list.hasAttribute('data-kp-claim-disabled')) return list.getAttribute('data-kp-claim-disabled-reason') ?? s.claimDisabled;
    if (item.claim?.locked) return item.claim.locked;
    if (!st.viewer && mode(list) === 'claim') return s.claimNoViewer;
    const max = Number(attr(list, 'max', '0')) || 0;
    if (max > 0 && by.length >= max && !among(st.viewer, by) && mode(list) === 'claim') return s.claimFullReason(max);
    return null;
}

/** Build the cell of one row, once. @param {HTMLElement} list @param {HTMLElement} row */
function cellFor(list, row) {
    let cell = /** @type {HTMLElement | null} */ (row.querySelector(':scope > .kp-claim'));
    if (cell) return cell;
    cell = el('kp-claim');
    const people = el('kp-claim__people');
    const control = el('kp-claim__control');
    cell.append(people, control);
    row.append(cell);
    return cell;
}

/** The button with its three faces in one grid cell. @param {HTMLElement} list */
function buildButton(list) {
    const s = getStrings();
    const button = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm kp-claim__button', 'button'));
    button.type = 'button';
    button.setAttribute('data-kp-claim-action', '');
    const take = el('kp-claim__face kp-claim__face--take', 'span');
    take.textContent = attr(list, 'self-label', s.claimTake);
    const held = el('kp-claim__face kp-claim__face--held', 'span');
    held.textContent = s.claimHeld;
    const busy = el('kp-claim__face kp-claim__face--busy', 'span');
    const spin = el('kp-spinner', 'span');
    busy.append(spin);
    button.append(take, held, busy);
    return button;
}

/** Fill one row's cell from its item. @param {HTMLElement} list @param {HTMLElement} row @param {ReturnType<typeof getChecklistItems>[number]} item */
function fillRow(list, row, item) {
    const s = getStrings();
    const st = stateOf(list);
    const cell = cellFor(list, row);
    const by = byOf(item);
    const assign = mode(list) === 'assign';
    const loud = attr(list, 'gap', 'loud') !== 'quiet';
    const person = attr(list, 'person', 'both');
    const busy = st.busy.has(item.id);
    row.toggleAttribute('data-kp-claim-gap', by.length === 0);
    row.toggleAttribute('data-kp-claim-loud', by.length === 0 && loud);
    row.toggleAttribute('data-kp-claim-mine', among(st.viewer, by));
    row.toggleAttribute('data-kp-claim-refused', st.refused.has(item.id));
    row.toggleAttribute('data-kp-claim-busy', busy);

    // The people (or the gap).
    const people = /** @type {HTMLElement} */ (cell.querySelector('.kp-claim__people'));
    const signature = `${by.map((p) => `${p.id}:${p.name}`).join('|')}|${person}|${by.length === 0 ? (loud ? 'L' : 'Q') : ''}`;
    if (people.getAttribute('data-sig') !== signature) {
        people.setAttribute('data-sig', signature);
        people.replaceChildren();
        if (by.length === 0) {
            const gap = el('kp-claim__gap');
            const glyph = el('kp-claim__glyph', 'span');
            glyph.setAttribute('aria-hidden', 'true');
            const words = el('kp-claim__nobody', 'span');
            words.textContent = s.claimNobody;
            gap.append(glyph, words);
            people.append(gap);
        } else {
            for (const p of by) {
                const chip = el('kp-claim__person', 'span');
                if (person !== 'name') {
                    const mark = el('kp-idmark kp-idmark--sm kp-idmark--round', 'span');
                    setIdmark(mark, p.name);
                    chip.append(mark);
                }
                if (person !== 'idmark') {
                    const name = el('kp-claim__name', 'span');
                    name.textContent = p.name;
                    chip.append(name);
                } else {
                    chip.classList.add('kp-claim__person--mark');
                    const sr = el('kp-sr-only', 'span');
                    sr.textContent = p.name;
                    chip.append(sr);
                }
                people.append(chip);
            }
        }
    }
    people.setAttribute('role', 'group');
    people.setAttribute('aria-label', by.length ? s.claimBy(joinNames(by.map((p) => p.name))) : s.claimNobodyLabel);

    // The control.
    const control = /** @type {HTMLElement} */ (cell.querySelector('.kp-claim__control'));
    const off = whyOff(list, item, by);
    if (!assign) {
        let button = /** @type {HTMLButtonElement | null} */ (control.querySelector('.kp-claim__button'));
        if (!button) {
            button = buildButton(list);
            control.replaceChildren(button);
        }
        const mine = among(st.viewer, by);
        const takeFace = button.querySelector('.kp-claim__face--take');
        if (takeFace && takeFace.textContent !== attr(list, 'self-label', s.claimTake)) takeFace.textContent = attr(list, 'self-label', s.claimTake);
        button.setAttribute('data-kp-claim-face', busy ? 'busy' : mine ? 'held' : 'take');
        button.setAttribute('aria-pressed', String(mine));
        button.setAttribute('aria-label', mine ? s.claimHeldLabel(item.label) : s.claimTakeLabel(item.label));
        button.classList.toggle('kp-button--primary', !mine && by.length === 0);
        button.toggleAttribute('aria-busy', busy);
        const blocked = off !== null || busy;
        button.disabled = blocked && off !== null;
        button.setAttribute('aria-disabled', String(blocked));
        if (off !== null) button.setAttribute('data-kp-disabled-reason', off);
        else button.removeAttribute('data-kp-disabled-reason');
    } else {
        let wrapper = /** @type {HTMLElement | null} */ (control.querySelector('.kp-menu-button'));
        if (!wrapper) {
            wrapper = el('kp-menu-button kp-claim__assign');
            wrapper.setAttribute('data-kp-menu-button', '');
            const open = /** @type {HTMLButtonElement} */ (el('kp-button kp-button--sm', 'button'));
            open.type = 'button';
            const menu = el('kp-menu kp-menu--rich');
            menu.setAttribute('role', 'menu');
            wrapper.append(open, menu);
            control.replaceChildren(wrapper);
            attachMenuButtons(control);
        }
        wrapper.setAttribute('data-kp-key', item.id);
        const open = /** @type {HTMLButtonElement} */ (wrapper.querySelector(':scope > button'));
        open.textContent = s.claimAssign;
        open.setAttribute('aria-label', s.claimAssignOf(item.label));
        open.disabled = off !== null;
        if (off !== null) open.setAttribute('data-kp-disabled-reason', off);
        else open.removeAttribute('data-kp-disabled-reason');
        const everyone = [...st.people];
        for (const p of by) if (!everyone.some((q) => q.id === p.id)) everyone.push(p);
        setMenu(wrapper, [
            {
                group: s.claimAssignHeading,
                items: everyone.map((p) => ({ label: p.name, hint: among(p, by) ? s.claimAssigned : s.claimNotAssigned, value: p.id })),
            },
        ]);
    }
}

/** Show the width of the widest face on the list's buttons: the faces already share one cell, so nothing to do here. */

/** Everything that depends on the whole list: the groups' counts, the bar, the filter, the order, the plate. @param {HTMLElement} list */
function decorate(list) {
    const s = getStrings();
    const st = stateOf(list);
    const items = getChecklistItems(list);
    const body = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-checklist__body'));
    if (!body) return;
    const countMode = attr(list, 'count', 'both');
    const gapSort = attr(list, 'gap-sort', 'keep') === 'top';
    /** @type {Map<string, typeof items[number]>} */
    const byId = new Map(items.map((i) => [i.id, i]));
    const loading = list.hasAttribute('aria-busy');

    for (const row of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll('.kp-checklist__item'))) {
        const item = byId.get(row.getAttribute('data-id') ?? '');
        if (item) fillRow(list, row, item);
    }

    // The filter hides rows (never removes them), and a group with no row left hides too.
    let shown = 0;
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (body.querySelectorAll(':scope > .kp-checklist__group'))) {
        let rows = 0;
        const members = /** @type {HTMLElement[]} */ ([...section.querySelectorAll('.kp-checklist__item')]);
        let claimed = 0;
        for (const row of members) {
            const gap = row.hasAttribute('data-kp-claim-gap');
            if (!gap) claimed += 1;
            const keep = st.filter === 'all' || (st.filter === 'gaps' && gap) || (st.filter === 'mine' && row.hasAttribute('data-kp-claim-mine'));
            row.hidden = !keep;
            if (keep) rows += 1;
        }
        shown += rows;
        section.hidden = rows === 0;
        // The group's own count of what is taken.
        const head = section.querySelector('.kp-checklist__head');
        let own = /** @type {HTMLElement | null} */ (head?.querySelector('.kp-claim__group-count') ?? null);
        if (head && !own) {
            own = el('kp-claim__group-count', 'span');
            head.querySelector('.kp-checklist__count')?.before(own);
        }
        if (own) {
            own.hidden = countMode === 'bar' || countMode === 'none';
            own.textContent = s.claimGroupCount(claimed, members.length);
        }
        if (gapSort) {
            const list_ = /** @type {HTMLElement | null} */ (section.querySelector('.kp-checklist__list'));
            if (list_) {
                const open = members.filter((r) => !r.hasAttribute('data-kp-checklist-checked'));
                const rank = (/** @type {HTMLElement} */ r) => (r.hasAttribute('data-kp-claim-gap') ? 0 : 1);
                const wanted = [...open].sort((a, b) => rank(a) - rank(b) || members.indexOf(a) - members.indexOf(b));
                const done = members.filter((r) => r.hasAttribute('data-kp-checklist-checked'));
                const order = [...wanted, ...done];
                if (order.some((r, i) => list_.children[i] !== r)) {
                    const focused = document.activeElement instanceof HTMLElement && list_.contains(document.activeElement) ? document.activeElement : null;
                    list_.append(...order);
                    focused?.focus({ preventScroll: true });
                }
            }
        }
    }

    // The bar: the count of rows nobody takes, the chip group, the optional actions.
    const bar = /** @type {HTMLElement | null} */ (list.querySelector(':scope > .kp-checklist__bar'));
    if (bar) {
        const gaps = items.filter((i) => byOf(i).length === 0).length;
        let tools = /** @type {HTMLElement | null} */ (bar.querySelector(':scope > .kp-claim__bar'));
        if (!tools) {
            tools = el('kp-claim__bar');
            const summary = el('kp-claim__summary', 'span');
            summary.setAttribute('aria-live', 'off');
            const chips = el('kp-segmented kp-segmented--chips kp-claim__chips');
            chips.setAttribute('role', 'group');
            tools.append(summary, chips);
            bar.querySelector('.kp-checklist__status')?.after(tools);
        }
        const summary = /** @type {HTMLElement} */ (tools.querySelector('.kp-claim__summary'));
        summary.hidden = countMode === 'group' || countMode === 'none';
        summary.toggleAttribute('data-kp-claim-gap', gaps > 0 && items.length > 0);
        summary.textContent = items.length === 0 ? '' : gaps === 0 ? s.claimAllTaken : s.claimGapsCount(gaps);
        const chips = /** @type {HTMLElement} */ (tools.querySelector('.kp-claim__chips'));
        chips.hidden = attr(list, 'filter-chips', 'true') === 'false' || list.getAttribute('data-kp-claim-filter') === 'false';
        chips.setAttribute('aria-label', s.claimFilterLabel);
        const mineCount = items.filter((i) => among(st.viewer, byOf(i))).length;
        const numbers = { all: items.length, gaps, mine: mineCount };
        const names = { all: s.claimFilterAll, gaps: s.claimFilterGaps, mine: s.claimFilterMine };
        for (const key of CLAIM_FILTERS) {
            let chip = /** @type {HTMLButtonElement | null} */ (chips.querySelector(`[data-value="${key}"]`));
            if (!chip) {
                chip = /** @type {HTMLButtonElement} */ (el('kp-segmented__item', 'button'));
                chip.type = 'button';
                chip.setAttribute('data-value', key);
                chip.append(el('kp-segmented__label', 'span'), el('kp-segmented__count', 'span'));
                chips.append(chip);
            }
            /** @type {HTMLElement} */ (chip.querySelector('.kp-segmented__label')).textContent = names[/** @type {'all'} */ (key)];
            /** @type {HTMLElement} */ (chip.querySelector('.kp-segmented__count')).textContent = String(numbers[/** @type {'all'} */ (key)]);
            chip.setAttribute('aria-pressed', String(st.filter === key));
        }
        // The optional actions live in the checklist's own action cluster.
        const actions = /** @type {HTMLElement | null} */ (bar.querySelector('.kp-checklist__actions'));
        if (actions) {
            for (const [flag, cls, text] of /** @type {const} */ ([
                ['take-all', 'kp-claim__take-all', s.claimTakeAll],
                ['copy', 'kp-claim__copy', s.claimCopyGaps],
            ])) {
                let b = /** @type {HTMLButtonElement | null} */ (actions.querySelector(`.${cls}`));
                const wanted = list.hasAttribute(`data-kp-claim-${flag}`);
                if (wanted && !b) {
                    b = /** @type {HTMLButtonElement} */ (el(`kp-button kp-button--ghost kp-button--sm ${cls}`, 'button'));
                    b.type = 'button';
                    actions.prepend(b);
                } else if (!wanted && b) {
                    b.remove();
                    continue;
                }
                if (b) {
                    b.textContent = text;
                    b.disabled = gaps === 0 || loading || (flag === 'take-all' && (!st.viewer || list.hasAttribute('data-kp-claim-disabled')));
                    if (b.disabled && gaps === 0) b.setAttribute('data-kp-disabled-reason', s.claimNothingOpen);
                    else if (b.disabled && flag === 'take-all') b.setAttribute('data-kp-disabled-reason', s.claimNoViewer);
                    else b.removeAttribute('data-kp-disabled-reason');
                }
            }
        }
    }

    // A filter that leaves no row says so in the body, at the body's height.
    let note = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-claim__none'));
    const emptyList = items.length === 0;
    const wantNote = !loading && !emptyList && shown === 0 && !list.hasAttribute('data-kp-checklist-error');
    if (wantNote) {
        const gapsFilter = st.filter === 'gaps';
        const key = `${st.filter}`;
        if (!note || note.getAttribute('data-for') !== key) {
            note?.remove();
            note = statePlate(document, {
                kind: 'empty',
                title: gapsFilter ? s.claimNoneOpenTitle : s.claimNoneMineTitle,
                text: gapsFilter ? s.claimNoneOpenText : s.claimNoneMineText,
                actionLabel: s.claimShowAll,
                onAction: () => setClaimFilter(list, 'all'),
            });
            note.classList.add('kp-claim__none');
            note.setAttribute('data-for', key);
            body.append(note);
        }
    } else note?.remove();

    // A failed list gets its Retry.
    const empty = /** @type {HTMLElement | null} */ (body.querySelector(':scope > .kp-checklist__empty'));
    if (empty) {
        const retry = empty.querySelector('.kp-claim__retry');
        if (list.hasAttribute('data-kp-checklist-error') && !retry) {
            const b = /** @type {HTMLButtonElement} */ (el('kp-button kp-stateplate__action kp-claim__retry', 'button'));
            b.type = 'button';
            b.textContent = s.claimRetry;
            empty.append(b);
        } else if (!list.hasAttribute('data-kp-checklist-error') && retry) retry.remove();
    }
    if (loading) list.setAttribute('data-kp-claim-loading', '');
    else list.removeAttribute('data-kp-claim-loading');
}

/** Show a row's refusal for a while. @param {HTMLElement} list @param {string} id */
function flashRefused(list, id) {
    const st = stateOf(list);
    clearTimeout(st.refused.get(id));
    st.refused.set(
        id,
        window.setTimeout(() => {
            st.refused.delete(id);
            decorate(list);
        }, CLAIM_REFUSED_MS),
    );
}

/**
 * Ask for a change: the page hears it, may settle it with a promise, and the row ends up as the answer says.
 * @param {HTMLElement} list @param {string} id @param {ClaimDetail['action']} action @param {ClaimPerson | null} person
 * @param {{ undo?: boolean }} [options]
 */
async function request(list, id, action, person, { undo = true } = {}) {
    const s = getStrings();
    const st = stateOf(list);
    const item = itemOf(list, id);
    if (!item || st.busy.has(id)) return;
    const previousBy = byOf(item);
    const joining = action === 'join' || action === 'assign';
    const by = joining
        ? person && !among(person, previousBy)
            ? [...previousBy, person]
            : previousBy
        : previousBy.filter((p) => p.id !== person?.id);
    if (by.length === previousBy.length && by.every((p, i) => p.id === previousBy[i]?.id)) return;
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const detail = { id, action, person, by, previousBy, items: getChecklistItems(list), settle: (/** @type {Promise<unknown>} */ answer) => void (waiting = answer) };
    const go = list.dispatchEvent(new CustomEvent(CLAIM_EVENT, { bubbles: true, cancelable: true, detail }));
    if (!go) {
        refuse(list, item, previousBy, s.claimNotSaved);
        return;
    }
    if (waiting) {
        st.busy.add(id);
        decorate(list);
        /** @type {unknown} */
        let answer;
        try {
            answer = await waiting;
        } catch {
            answer = false;
        }
        st.busy.delete(id);
        const refused = answer === false || (typeof answer === 'object' && answer !== null && /** @type {any} */ (answer).refused === true);
        if (refused) {
            const winners = typeof answer === 'object' && answer !== null && /** @type {any} */ (answer).by ? claimPeople(/** @type {any} */ (answer).by) : previousBy;
            const error = typeof answer === 'object' && answer !== null ? /** @type {any} */ (answer).error : undefined;
            const other = winners.find((p) => !among(person, [p]));
            refuse(list, item, winners, error ?? (joining && other ? s.claimLost(other.name, item.label) : s.claimNotSaved));
            return;
        }
    }
    write(list, id, by);
    announce(list, item.label, by, joining, person);
    if (!joining && undo) offerUndo(list, item, previousBy, person);
}

/** @param {HTMLElement} list @param {{ id: string, label: string }} item @param {ClaimPerson[]} by @param {string} why */
function refuse(list, item, by, why) {
    write(list, item.id, by);
    flashRefused(list, item.id);
    decorate(list);
    say(list, why);
    const line = /** @type {HTMLElement | null} */ (list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(item.id)}"] .kp-claim__why`));
    line?.remove();
    const row = list.querySelector(`.kp-checklist__item[data-id="${CSS.escape(item.id)}"]`);
    const cell = row?.querySelector('.kp-claim');
    if (cell) {
        const note = el('kp-claim__why', 'span');
        note.textContent = why;
        cell.append(note);
        setTimeout(() => note.remove(), CLAIM_REFUSED_MS);
    }
}

/** @param {HTMLElement} list @param {string} label @param {ClaimPerson[]} by @param {boolean} joining @param {ClaimPerson | null} person */
function announce(list, label, by, joining, person) {
    const s = getStrings();
    if (list.getAttribute('data-kp-announce') === 'off') return;
    say(list, by.length ? s.claimAnnounce(label, joinNames(by.map((p) => p.name))) : s.claimAnnounceNobody(label));
    void joining;
    void person;
}

/** @param {HTMLElement} list @param {{ id: string, label: string }} item @param {ClaimPerson[]} previousBy @param {ClaimPerson | null} person */
function offerUndo(list, item, previousBy, person) {
    const s = getStrings();
    const ms = Number(attr(list, 'undo-ms', String(CLAIM_UNDO_MS)));
    if (!(ms > 0)) return;
    const mine = among(stateOf(list).viewer, [person ?? { id: '', name: '' }]);
    undoToast(mine ? s.claimReleased(item.label) : s.claimUnassigned(person?.name ?? '', item.label), {
        mode: 'revert',
        ms,
        undo: () => {
            if (person) void request(list, item.id, 'assign', person, { undo: false });
            else write(list, item.id, previousBy);
        },
    });
}

/** @param {HTMLElement} list @param {HTMLElement} row */
function press(list, row) {
    const st = stateOf(list);
    const id = row.getAttribute('data-id') ?? '';
    const item = itemOf(list, id);
    if (!item || !st.viewer || whyOff(list, item, byOf(item)) !== null) return;
    const mine = among(st.viewer, byOf(item));
    void request(list, id, mine ? 'leave' : 'join', st.viewer);
}

/** Take every open item for the viewer, behind one Undo. @param {HTMLElement} list */
async function takeAll(list) {
    const s = getStrings();
    const st = stateOf(list);
    const viewer = st.viewer;
    if (!viewer) return;
    const before = getChecklistItems(list);
    const open = before.filter((i) => byOf(i).length === 0 && !i.claim?.locked);
    if (open.length === 0) return;
    const by = (/** @type {typeof before[number]} */ i) => (open.includes(i) ? [viewer] : byOf(i));
    /** @type {Promise<unknown> | null} */
    let waiting = null;
    const detail = {
        id: '',
        action: 'take-all',
        person: viewer,
        by: [viewer],
        previousBy: [],
        items: before,
        ids: open.map((i) => i.id),
        settle: (/** @type {Promise<unknown>} */ a) => void (waiting = a),
    };
    if (!list.dispatchEvent(new CustomEvent(CLAIM_EVENT, { bubbles: true, cancelable: true, detail }))) return;
    if (waiting) {
        try {
            if ((await waiting) === false) return;
        } catch {
            say(list, s.claimNotSaved);
            return;
        }
    }
    setChecklistItems(
        list,
        before.map((i) => ({ ...i, claim: { ...i.claim, by: by(i) } })),
    );
    say(list, s.claimTookAll(open.length));
    const ms = Number(attr(list, 'undo-ms', String(CLAIM_UNDO_MS)));
    if (ms > 0)
        undoToast(s.claimTookAll(open.length), {
            mode: 'revert',
            ms,
            undo: () => setChecklistItems(list, before),
        });
}

/** @param {HTMLElement} list */
async function copyGaps(list) {
    const s = getStrings();
    const names = getChecklistItems(list)
        .filter((i) => byOf(i).length === 0)
        .map((i) => i.label);
    if (names.length === 0) return;
    try {
        await navigator.clipboard.writeText(s.claimCopyLine(names.join(', ')));
        say(list, s.claimCopied(names.length));
    } catch {
        say(list, s.claimCopyFailed);
    }
}

/**
 * Wire every claim checklist under `root`: the buttons, the menu, the chips, the keys. Items come from the checklist's
 * setChecklistItems() with a `claim` on each; the viewer from setClaimViewer().
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachClaims(root = document) {
    const lists = /** @type {HTMLElement[]} */ ([...(root instanceof HTMLElement && root.matches(CLAIM) ? [root] : []), ...root.querySelectorAll(CLAIM)]);
    /** @type {(() => void)[]} */
    const undo = [];
    for (const list of lists) {
        const st = stateOf(list);
        if (st.off.length) continue;
        const viewerId = list.getAttribute('data-kp-claim-viewer');
        if (viewerId && !st.viewer) st.viewer = { id: viewerId, name: list.getAttribute('data-kp-claim-viewer-name') ?? viewerId };
        const remembered = memoryFor(list, 'claim')?.read('filter', null);
        const asked = list.getAttribute('data-kp-claim-filter');
        st.filter = typeof remembered === 'string' && CLAIM_FILTERS.includes(remembered) ? remembered : CLAIM_FILTERS.includes(asked ?? '') ? /** @type {string} */ (asked) : 'all';
        const stopReasons = attachDisabledReasons(list);
        const onRender = () => decorate(list);
        /** @param {MouseEvent} event */
        const onClick = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const button = target.closest('.kp-claim__button');
            if (button instanceof HTMLButtonElement) {
                event.preventDefault();
                const row = button.closest('.kp-checklist__item');
                if (row instanceof HTMLElement && button.getAttribute('aria-disabled') !== 'true') press(list, row);
                return;
            }
            const chip = target.closest('.kp-claim__chips [data-value]');
            if (chip) return setClaimFilter(list, chip.getAttribute('data-value') ?? 'all');
            if (target.closest('.kp-claim__take-all')) return void takeAll(list);
            if (target.closest('.kp-claim__copy')) return void copyGaps(list);
            if (target.closest('.kp-claim__retry')) list.dispatchEvent(new CustomEvent(CLAIM_RETRY_EVENT, { bubbles: true }));
        };
        /** @param {Event} event */
        const onMenu = (event) => {
            const detail = /** @type {CustomEvent} */ (event).detail;
            const wrapper = event.target instanceof Element ? event.target.closest('.kp-claim__assign') : null;
            const id = wrapper?.getAttribute('data-kp-key');
            if (!id || !detail?.value) return;
            const person = [...st.people, ...byOf(itemOf(list, id) ?? {})].find((p) => p.id === detail.value) ?? null;
            if (!person) return;
            const item = itemOf(list, id);
            void request(list, id, among(person, byOf(item ?? {})) ? 'unassign' : 'assign', person);
        };
        // The shortcut engine never fires a letter while an input has the focus, and a row's tick box is one: c works there too.
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            const target = event.target;
            if (event.key !== 'c' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || mode(list) !== 'claim') return;
            const row = target.closest('.kp-checklist__item');
            if (!(row instanceof HTMLElement) || list.getAttribute('data-kp-claim-keys') === 'false') return;
            event.preventDefault();
            press(list, row);
        };
        list.addEventListener('keydown', onKey);
        list.addEventListener(CHECKLIST_RENDER_EVENT, onRender);
        // Every option is live: change the attribute and the rows are drawn again (a page that switches a look at run time).
        let lastSort = attr(list, 'gap-sort', 'keep');
        const watcher = new MutationObserver(() => {
            const sort = attr(list, 'gap-sort', 'keep');
            if (sort !== lastSort) {
                lastSort = sort;
                // Back to the list's own order: the checklist draws it again, the claim part follows.
                setChecklistItems(list, getChecklistItems(list));
            } else decorate(list);
        });
        watcher.observe(list, {
            attributes: true,
            attributeFilter: ['mode', 'gap', 'gap-sort', 'person', 'count', 'self-label', 'max', 'disabled', 'disabled-reason', 'take-all', 'copy', 'filter-chips'].map((n) => `data-kp-claim-${n}`),
        });
        list.addEventListener('click', onClick);
        list.addEventListener(MENU_SELECT_EVENT, onMenu);
        /** @type {(() => void) | undefined} */
        let stopKeys;
        if (list.getAttribute('data-kp-claim-keys') !== 'false') {
            const here = () => list.contains(document.activeElement) && document.activeElement?.closest('.kp-checklist__item') !== null;
            stopKeys = registerShortcuts(
                list,
                [
                    {
                        keys: 'c',
                        what: getStrings().claimKeyTake,
                        group: getStrings().claimKeyGroup,
                        when: () => here() && mode(list) === 'claim' && stateOf(list).viewer !== null,
                        reason: getStrings().claimKeyReason,
                        run: () => {
                            const row = document.activeElement?.closest('.kp-checklist__item');
                            if (row instanceof HTMLElement) press(list, row);
                        },
                    },
                    {
                        keys: 'Shift C',
                        what: getStrings().claimKeyGaps,
                        group: getStrings().claimKeyGroup,
                        run: () => setClaimFilter(list, stateOf(list).filter === 'gaps' ? 'all' : 'gaps'),
                    },
                ],
                { layoutGuard: 'off' },
            );
        }
        st.off = [
            () => list.removeEventListener(CHECKLIST_RENDER_EVENT, onRender),
            () => watcher.disconnect(),
            () => list.removeEventListener('keydown', onKey),
            () => list.removeEventListener('click', onClick),
            () => list.removeEventListener(MENU_SELECT_EVENT, onMenu),
            () => stopKeys?.(),
            stopReasons,
        ];
        decorate(list);
        undo.push(() => {
            for (const stop of st.off) stop();
            st.off = [];
            serial += 1;
        });
    }
    return () => undo.forEach((u) => u());
}
