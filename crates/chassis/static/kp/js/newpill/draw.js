// Drawing the pill: ruled in and taken out the way it came, the count on it, the pause buttons, the event, and the count said now and then.

import { NewPillCore } from './core.js';
import { FOLLOW_EVENT, LEAVE_FALLBACK_MS, NEWPILL_SAY_MS } from './values.js';

export class NewPillDraw extends NewPillCore {
    /** The pill is ruled in, and taken out the way it came [prefers-reduced-motion: at once]. @param {boolean} on */
    show(on) {
        const { pill, view } = this;
        const reduce = typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (on) {
            pill.removeAttribute('data-kp-leaving');
            pill.hidden = false;
            return;
        }
        if (pill.hidden || pill.hasAttribute('data-kp-leaving')) return;
        if (reduce) {
            pill.hidden = true;
            return;
        }
        pill.setAttribute('data-kp-leaving', '');
        const finish = () => {
            if (!pill.hasAttribute('data-kp-leaving')) return;
            pill.removeAttribute('data-kp-leaving');
            pill.hidden = true;
        };
        pill.addEventListener('animationend', finish, { once: true });
        view?.setTimeout(finish, LEAVE_FALLBACK_MS);
    }

    /** The unit word for a count. @param {number} n */
    unitFor(n) {
        return n === 1 ? this.read.unitOne : this.read.unitMany;
    }

    /** The pause buttons say what they will do. */
    paintToggles() {
        const { strings } = this;
        const off = this.paused || !this.following;
        for (const toggle of this.toggles()) {
            toggle.setAttribute('aria-pressed', String(off));
            toggle.textContent = off ? strings.newpillResume : strings.newpillPause;
        }
    }

    draw() {
        if (this.destroyed) return;
        const { strings, number, back, host } = this;
        const n = this.count();
        this.show(n > 0);
        // The words of the last count stay on the pill while it is taken out.
        if (n > 0) {
            number.textContent = strings.newpillNew(n, this.unitFor(n));
            back.textContent = this.head ? strings.newpillBackHead : strings.newpillBackTail;
        }
        host.setAttribute('data-kp-following', String(this.isFollowing()));
        this.paintToggles();
        host.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { bubbles: true, detail: { following: this.isFollowing(), paused: this.paused, unseen: n } }));
        if (n > 0) this.sayCount();
    }

    /** A screen reader hears the count now and then, not on every row. */
    sayCount() {
        const wait = NEWPILL_SAY_MS - (performance.now() - this.lastSaid);
        if (wait <= 0) this.say();
        else if (this.sayLater === undefined) {
            this.sayLater = this.view?.setTimeout(() => {
                this.sayLater = undefined;
                this.say();
            }, wait);
        }
    }

    say() {
        this.lastSaid = performance.now();
        const m = this.count();
        if (m > 0) this.live.textContent = this.strings.newpillAnnounce(m, this.unitFor(m));
    }
}
