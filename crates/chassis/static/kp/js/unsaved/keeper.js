// Keeps the changes across a reload: writes them to a Storage as they change and puts them back when the bar attaches.

import { toast } from '../overlays.js';
import { RESTORED_TOAST_MS, config } from './config.js';
import { readValue, writeValue } from './values.js';

/** Keeps and restores one bar's changes. */
export class ChangeKeeper {
    /** @param {import('./controller.js').UnsavedController} ctl */
    constructor(ctl) {
        this.ctl = ctl;
        /** Whether this bar keeps anything at all (`data-kp-keep="off"` or no Storage turns it off). */
        this.keepOn = false;
    }

    /** Decide whether the bar keeps its changes; the Storage can be asked only once the bar exists. */
    connect() {
        this.keepOn = this.ctl.settings.keepAttribute !== 'off' && this.store() !== null;
    }

    /** The Storage the changes are kept in, or null: the call's option, else the page's, else session (or local) storage [wish-1028]. */
    store() {
        const { options, settings, win } = this.ctl;
        if (options.storage !== undefined) return /** @type {Storage | null} */ (options.storage);
        if (config.storage !== undefined) return config.storage;
        try {
            return settings.keepAttribute === 'local' ? win.localStorage : win.sessionStorage;
        } catch {
            return null;
        }
    }

    /**
     * The key a control is kept under, or '' when it has none. A composite field goes by its posted name (`data-kp-name`,
     * or the `name` of an input inside it), else its id.
     * @param {HTMLElement} c
     */
    keyOf(c) {
        return c.getAttribute('name') ?? c.getAttribute('data-kp-name') ?? c.querySelector('[name]')?.getAttribute('name') ?? c.id;
    }

    /** Write the changed values (all of them, or none when nothing is changed). */
    keep() {
        if (!this.keepOn) return;
        const { settings, tracker } = this.ctl;
        try {
            const kept = /** @type {Record<string, string>} */ ({});
            for (const [c, was] of tracker.baseline) {
                const key = this.keyOf(c);
                if (!key || c.matches(settings.exclude) || c.closest(settings.exclude)) continue;
                const now = readValue(/** @type {HTMLInputElement} */ (c));
                if (now !== was) kept[key] = now;
            }
            if (Object.keys(kept).length) this.store()?.setItem(settings.storeKey, JSON.stringify(kept));
            else this.store()?.removeItem(settings.storeKey);
        } catch {
            // No storage: the changes are not kept.
        }
    }

    /** Put the kept values back and say so. */
    restore() {
        if (!this.keepOn) return;
        const { settings, tracker, s, live } = this.ctl;
        try {
            const raw = this.store()?.getItem(settings.storeKey);
            if (!raw) return;
            const kept = /** @type {Record<string, string>} */ (JSON.parse(raw));
            let n = 0;
            for (const c of tracker.baseline.keys()) {
                const key = this.keyOf(c);
                if (!key || !(key in kept) || c.matches(settings.exclude)) continue;
                writeValue(/** @type {HTMLInputElement} */ (c), kept[key]);
                tracker.track(/** @type {HTMLInputElement} */ (c));
                n++;
            }
            if (n > 0) {
                this.ctl.paint();
                const total = tracker.changes().length;
                toast(s.unsavedRestored(total), { ms: RESTORED_TOAST_MS });
                live.textContent = s.unsavedRestored(total);
            }
        } catch {
            // Unreadable: nothing is restored.
        }
    }
}
