// The last two slots of a stack card: the meters (with the trend row) and the actions (with the "More" menu and Retry).
import { setMeter } from '../kpi.js';
import { setMenu, attachMenuButtons } from '../menu-button.js';
import { ENTITY_ACTION_EVENT, ENTITY_GRID, ENTITY_RETRY_EVENT } from './constants.js';
import { IdentityDrawing } from './identity.js';
import { columnsFor, made, opt, slotOf } from './helpers.js';
import { trendRow } from './tile.js';
/** @typedef {import('./types.js').EntityData} EntityData */

/** How many actions stand as buttons when the card does not say. */
const DEFAULT_INLINE = 3;
/** The share of a meter at which it turns to a warning. */
const METER_WARN = 0.75;
/** The share of a meter at which it turns destructive. */
const METER_CRITICAL = 0.9;

export class RowsDrawing extends IdentityDrawing {
    /** @param {HTMLElement} card @param {EntityData} data */
    constructor(card, data) {
        super(card, data);
        /** Whether the meters block carries the trend row. */
        this.trendOn = false;
        /** How many actions stand as buttons; the rest go in "More". */
        this.inline = 0;
        /** The grid, or the card when it stands alone: the one place the columns and the fit are kept. */
        this.fitHost = card;
    }

    /**
     * Whether the meters block carries the trend row: a lone refill that brings the first trend into a grid gives the cards already
     * there their row too (`auto`), and `auto` gives every card of the grid the row once one card has a trend.
     * @param {(cards: readonly HTMLElement[], slots?: string[]) => void} redraw draws other cards again
     */
    trend(redraw) {
        const { card, data, kind, meterRows } = this;
        const around = card.closest(ENTITY_GRID);
        if (around && Array.isArray(data.trend) && !around.hasAttribute('data-kp-entity-trended')) {
            around.setAttribute('data-kp-entity-trended', '');
            redraw(
                /** @type {HTMLElement[]} */ ([...around.querySelectorAll(':scope > .kp-card--entity')]).filter((other) => other !== card),
                ['meters'],
            );
        }
        const trendMode = opt(card, 'data-kp-entity-trend') ?? 'auto';
        const trended = Array.isArray(data.trend) || (card.closest(ENTITY_GRID)?.hasAttribute('data-kp-entity-trended') ?? false);
        this.trendOn = kind === 'stack' && (trendMode === 'on' || (trendMode !== 'off' && trended));
        card.style.setProperty('--kp-entity-meters', String(meterRows + (this.trendOn ? 1 : 0)));
    }

    /** 4. meters: a fixed number of rows; the number is always beside the bar. */
    meters() {
        const { data, doc, s, status, meterRows, trendOn } = this;
        this.slot('meters', { m: data.meters, meterRows, status, tr: trendOn ? [data.trend ?? null, data.trendLabel, data.trendText] : null }, (el) => {
            for (let i = 0; i < meterRows; i++) el.append(this.meterRow(data.meters?.[i]));
            if (trendOn) el.append(trendRow(doc, s, data, status));
        });
    }

    /** One meter row: label, bar and number. @param {NonNullable<EntityData['meters']>[number] | undefined} m */
    meterRow(m) {
        const { doc, s, status } = this;
        const row = made(doc, 'div', 'kp-entity__meter');
        const label = made(doc, 'span', 'kp-entity__meter-label');
        label.textContent = m?.label ?? '';
        const bar = made(doc, 'div', 'kp-meter');
        const value = made(doc, 'span', 'kp-entity__meter-value');
        if (m && status !== 'empty') {
            const tone = m.tone ?? (m.value !== null && m.value >= METER_CRITICAL ? 'destructive' : m.value !== null && m.value >= METER_WARN ? 'warning' : null);
            setMeter(bar, { value: m.value, mark: m.mark ?? null, tone, label: m.label });
            value.textContent = m.text ?? (m.value === null ? '—' : `${Math.round(m.value * 100)}%`);
        } else {
            setMeter(bar, { value: null });
            value.textContent = status === 'empty' ? s.entityNotMeasured : '';
        }
        row.append(label, bar, value);
        return row;
    }

