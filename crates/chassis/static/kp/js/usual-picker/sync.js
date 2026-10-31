// The yes/no check, the panel and the hint kept in step with the model, and the render.
import { getStrings } from '../strings.js';
import { statePlate } from '../state-plate.js';
import { openBusyCard } from '../busy-card.js';
import { attachSegmented, setSegmentedTri, SEGMENTED_EVENT } from '../segmented.js';
import { USUAL_NOT_TODAY_EVENT } from './constants.js';
import { arrange } from './layout.js';
import { attr, bandValues, make } from './model.js';
import { pick, sayAfter, unpick } from './picking.js';
import { usualState } from './state.js';
/** @typedef {import('./types.js').UsualModel} UsualModel */

/**
 * The look of the usual choices' check: `rows`, `chips`, or none (`off`, or no attribute). A bare `data-kp-not-today` is rows.
 * Only a picker that holds several values has one: "Had it" is a pick.
 * @param {UsualModel} m @returns {'rows' | 'chips' | null}
 */
function checkLook(m) {
    if (!m.box.hasAttribute('data-kp-tags') || !m.box.hasAttribute('data-kp-not-today')) return null;
    const look = m.box.getAttribute('data-kp-not-today') ?? '';
    if (look === 'off' || look === 'false') return null;
    return look === 'chips' ? 'chips' : 'rows';
}

/** Where a usual choice stands: had it (picked), not today, or not answered. @param {UsualModel} m @param {string} value */
export function answerOf(m, value) {
    if (m.handle.values().includes(value)) return 'had';
    return m.notToday.has(value) ? 'not' : 'none';
}

/** Give a usual choice an answer from the check. @param {UsualModel} m @param {string} value @param {'had' | 'not' | 'none'} next */
export function answer(m, value, next) {
    const was = answerOf(m, value);
    if (was === next) return;
    const s = getStrings();
    const label = m.items.find((i) => i.value === value)?.label ?? value;
    const wasNot = m.notToday.has(value);
    if (next === 'not') m.notToday.add(value);
    else m.notToday.delete(value);
    if (next === 'had') pick(m, value, 'usual');
    else if (was === 'had') unpick(m, value);
    if (wasNot !== (next === 'not'))
        m.box.dispatchEvent(new CustomEvent(USUAL_NOT_TODAY_EVENT, { bubbles: true, detail: { value, on: next === 'not' } }));
    syncCheck(m);
    syncHint(m);
    sayAfter(m, next === 'had' ? s.usualPicked(label) : next === 'not' ? s.usualNotTodayAnnounce(label) : s.usualUnanswered(label));
}

/**
 * Draw the check of the usual choices under the field, or take it away: a heading, one line saying what Not today is, and
 * the choices in the picker's look. Drawn again only when the look or the band changed; otherwise only the states move, so
 * the focus stays on the button pressed.
 * @param {UsualModel} m
 */
