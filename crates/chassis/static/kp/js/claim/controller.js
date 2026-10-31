// One claim list: its buttons, menu, chips and keys on top of a checklist.
import { Controller } from '../controller.js';
import { CHECKLIST_RENDER_EVENT, CHECKLIST_RETRY_EVENT, getChecklistItems, setChecklistItems } from '../checklist.js';
import { MENU_SELECT_EVENT } from '../menu-button.js';
import { attachDisabledReasons } from '../reason.js';
import { memoryFor } from '../remember.js';
import { registerShortcuts } from '../shortcuts.js';
import { getStrings } from '../strings.js';
import { copyGaps, takeAll } from './bulk.js';
import { CLAIM_FILTERS, CLAIM_RETRY_EVENT } from './constants.js';
import { decorate, setClaimFilter } from './decorate.js';
import { attr, byOf, itemOf, stateOf } from './model.js';
import { press, request } from './request.js';
import { among, mode } from './rows.js';
import { claimState } from './state.js';

/** The options of a claim list that are live: change the attribute and the rows are drawn again. */
const LIVE_OPTIONS = ['mode', 'gap', 'gap-sort', 'person', 'count', 'self-label', 'max', 'disabled', 'disabled-reason', 'take-all', 'copy', 'filter-chips'].map(
    (n) => `data-kp-claim-${n}`,
);

export class ClaimList extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** The gap sort the rows were last drawn with. */
        this.lastSort = attr(host, 'gap-sort', 'keep');
    }

    connect() {
        const list = this.host;
        this.own(() => {
            claimState.serial += 1;
        });
        this.readStart();
        this.own(attachDisabledReasons(list));
        this.listen(list, 'keydown', (event) => this.onKey(/** @type {KeyboardEvent} */ (event)));
        this.listen(list, CHECKLIST_RENDER_EVENT, () => decorate(list));
        this.observe(new MutationObserver(() => this.onAttributes())).observe(list, { attributes: true, attributeFilter: LIVE_OPTIONS });
        this.listen(list, 'click', (event) => this.onClick(/** @type {MouseEvent} */ (event)));
        // The checklist's Retry is the claim list's Retry too [r6r8-1019].
        this.listen(list, CHECKLIST_RETRY_EVENT, () => list.dispatchEvent(new CustomEvent(CLAIM_RETRY_EVENT, { bubbles: true })));
        this.listen(list, MENU_SELECT_EVENT, (event) => this.onMenu(event));
        if (list.getAttribute('data-kp-claim-keys') !== 'false') this.registerKeys();
        decorate(list);
    }

    /** The viewer the markup names and the filter: the remembered one, else the asked one, else all. */
    readStart() {
        const list = this.host;
        const st = stateOf(list);
        const viewerId = list.getAttribute('data-kp-claim-viewer');
        if (viewerId && !st.viewer) st.viewer = { id: viewerId, name: list.getAttribute('data-kp-claim-viewer-name') ?? viewerId };
        const remembered = memoryFor(list, 'claim')?.read('filter', null);
        const asked = list.getAttribute('data-kp-claim-filter');
        st.filter =
            typeof remembered === 'string' && CLAIM_FILTERS.includes(remembered)
                ? remembered
                : CLAIM_FILTERS.includes(asked ?? '')
                  ? /** @type {string} */ (asked)
                  : 'all';
    }

    /** The keys of the list in the shortcut sheet: take or let go of the focused row, and the gaps filter. */
    registerKeys() {
        const list = this.host;
        const s = getStrings();
        const here = () => list.contains(document.activeElement) && document.activeElement?.closest('.kp-checklist__item') !== null;
        this.own(
            registerShortcuts(
                list,
                [
                    {
                        keys: 'c',
                        what: s.claimKeyTake,
                        group: s.claimKeyGroup,
                        when: () => here() && mode(list) === 'claim' && stateOf(list).viewer !== null,
                        reason: s.claimKeyReason,
                        run: () => {
                            const row = document.activeElement?.closest('.kp-checklist__item');
                            if (row instanceof HTMLElement) press(list, row);
                        },
                    },
                    {
                        keys: 'Shift C',
                        what: s.claimKeyGaps,
                        group: s.claimKeyGroup,
                        run: () => setClaimFilter(list, stateOf(list).filter === 'gaps' ? 'all' : 'gaps'),
                    },
                ],
                { layoutGuard: 'off' },
            ),
        );
    }

    /** Every option is live: change the attribute and the rows are drawn again (a page that switches a look at run time). */
    onAttributes() {
        const list = this.host;
        const sort = attr(list, 'gap-sort', 'keep');
        if (sort !== this.lastSort) {
            this.lastSort = sort;
            // Back to the list's own order: the checklist draws it again, the claim part follows.
            setChecklistItems(list, getChecklistItems(list));
        } else decorate(list);
    }

    /** @param {MouseEvent} event */
    onClick(event) {
        const list = this.host;
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
    }

    /** A person picked in a row's assign menu: assign them, or take them off. @param {Event} event */
    onMenu(event) {
        const list = this.host;
        const detail = /** @type {CustomEvent} */ (event).detail;
        const wrapper = event.target instanceof Element ? event.target.closest('.kp-claim__assign') : null;
        const id = wrapper?.getAttribute('data-kp-key');
        if (!id || !detail?.value) return;
        const person = [...stateOf(list).people, ...byOf(itemOf(list, id) ?? {})].find((p) => p.id === detail.value) ?? null;
        if (!person) return;
        const item = itemOf(list, id);
        void request(list, id, among(person, byOf(item ?? {})) ? 'unassign' : 'assign', person);
    }

    /**
     * The shortcut engine never fires a letter while an input has the focus, and a row's tick box is one: c works there too.
     * @param {KeyboardEvent} event
     */
    onKey(event) {
        const list = this.host;
        const target = event.target;
        if (event.key !== 'c' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || mode(list) !== 'claim') return;
        const row = target.closest('.kp-checklist__item');
        if (!(row instanceof HTMLElement) || list.getAttribute('data-kp-claim-keys') === 'false') return;
        event.preventDefault();
        press(list, row);
    }
}