    /** 5. actions: at most a few inline, the rest in the package's menu; a failed card puts Retry here. */
    actions() {
        const { card, data, status } = this;
        const narrow = card.closest(ENTITY_GRID)?.hasAttribute('data-kp-entity-narrow') ?? false;
        const inlineAsked = narrow ? 0 : Math.max(0, Number(opt(card, 'data-kp-entity-inline') ?? DEFAULT_INLINE));
        // Fewer actions stand as buttons when they do not fit the card's width: the rest go in "More", so nothing is cut.
        const host = /** @type {HTMLElement} */ (card.closest(ENTITY_GRID) ?? card);
        const inline = Math.min(inlineAsked, Number(host.dataset.kpEntityFit ?? inlineAsked));
        this.inline = inline;
        this.fitHost = host;
        // The buttons come only from the data: a card with no action has no actions row, and no space where it would be.
        const noActions = status !== 'error' && (data.actions ?? []).length === 0;
        if (noActions) card.setAttribute('data-kp-entity-actions', 'none');
        else card.removeAttribute('data-kp-entity-actions');
        slotOf(card, 'actions').hidden = noActions;
        // One set of columns for the whole grid, so the same action stands in the same column on every card.
        host.style.setProperty('--kp-entity-cols', String(columnsFor(host, inline)));
        this.slot('actions', { a: data.actions, inline, status }, (el) => this.fillActions(el));
    }

    /** The buttons of the actions row, and the "More" menu for those that did not fit. @param {HTMLElement} el */
    fillActions(el) {
        const { card, data, doc, s, key, status, inline } = this;
        if (status === 'error') {
            const retry = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-entity__action kp-entity__retry'));
            retry.type = 'button';
            retry.textContent = s.entityRetry;
            if (data.error) retry.title = data.error;
            retry.addEventListener('click', () => card.dispatchEvent(new CustomEvent(ENTITY_RETRY_EVENT, { bubbles: true, detail: { key } })));
            el.append(retry);
            return;
        }
        const all = data.actions ?? [];
        for (const a of all.slice(0, inline)) el.append(this.actionButton(a));
        const rest = all.slice(inline);
        if (rest.length > 0) this.moreMenu(el, rest);
    }

    /** @param {NonNullable<EntityData['actions']>[number]} a */
    actionButton(a) {
        const { card, doc, key } = this;
        const button = /** @type {HTMLButtonElement} */ (
            made(doc, 'button', `kp-button kp-button--sm kp-entity__action${a.danger ? ' kp-button--destructive' : ''}`)
        );
        button.type = 'button';
        button.textContent = a.label;
        if (a.disabled) {
            button.setAttribute('aria-disabled', 'true');
            button.setAttribute('data-kp-disabled-reason', a.disabled);
        }
        button.addEventListener('click', () => {
            if (a.disabled) return;
            card.dispatchEvent(new CustomEvent(ENTITY_ACTION_EVENT, { bubbles: true, detail: { key, id: a.id } }));
        });
        return button;
    }

    /** @param {HTMLElement} el @param {NonNullable<EntityData['actions']>} rest */
    moreMenu(el, rest) {
        const { card, doc, s, key } = this;
        const wrap = made(doc, 'div', 'kp-menu-button kp-entity__more');
        wrap.setAttribute('data-kp-menu-button', '');
        wrap.setAttribute('data-kp-key', `${key}-more`);
        const button = /** @type {HTMLButtonElement} */ (made(doc, 'button', 'kp-button kp-button--sm'));
        button.type = 'button';
        button.textContent = s.entityMore;
        const menu = made(doc, 'div', 'kp-menu kp-menu--rich');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', s.entityMoreLabel);
        wrap.append(button, menu);
        el.append(wrap);
        attachMenuButtons(el);
        setMenu(wrap, [{ group: '', items: rest.map((a) => ({ label: a.label, value: a.id, danger: a.danger === true, disabled: a.disabled ?? null })) }]);
        wrap.addEventListener('kp-menu-select', (event) => {
            card.dispatchEvent(new CustomEvent(ENTITY_ACTION_EVENT, { bubbles: true, detail: { key, id: /** @type {CustomEvent} */ (event).detail.value } }));
        });
    }
}
