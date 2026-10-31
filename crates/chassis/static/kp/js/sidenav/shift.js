// Shifting the content and the edge tab aside, the opener the page chose, the launchers' light and the togglers' names.
import { getStrings } from '../strings.js';
import { slideTiming, wantsName } from './helpers.js';
import { OPTIONS } from './options.js';
import { INSET_KNOBS, SIDENAV_LAUNCHER } from './constants.js';
import { SidenavBase } from './base.js';

/** The style properties a shift clears before it writes its own. */
const MOVED = /** @type {const} */ (['marginInlineStart', 'marginInlineEnd', 'paddingInlineStart', 'paddingInlineEnd']);
/** The timing of a move that does not travel with the panel. */
const INSTANT = { duration: '0s', ease: 'linear', delay: '0s' };

export class SidenavShift extends SidenavBase {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        /** Counts the light changes, so a closing's late "put out" does not undo a later opening. */
        this.lightTurn = 0;
    }

    /**
     * Move one element clear of the panel (the content) or along with it (an edge tab), on the panel's own timing.
     *
     * @param {HTMLElement} target
     * @param {(typeof MOVED)[number]} property
     * @param {string} value
     * @param {string} mark
     * @param {boolean} travels
     */
    shift(target, property, value, mark, travels) {
        // The push travels with the panel: its time, curve and delay are the panel's own for this change, read after the flip, so
        // the content moves on the theme's slide and back on its reverse (css/components.css reads these). A theme that draws the
        // content's move itself (cyberpunk's ticks, nostromo's cut) wins from its register. Other moves are instant.
        const timing = travels ? slideTiming(this.panel) : INSTANT;
        target.style.setProperty('--kp-sidenav-shift-duration', timing.duration);
        target.style.setProperty('--kp-sidenav-shift-ease', timing.ease);
        target.style.setProperty('--kp-sidenav-shift-delay', timing.delay);
        // A theme may draw the content's move (cyberpunk takes it in ticks): the mark says which way.
        target.setAttribute('data-kp-sidenav-shift', mark);
        for (const one of MOVED) target.style[one] = '';
        target.style[property] = value;
    }

    /**
     * The page's choice of opener [sidenav-opener-M1]: the launcher, the edge tab or both; the default is the tab. The boxes the
     * choice turns off are marked and not drawn; the panel's room for the launcher (its header's start padding) is there only while
     * a launcher is. Over and push only: a side panel and the collapsed rail show what the markup holds. A panel with no tab on the
     * page keeps its launcher whatever is asked: a panel is never left without an opener.
     */
    applyOpener() {
        const asked = this.read(OPTIONS.opener);
        const wanted = asked === 'launcher' || asked === 'both' ? asked : 'tab';
        const chosen = wanted === 'tab' && this.tabs().length === 0 ? 'launcher' : wanted;
        const slides = this.mode() !== 'side' && !this.panel.hasAttribute(OPTIONS.slimCollapsed);
        const keep = { launcher: !slides || chosen !== 'tab', tab: !slides || chosen !== 'launcher' };
        for (const [boxes, kept] of /** @type {const} */ ([
            [this.launchers(), keep.launcher],
            [this.tabs(), keep.tab],
        ])) {
            for (const box of boxes) {
                box.toggleAttribute(OPTIONS.openerOff, !kept);
                box.toggleAttribute(OPTIONS.openerOn, kept);
            }
        }
        if (!this.launchedByMarkup) this.panel.toggleAttribute(OPTIONS.launched, keep.launcher && this.launchers().length > 0);
    }

    /**
     * Put the opener, the strip, the edge tabs and the content where an open or shut panel wants them.
     * @param {boolean} open
     * @returns {{ property: null; value: string } | { property: string; value: string }}
     */
    offsetContent(open) {
        this.applyOpener();
        this.syncPeek(open);
        const mode = this.mode();
        // The edge tab rides on the panel's far edge in the modes that slide: at the window's edge while the panel is away.
        for (const tab of this.tabs()) {
            tab.setAttribute('data-kp-sidenav-tab-edge', this.edge());
            const value = mode === 'side' ? '' : open ? this.edgeSize() : this.peekSize();
            this.shift(tab, this.marginAlong(), value, open ? 'open' : 'closed', mode !== 'side');
        }
        const target = this.contentEl();
        if (!target) return { property: null, value: '' };
        this.carryInset(target);
        // side pads, push pushes — the reference's own distinction, and it matters: padding keeps a background under the panel, a
        // margin moves the whole box. A gutter is a margin too: the content's box starts where the panel ends.
        const reserved = this.reserved();
        const property = mode === 'push' || reserved ? this.marginAlong() : this.paddingAlong();
        // A shut push panel that leaves a strip in view keeps the strip's room.
        const value = reserved || (open && mode !== 'over') ? this.panelSize() : mode === 'push' ? this.peekSize() : '';
        this.shift(target, property, value, reserved ? 'reserved' : open ? 'open' : 'closed', mode === 'push' && !reserved);
        return { property, value };
    }

    /**
     * The inset variant makes the content a card (css/components.css), which reads its knobs from the panel's side of the page too.
     * @param {HTMLElement} target
     */
    carryInset(target) {
        const inset = this.read(OPTIONS.variant) === 'inset';
        if (inset) target.setAttribute(OPTIONS.inset, this.edge());
        else target.removeAttribute(OPTIONS.inset);
        for (const name of INSET_KNOBS) {
            const value = inset ? getComputedStyle(this.panel).getPropertyValue(name).trim() : '';
            if (value !== '') target.style.setProperty(name, value);
            else target.style.removeProperty(name);
        }
    }

    /** The launcher boxes that hold one of this panel's togglers. */
    launchers() {
        /** @type {Set<HTMLElement>} */
        const boxes = new Set();
        for (const toggler of this.togglers()) {
            const box = toggler.closest(SIDENAV_LAUNCHER);
            if (box instanceof HTMLElement) boxes.add(box);
        }
        return [...boxes];
    }

    /**
     * Light the launcher with the opening's first frame and put it out with the closing's last: the launcher's change is part of
     * the pair, so the close plays it last, as the open played it first (docs/THEME_LESSONS.md 11 and 45).
     *
     * @param {boolean} open
     * @param {boolean} now no motion to wait for (the starting state, a mode change)
     */
    light(open, now) {
        this.lightTurn += 1;
        const turn = this.lightTurn;
        const boxes = this.launchers();
        if (open) {
            this.panel.inert = false;
            for (const box of boxes) box.setAttribute(OPTIONS.lit, '');
            return;
        }
        if (now) return this.putOut(boxes);
        requestAnimationFrame(() => {
            const target = this.contentEl();
            const motions = [...this.panel.getAnimations({ subtree: true }), ...(target ? target.getAnimations() : [])].map((a) =>
                a.finished.catch(() => {}),
            );
            void Promise.all(motions).then(() => {
                if (turn !== this.lightTurn || this.isOpen()) return;
                this.putOut(boxes);
            });
        });
    }

    /**
     * Put the launchers out. A closed panel that slides away is inert from the closing's last frame, so its links leave the tab
     * order and the accessibility tree; a side panel that is shut is not rendered at all.
     * @param {HTMLElement[]} boxes
     */
    putOut(boxes) {
        for (const box of boxes) box.removeAttribute(OPTIONS.lit);
        this.panel.inert = this.mode() !== 'side' && this.on(OPTIONS.inert, true);
    }

    /** Tell the togglers the panel's state, and name the ones without words of their own. @param {boolean} open */
    say(open) {
        const s = { ...getStrings(), ...this.strings };
        for (const toggler of this.togglers()) {
            if (this.ownedBy !== '' && toggler.matches(this.ownedBy)) continue;
            toggler.setAttribute('aria-expanded', String(open));
            toggler.setAttribute('aria-controls', this.panel.id);
            if (wantsName(toggler)) {
                toggler.setAttribute('aria-label', open ? s.closeSidebar : s.sidebar);
            }
        }
    }
}
