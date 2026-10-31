// What the display field and the input field share: the parts they built, the spoken line, the countdown timer and Copy.
import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { clearClipboardLater } from './clipboard.js';
import { CLEAR_AFTER_MS, COPIED_MS, COPY_EVENT, COPY_FAILED_EVENT, SECRET_EVENT, SECRET_TTL, clearDelay } from './constants.js';
import { secrets } from './secret-api.js';

/** How long (ms) the polite region stays empty before it speaks, so the same words twice are heard twice. */
const SAY_DELAY_MS = 30;
/** One countdown step, in ms. */
export const TICK_MS = 1000;
/** The seconds left at which a long countdown is announced once more. */
export const LAST_CALL_SECONDS = 10;

/**
 * @typedef {{ copiedMs?: number, clearAfterMs?: number | false, load?: import('./types.js').SecretLoad }} SecretOptions
 */

/** The base of both secret field controllers. */
export class SecretBase extends Controller {
    /** @param {HTMLElement} host @param {SecretOptions} [options] */
    constructor(host, options = {}) {
        super(host, options);
        this.doc = host.ownerDocument;
        this.s = getStrings();
        this.copiedMs = options.copiedMs ?? COPIED_MS;
        this.clearAfterMs = options.clearAfterMs ?? CLEAR_AFTER_MS;
        /** The parts this controller made, removed on detach. @type {Element[]} */
        this.built = [];
        /** How long a shown value stays, in seconds; 0: until hidden. */
        this.seconds = SECRET_TTL;
        /** The seconds left while shown. */
        this.left = 0;
        /** The countdown interval, 0 when none runs. */
        this.timer = 0;
        /** The timer that puts Copy's own words back. */
        this.copiedTimer = 0;
        /** Cancels the clipboard clearing a copy scheduled. */
        this.cancelClear = () => {};
        /** The polite region. Set by the subclass's build. @type {HTMLElement | null} */
        this.spoken = null;
    }

    /** Start the field: registered first, the registry entry and the timers go last on detach. */
    register() {
        secrets.set(this.host, { reveal: (reason) => void this.show(reason), hide: (reason) => this.hide(reason) });
        this.own(() => {
            this.stop();
            window.clearTimeout(this.copiedTimer);
        });
    }

    /** Show the value; the subclass says how. @param {string} [reason] @returns {void | Promise<void>} */
    show(reason) {
        void reason;
    }

    /** Hide the value; the subclass says how. @param {string} [reason] */
    hide(reason) {
        void reason;
    }

    /** Tell a screen reader, politely. @param {string} text */
    say(text) {
        const spoken = this.spoken;
        if (!spoken) return;
        spoken.textContent = '';
        window.setTimeout(() => (spoken.textContent = text), SAY_DELAY_MS);
    }

    /** Count down from now, once a second, unless the value stays shown. @param {() => void} tick */
    startTicking(tick) {
        this.left = this.seconds;
        if (this.seconds > 0) this.timer = window.setInterval(tick, TICK_MS);
    }

    stop() {
        window.clearInterval(this.timer);
        this.timer = 0;
    }

    /** The drain under the value restarts with every showing. @param {HTMLElement} drain */
    restartDrain(drain) {
        drain.style.animation = 'none';
        void drain.offsetWidth;
        drain.style.removeProperty('animation');
    }

    /** Tell the page the value was shown or hidden. @param {boolean} shown @param {string} reason */
    announce(shown, reason) {
        this.host.dispatchEvent(new CustomEvent(SECRET_EVENT, { bubbles: true, detail: { shown, reason } }));
    }

    /**
     * Copy `read()`'s text: the button says so, the page hears it (never the value itself), and the clipboard is emptied again
     * later. A refusal is said too, so the button is not one people click twice and then distrust.
     * @param {HTMLButtonElement} copy
     * @param {() => string | Promise<string>} read
     * @param {string} name what the announcement calls the field
     * @param {() => void} settle puts the button's own words back
     */
    async copyOut(copy, read, name, settle) {
        let text = '';
        try {
            text = await read();
            await navigator.clipboard.writeText(text);
        } catch (error) {
            copy.dataset.kpCopyFailed = '';
            copy.dispatchEvent(new CustomEvent(COPY_FAILED_EVENT, { bubbles: true, detail: { text: '', error } }));
            this.say(this.s.copyBlockedAnnouncement);
            return;
        }
        delete copy.dataset.kpCopyFailed;
        copy.textContent = this.s.copied;
        copy.dataset.kpCopied = '';
        copy.dispatchEvent(new CustomEvent(COPY_EVENT, { bubbles: true, detail: { text: '' } }));
        this.say(this.s.copiedAnnouncement(name));
        window.clearTimeout(this.copiedTimer);
        this.copiedTimer = window.setTimeout(settle, this.copiedMs);
        this.scheduleClear(text);
    }

    /** Empty the clipboard again some seconds after a copy [wish-1120, homelab 108]. @param {string} secret */
    scheduleClear(secret) {
        this.cancelClear();
        const wait = clearDelay(this.host.dataset.kpSecretClear, this.clearAfterMs);
        if (wait > 0) this.cancelClear = clearClipboardLater(this.host, secret, wait, (text) => this.say(text));
    }
}
