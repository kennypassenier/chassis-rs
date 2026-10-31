// The toggles' selector, events, looks and modes, and what a group is: its members, its mode, the keys that are on, what a
// press would make of it, and the remembered value's storage.

/** @typedef {'true' | 'false' | 'mixed'} PressedState */

/** A button this module drives. */
export const TOGGLE = '[data-kp-toggle]';
/** Fired on the button before its state changes, cancelable: `{ button, pressed, previous, group, pressedKeys, wait(promise) }`. */
export const TOGGLE_EVENT = 'kp-toggle';
/** Fired on the button after its state changed, or was rolled back: `{ button, pressed, group, pressedKeys, source }`. */
export const TOGGLE_CHANGED_EVENT = 'kp-toggle-changed';
/** The looks a toggle may have. */
export const TOGGLE_LOOKS = /** @type {const} */ (['button', 'chip', 'icon']);
/** How a group lets its members be on together. */
export const TOGGLE_MODES = /** @type {const} */ (['multi', 'single', 'single-or-none']);
/** How long a refusal's word stays on the button, in ms (the flash button's value). */
export const TOGGLE_REFUSED_MS = 3000;

/** @param {Element} el @returns {PressedState} */
export const stateOf = (el) => {
    const v = el.getAttribute('aria-pressed');
    return v === 'true' || v === 'mixed' ? v : 'false';
};

/** The key a member has in `pressedKeys`. @param {HTMLElement} el */
export const toggleKey = (el) => el.dataset.kpToggleValue ?? (el.id || (el.querySelector('.kp-toggle__label') ?? el).textContent?.trim() || '');

/**
 * The group a toggle belongs to: its members, its mode and its container.
 * @param {HTMLElement} button
 * @returns {{ name: string, members: HTMLElement[], mode: 'multi' | 'single' | 'single-or-none', container: HTMLElement | null, all: HTMLElement | null } | null}
 */
export function toggleGroup(button) {
    const holder = /** @type {HTMLElement | null} */ (button.closest('[data-kp-toggle-group]'));
    if (!holder) return null;
    const name = holder.dataset.kpToggleGroup ?? '';
    const own = holder === button;
    const members = own
        ? [...button.ownerDocument.querySelectorAll(TOGGLE)].filter((m) => /** @type {HTMLElement} */ (m).dataset.kpToggleGroup === name)
        : [...holder.querySelectorAll(TOGGLE)];
    const members2 = /** @type {HTMLElement[]} */ (members);
    const said = (own ? members2.find((m) => m.dataset.kpToggleMode) : holder)?.dataset.kpToggleMode;
    const mode = TOGGLE_MODES.includes(/** @type {any} */ (said)) ? /** @type {'multi' | 'single' | 'single-or-none'} */ (said) : 'multi';
    return { name, members: members2, mode, container: own ? null : holder, all: members2.find((m) => m.hasAttribute('data-kp-toggle-all')) ?? null };
}

/**
 * The keys of every member that is on, the "All" member left out.
 * @param {HTMLElement} anyMember
 * @returns {string[]}
 */
export function togglePressedKeys(anyMember) {
    const g = toggleGroup(anyMember);
    const list = g ? g.members : [anyMember];
    return list.filter((m) => !m.hasAttribute('data-kp-toggle-all') && stateOf(m) === 'true').map(toggleKey);
}

/** @param {string} name @param {string} what */
export const storeKey = (name, what) => `kp-remember:toggle:${name}:${what}`;
/** @param {string} key */
export const readStore = (key) => {
    try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw == null ? undefined : JSON.parse(raw);
    } catch {
        return undefined;
    }
};
/** @param {string} key @param {unknown} value */
export const writeStore = (key, value) => {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
        /* no storage: no memory, the toggle still works */
    }
};

/** @param {Document} doc @param {string} className @param {string} [tag] */
export const made = (doc, className, tag = 'span') => {
    const el = doc.createElement(tag);
    el.className = className;
    return el;
};

/**
 * What a press on `member` would make of its group: one toggle flips; a single group keeps exactly one on, a single-or-none
 * group at most one; pressing All (or a Clear) turns the rest off; the All member is on exactly when nothing else is.
 * @param {HTMLElement} member @param {boolean} forceClear
 * @returns {Map<HTMLElement, PressedState>}
 */
export function planFor(member, forceClear) {
    const g = toggleGroup(member);
    /** @type {Map<HTMLElement, PressedState>} */
    const plan = new Map();
    const was = stateOf(member);
    if (!g) return plan.set(member, was === 'true' ? 'false' : 'true');
    const others = g.members.filter((m) => m !== member);
    if (member.hasAttribute('data-kp-toggle-all') || forceClear) {
        // Pressing All clears the rest; with nothing else on, there is nothing to change.
        if (g.members.every((m) => (m === (g.all ?? member) ? false : stateOf(m) !== 'true'))) return plan;
        for (const m of g.members) plan.set(m, m === (g.all ?? member) ? 'true' : 'false');
        return plan;
    }
    if (g.mode === 'single') {
        if (was === 'true') return plan;
        for (const m of others) plan.set(m, 'false');
        plan.set(member, 'true');
    } else if (g.mode === 'single-or-none') {
        if (was === 'true') plan.set(member, 'false');
        else {
            for (const m of others) plan.set(m, 'false');
            plan.set(member, 'true');
        }
    } else plan.set(member, was === 'true' ? 'false' : 'true');
    return withAll(g, plan);
}

/** The All member follows the plan: on exactly when no other member will be. @param {NonNullable<ReturnType<typeof toggleGroup>>} g @param {Map<HTMLElement, PressedState>} plan */
export function withAll(g, plan) {
    if (g.all) {
        const anyOn = g.members.some((m) => m !== g.all && (plan.get(m) ?? stateOf(m)) === 'true');
        plan.set(g.all, anyOn ? 'false' : 'true');
    }
    return plan;
}

/** Put the members to the states a plan says. @param {Map<HTMLElement, PressedState>} plan */
export function applyPlan(plan) {
    for (const [member, next] of plan) member.setAttribute('aria-pressed', next);
}
