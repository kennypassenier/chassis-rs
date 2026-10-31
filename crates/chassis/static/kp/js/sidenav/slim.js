// The slim and rail modes: the slim togglers, collapsing the rail and changing the mode.
import { getStrings } from '../strings.js';
import { wantsName } from './helpers.js';
import { OPTIONS } from './options.js';
import { SIDENAV_SLIM_EVENT } from './constants.js';
import { SidenavOpen } from './open.js';

export class SidenavSlim extends SidenavOpen {
    /**
     * The buttons that collapse and expand this rail without a line of script [gap-12]: `data-kp-sidenav-slim-toggle`, pointed at
     * the panel by `aria-controls` — or at every rail, when it names none, the way `data-kp-sidenav-toggle` does.
     * @returns {Element[]}
     */
    slimTogglers() {
        return [...this.doc.querySelectorAll(`[${OPTIONS.slimToggle}]`)].filter(
            (t) => (t.getAttribute('aria-controls') ?? '') === this.panel.id || t.getAttribute('aria-controls') === null,
        );
    }

    /** @param {boolean} collapsed */
    saySlim(collapsed) {
        if (this.read(OPTIONS.slim) === null) return;
        const s = { ...getStrings(), ...this.strings };
        for (const toggler of this.slimTogglers()) {
            if (this.ownedBy !== '' && toggler.matches(this.ownedBy)) continue;
            // Expanded is the state a button reports: pressed, a collapsed rail widens [ARIA disclosure].
            toggler.setAttribute('aria-expanded', String(!collapsed));
            toggler.setAttribute('aria-controls', this.panel.id);
            if (wantsName(toggler)) {
                toggler.setAttribute('aria-label', collapsed ? s.expandRail : s.collapseRail);
            }
        }
    }

    /** @param {boolean} [collapsed] @param {boolean} [save] @param {string} [reason] see `set` */
    setSlim(collapsed, save = true, reason = 'api') {
        const { panel } = this;
        if (this.read(OPTIONS.slim) === null) return;
        const next = collapsed ?? panel.getAttribute(OPTIONS.slimCollapsed) === null;
        const asked = this.ask(SIDENAV_SLIM_EVENT, { collapsed: next }, reason);
        if (asked === 'prevented') return;
        this.turnEase();
        panel.toggleAttribute(OPTIONS.slimCollapsed, next);
        this.saySlim(next);
        if (save) this.memory?.write('rail', next);
        // A gutter or a push keeps pace with the rail's new width.
        this.offsetContent(this.isOpen());
        this.syncRail();
        if (asked === 'told') panel.dispatchEvent(new CustomEvent(SIDENAV_SLIM_EVENT, { bubbles: true, detail: { collapsed: next, reason } }));
    }

    /** Float the groups out in the collapsed rail and fold them back outside it: SidenavFlyout does it; the slim part has none. */
    syncRail() {}

    /** @param {'over' | 'side' | 'push'} next */
    setMode(next) {
        this.panel.setAttribute(OPTIONS.mode, next);
        this.set(this.isOpen(), false, false, 'mode');
    }

    /** Whether the rail stands collapsed to its icons, not expanded by the pointer or the focus. */
    isRail() {
        return this.panel.hasAttribute(OPTIONS.slimCollapsed) && !this.panel.hasAttribute(OPTIONS.peek);
    }

    /** Whether the rail's groups float out beside it. */
    flying() {
        return this.isRail() && this.on(OPTIONS.flyout, true);
    }
}
