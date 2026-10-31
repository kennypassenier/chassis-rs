// The first three slots of a stack card: identity, figures and flags (with the "+N" menu).
import { setMenu, attachMenuButtons } from '../menu-button.js';
import { ENTITY_FLAG_EVENT } from './constants.js';
import { EntityDrawing } from './drawing.js';
import { made, opt } from './helpers.js';
import { appendStar, syncStar, tickAndMark } from './star.js';

/** How many flags a card shows when it does not say. */
const DEFAULT_FLAGS_MAX = 3;

export class IdentityDrawing extends EntityDrawing {
    constructor(/** @type {HTMLElement} */ card, /** @type {import('./types.js').EntityData} */ data) {
        super(card, data);
        /** How many flags stand in the row; the rest go behind the "+N". */
        this.flagsMax = 0;
    }

    /** 1. identity: tick, mark, name, vmid, state and star. */
    identity() {
        const { card, data, doc, s, key, status, link, selectable, markKind, starOn, starKey, star } = this;
        this.slot('id', { n: data.name, v: data.vmid, st: data.state, link, selectable, markKind, status, starOn, starKey }, (el) => {
            tickAndMark(card, el, data, selectable, markKind);
            const name = link ? made(doc, 'a', 'kp-entity__name') : made(doc, 'span', 'kp-entity__name');
            if (name instanceof HTMLAnchorElement && link) name.href = link.replace('{key}', encodeURIComponent(key));
            name.textContent = data.name;
            el.append(name);
            const vmid = made(doc, 'span', 'kp-entity__vmid');
            vmid.textContent = data.vmid ?? '';
            el.append(vmid);
            const st = made(
                doc,
                'span',
                `kp-badge kp-entity__state${data.state?.tone ? ` kp-badge--${status === 'error' ? 'destructive' : data.state.tone}` : status === 'error' ? ' kp-badge--destructive' : ''}`,
            );
            st.textContent = status === 'error' ? s.entityFailed : (data.state?.label ?? '');
            el.append(st);
            if (starOn) appendStar(card, el, data, star, starKey);
        });
        syncStar(card, star);
    }

    /** 2. figures: exact numbers, tabular, in one row. */
    figures() {
        const { data, doc, s, status } = this;
        this.slot('figures', { f: data.figures, status }, (el) => {
            if (status === 'empty') {
                const none = made(doc, 'span', 'kp-entity__none');
                none.textContent = s.entityNotMeasured;
                el.append(none);
                return;
            }
            for (const f of data.figures ?? []) {
                const one = made(doc, 'span', 'kp-entity__figure');
                const value = made(doc, 'b', 'kp-entity__value');
                value.textContent = f.value;
                one.append(value, ` ${f.label}`);
                el.append(one);
            }
        });
    }

    /** 3. flags: the first few, and an exact "+N" that opens the package's menu. */
    flags() {
        const { card, data } = this;
        const flagsAsked = Math.max(0, Number(opt(card, 'data-kp-entity-flags-max') ?? DEFAULT_FLAGS_MAX));
        // Fewer flags show when they do not fit the card's width: the rest go behind the "+N", so nothing is cut.
        const flagsMax = Math.min(flagsAsked, Number(card.dataset.kpFlagsFit ?? flagsAsked));
        this.flagsMax = flagsMax;
        this.slot('flags', { fl: data.flags, flagsMax }, (el) => {
            const all = data.flags ?? [];
            for (const flag of all.slice(0, flagsMax)) {
                const chip = made(this.doc, 'span', `kp-badge kp-entity__flag${flag.tone ? ` kp-badge--${flag.tone}` : ''}`);
                chip.textContent = flag.label;
                el.append(chip);
            }
            const rest = all.slice(flagsMax);
            if (rest.length > 0) this.flagsMenu(el, rest);
        });
    }

    /** The "+N" button and its menu of the flags that did not fit. @param {HTMLElement} el @param {{ label: string }[]} rest */
    flagsMenu(el, rest) {
        const { card, doc, s, key } = this;
        const wrap = made(doc, 'div', 'kp-menu-button kp-entity__more-flags');
        wrap.setAttribute('data-kp-menu-button', '');
        wrap.setAttribute('data-kp-key', `${key}-flags`);
        const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--ghost kp-button--sm kp-entity__plus'));
        button.type = 'button';
        button.textContent = `+${rest.length}`;
        button.setAttribute('aria-label', s.entityMoreFlags(rest.length));
        const menu = made(doc, 'div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', s.entityFlagsLabel);
        wrap.append(button, menu);
        el.append(wrap);
        attachMenuButtons(el);
        setMenu(wrap, [{ group: '', items: rest.map((f) => ({ label: f.label, value: f.label })) }]);
        wrap.addEventListener('kp-menu-select', (event) => {
            card.dispatchEvent(new CustomEvent(ENTITY_FLAG_EVENT, { bubbles: true, detail: { key, flag: /** @type {CustomEvent} */ (event).detail.value } }));
        });
    }
}