export function syncCheck(m) {
    const look = checkLook(m);
    const band = look ? bandValues(m) : [];
    // A value picked or answered stays known; a value that left the band forgets its Not today.
    for (const v of [...m.notToday]) if (!band.includes(v)) m.notToday.delete(v);
    if (!look || band.length === 0) {
        m.checkOff();
        m.check?.remove();
        m.check = null;
        m.checkKey = '';
        return;
    }
    const s = getStrings();
    const key = `${look}|${band.join('\u0001')}`;
    if (!m.check || m.checkKey !== key) {
        m.check?.remove();
        usualState.serial += 1;
        const id = `kp-usual-${usualState.serial}-check`;
        const check = make('div', `kp-usual__check kp-usual__check--${look}`);
        check.setAttribute('role', 'group');
        check.setAttribute('aria-labelledby', `${id}-title`);
        check.setAttribute('aria-describedby', `${id}-what`);
        const title = make('p', 'kp-usual__check-title', attr(m, 'not-today-label') ?? s.usualCheckTitle);
        title.id = `${id}-title`;
        const what = make('p', 'kp-usual__check-what', look === 'rows' ? s.usualCheckWhat : s.usualCheckWhatChips);
        what.id = `${id}-what`;
        check.append(title, what);
        if (look === 'rows') {
            const grid = make('div', 'kp-usual__check-rows');
            for (const [n, value] of band.entries()) {
                const label = m.items.find((i) => i.value === value)?.label ?? value;
                const name = make('span', 'kp-usual__check-name', label);
                name.id = `${id}-${n}`;
                const pair = make('div', 'kp-segmented kp-usual__check-pair');
                pair.setAttribute('role', 'group');
                pair.setAttribute('aria-labelledby', name.id);
                pair.dataset.value = value;
                for (const [kind, words] of /** @type {const} */ ([
                    ['had', s.usualHadIt],
                    ['not', s.usualNotToday],
                ])) {
                    const button = make('button', 'kp-segmented__item', words);
                    button.type = 'button';
                    button.dataset.value = kind;
                    button.setAttribute('aria-pressed', 'false');
                    pair.append(button);
                }
                grid.append(name, pair);
            }
            check.append(grid);
        } else {
            // The package's three-way chips, with their words: had it (✓), not today (✕, struck through), not answered.
            const chips = make('div', 'kp-segmented kp-segmented--chips kp-usual__check-chips');
            chips.setAttribute('data-kp-segmented', 'tri');
            chips.setAttribute('role', 'group');
            chips.setAttribute('aria-labelledby', `${id}-title`);
            chips.setAttribute(
                'data-kp-segmented-words',
                JSON.stringify({ include: s.usualHadItWord, exclude: s.usualNotTodayMark, any: s.usualUnansweredWord }),
            );
            for (const value of band) {
                const label = m.items.find((i) => i.value === value)?.label ?? value;
                const chip = make('button', 'kp-segmented__item');
                chip.type = 'button';
                chip.dataset.value = value;
                chip.append(make('span', 'kp-segmented__label', label));
                chips.append(chip);
            }
            check.append(chips);
        }
        // After the status line, under the field: the open list lies over it while it is open, as over anything below.
        m.checkOff();
        (m.status ?? m.noteEl).after(check);
        m.check = check;
        m.checkKey = key;
        if (look === 'chips') {
            const group = /** @type {HTMLElement} */ (check.querySelector('.kp-usual__check-chips'));
            const off = attachSegmented(group);
            /** @param {Event} event */
            const onTri = (event) => {
                const { value, state } = /** @type {CustomEvent} */ (event).detail ?? {};
                if (typeof value !== 'string') return;
                answer(m, value, state === 'include' ? 'had' : state === 'exclude' ? 'not' : 'none');
            };
            group.addEventListener(SEGMENTED_EVENT, onTri);
            m.checkOff = () => {
                group.removeEventListener(SEGMENTED_EVENT, onTri);
                off();
                m.checkOff = () => {};
            };
        } else m.checkOff = () => {};
    }
    const off = m.input.disabled;
    if (look === 'rows') {
        for (const pair of m.check.querySelectorAll('.kp-usual__check-pair')) {
            const value = /** @type {HTMLElement} */ (pair).dataset.value ?? '';
            const state = answerOf(m, value);
            for (const button of pair.querySelectorAll('button')) {
                button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.value === state));
                /** @type {HTMLButtonElement} */ (button).disabled = off;
            }
        }
    } else {
        const group = /** @type {HTMLElement} */ (m.check.querySelector('.kp-usual__check-chips'));
        setSegmentedTri(group, {
            include: band.filter((v) => answerOf(m, v) === 'had'),
            exclude: band.filter((v) => answerOf(m, v) === 'not'),
        });
        if (off) group.setAttribute('aria-disabled', 'true');
        else group.removeAttribute('aria-disabled');
    }
}

/** The state panel: loading, empty, or failed, in the place and size of the open list. @param {UsualModel} m */
export function syncPanel(m) {
    const s = getStrings();
    const given = attr(m, 'state');
    const state = given === 'loading' || given === 'error' || given === 'empty' ? given : m.items.length === 0 ? 'empty' : 'ready';
    const was = m.panel.getAttribute('data-kp-panel');
    if (was === state) return;
    m.busy?.remove();
    m.busy = null;
    m.panel.replaceChildren();
    m.panel.setAttribute('data-kp-panel', state);
    m.panel.hidden = state === 'ready';
    // The input waits while the list is read; a page that switched it off itself keeps it off.
    if (state === 'loading') {
        if (m.input.dataset.kpWasDisabled === undefined) m.input.dataset.kpWasDisabled = String(m.input.disabled);
        m.input.disabled = true;
    } else if (m.input.dataset.kpWasDisabled !== undefined) {
        m.input.disabled = m.input.dataset.kpWasDisabled === 'true';
        delete m.input.dataset.kpWasDisabled;
    }
    m.box.toggleAttribute('aria-busy', state === 'loading');
    if (state === 'loading') {
        m.handle.close();
        m.busy = openBusyCard(m.panel, { words: s.usualLoading, area: () => [m.panel], className: 'kp-usual__busy' });
    } else if (state === 'empty') {
        const addOn = attr(m, 'add', 'off') === 'inline';
        m.panel.append(
            statePlate(document, {
                kind: 'empty',
                title: s.usualEmptyTitle,
                text: addOn ? s.usualEmptyText : s.usualEmptyTextFixed,
                ...(addOn ? { actionLabel: s.usualAddButton, actionAttribute: 'data-kp-usual-add-button' } : {}),
            }),
        );
    } else if (state === 'error') {
        m.panel.append(
            statePlate(document, {
                kind: 'error',
                title: s.usualFailedTitle,
                text: s.usualFailedText,
                actionLabel: s.usualRetry,
                actionAttribute: 'data-kp-usual-retry',
            }),
        );
    }
}

/** The line the app gives under the input once something is chosen. @param {UsualModel} m */
export function syncHint(m) {
    const text = attr(m, 'hint', '') ?? '';
    const has = m.box.hasAttribute('data-kp-tags') ? m.handle.values().length > 0 : m.input.value.trim() !== '';
    m.hintEl.textContent = text;
    m.hintEl.hidden = !(text !== '' && has);
}

/** Draw the picker from its attributes: the order, the rows, the state, the hint. @param {UsualModel} m */
export function render(m) {
    arrange(m);
    m.handle.refresh();
    syncPanel(m);
    syncHint(m);
    syncCheck(m);
}
