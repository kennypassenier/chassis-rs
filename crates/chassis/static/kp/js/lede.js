// The lede: the short paragraph under a heading that says what the section does [kpadopt5].
//
// The markup is complete without this module (`.kp-lede`, css/components.css); the module adds what a stylesheet cannot:
//
//   · the heading it follows is described by it (`aria-describedby`), so a screen reader hears it with the heading
//   · (both options below are read again when the attribute changes, js/live-options.js)
//   · `data-kp-lede-collapsible[=N]`: a lede longer than about N characters (default 140) shows its first sentences and folds
//     the rest behind "More" / "Less"
//   · `data-kp-lede-link="<url>"`: a "Learn more" link at the end (also on a folded lede: after the folded part)
//   · `missingLedes(root)` lists the headings of `.kp-card__title`, and of every heading inside a container marked
//     `data-kp-lede-required`, that have no lede after them; attachLedes() warns about them in the console
//
//   <h2 id="schedules">Schedules</h2>
//   <p class="kp-lede">Each schedule starts a job at fixed times. Pause one to stop it without deleting it.</p>
//
// Nothing runs on import; attachLedes(root) returns a detach.

import { getStrings } from './strings.js';
import { watchOptions } from './live-options.js';
import { Controller, attachOne, controllerOf } from './controller.js';

/** A lede. */
export const LEDE = '.kp-lede';

let counter = 0;
/** The characters after which a collapsible lede folds when `data-kp-lede-collapsible` carries no number. */
const DEFAULT_FOLD_LIMIT = 140;
/** How far past the limit the text must run before folding is worth a button (a lede just over the limit stays whole). */
const FOLD_SLACK = 1.5;
/** How many siblings after a heading are searched for its lede. */
const LEDE_SEARCH_HOPS = 3;
const HEADINGS = 'h1, h2, h3, h4, h5, h6, .kp-card__title, .kp-page-header__title';

/**
 * What may hold the heading a lede follows. `[data-kp-measured]` is the span js/effects/measure.js wraps a headline in
 * (blueprint's measurement frame): whether the frame went up before this module attached depends on which of the two
 * arrived first, and under js/auto.js the effects attach first, so a wrapped headline read as no heading at all.
 */
const HOLDERS = 'header, .kp-card__header, .kp-page-header, div, [data-kp-measured]';

/** The heading a lede belongs to: the nearest heading before it in its container. @param {Element} lede */
function headingOf(lede) {
    let prev = lede.previousElementSibling;
    while (prev) {
        if (prev.matches(HEADINGS)) return prev;
        const inner = prev.querySelector(HEADINGS);
        if (inner && prev.matches(HOLDERS)) return inner;
        if (!prev.matches('.kp-lede, p, div')) return null;
        prev = prev.previousElementSibling;
    }
    return null;
}

/**
 * The headings under `root` that have no lede after them.
 * @param {ParentNode} [root]
 * @returns {Element[]}
 */
export function missingLedes(root = document) {
    /** @type {Element[]} */
    const scope = [...root.querySelectorAll(`.kp-card__title, [data-kp-lede-required] :is(${HEADINGS})`)];
    return scope.filter((heading) => {
        let node = heading.nextElementSibling ?? heading.parentElement?.nextElementSibling ?? null;
        for (let hops = 0; node && hops < LEDE_SEARCH_HOPS; hops++) {
            if (node.matches(LEDE) || node.querySelector(LEDE)) return false;
            if (node.matches(HEADINGS)) return true;
            node = node.nextElementSibling;
        }
        return true;
    });
}

/** One lede: described-by on its heading, the optional "Learn more" link and the optional fold, drawn again when the options change. */
class LedeController extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {Record<string, unknown>} [options]
     */
    constructor(host, options) {
        super(host, options);
        /** The strings are read once, when the lede is wired, as they always were. */
        this.strings = getStrings();
        /** @type {HTMLAnchorElement | null} */
        this.link = null;
        /** @type {HTMLButtonElement | null} */
        this.toggle = null;
        /** @type {HTMLElement | null} */
        this.rest = null;
        /** The lede's own words while it is folded, to give back. */
        this.plain = '';
    }

    connect() {
        const lede = this.host;
        lede.dataset.kpLedeAttached = '';
        this.own(() => {
            delete lede.dataset.kpLedeAttached;
        });
        if (!lede.id) lede.id = `kp-lede-${++counter}`;
        this.describeHeading();
        this.draw();
        this.own(() => this.undraw());
        this.own(
            watchOptions(lede, ['data-kp-lede-collapsible', 'data-kp-lede-link'], () => {
                this.undraw();
                this.draw();
            }),
        );
    }

    /** Add this lede to the `aria-describedby` of its heading and give the heading's old value back on destroy. */
    describeHeading() {
        const lede = this.host;
        const heading = headingOf(lede);
        if (!heading) return;
        const before = heading.getAttribute('aria-describedby');
        const ids = (before ?? '').split(/\s+/).filter(Boolean);
        if (!ids.includes(lede.id)) heading.setAttribute('aria-describedby', [...ids, lede.id].join(' '));
        this.own(() => {
            if (before === null) heading.removeAttribute('aria-describedby');
            else heading.setAttribute('aria-describedby', before);
        });
    }

    /** The fold and the link are drawn from the two attributes, and drawn again when either changes [live-options-1019]. */
    draw() {
        const lede = this.host;
        // The text to fold is read before the link is appended: the link is an element of its own, and a lede that already
        // carries one would otherwise read as a lede with markup in it and never fold [findings-1019].
        this.plain = lede.childElementCount === 0 ? (lede.textContent ?? '').trim().replace(/\s+/g, ' ') : '';
        this.drawLink();
        this.drawFold();
    }

    /** The "Learn more" link at the end of the lede. */
    drawLink() {
        const lede = this.host;
        const href = lede.getAttribute('data-kp-lede-link');
        if (!href) return;
        const link = lede.ownerDocument.createElement('a');
        link.className = 'kp-lede__link';
        link.href = href;
        link.textContent = this.strings.ledeLearnMore;
        lede.append(' ', link);
        this.link = link;
    }

    /**
     * A very long lede folds after its first sentences, by splitting the text itself (a clipped line would still be
     * laid out underneath the content that follows it): the rest is a hidden span that "More" opens.
     */
    drawFold() {
        const lede = this.host;
        const limit = Number.parseInt(lede.getAttribute('data-kp-lede-collapsible') ?? '', 10) || DEFAULT_FOLD_LIMIT;
        if (!lede.hasAttribute('data-kp-lede-collapsible') || this.plain.length <= limit * FOLD_SLACK) return;
        const sentences = this.plain.split(/(?<=[.!?])\s+/);
        let head = '';
        let at = 0;
        while (at < sentences.length - 1 && head.length < limit) head += (head ? ' ' : '') + sentences[at++];
        if (at >= sentences.length) return;
        lede.textContent = `${head} `;
        const rest = lede.ownerDocument.createElement('span');
        rest.id = `${lede.id}-rest`;
        rest.hidden = true;
        rest.textContent = sentences.slice(at).join(' ');
        lede.append(rest);
        this.rest = rest;
        // The link stays at the end of the whole lede, after the folded part.
        if (this.link) lede.append(' ', this.link);
        this.drawToggle(rest);
    }

    /** The "More" / "Less" button after the lede. @param {HTMLElement} rest */
    drawToggle(rest) {
        const s = this.strings;
        const button = this.host.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'kp-button kp-button--ghost kp-button--sm kp-lede__toggle';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', rest.id);
        button.textContent = s.ledeMore;
        this.host.after(button);
        this.toggle = button;
        button.addEventListener('click', () => {
            rest.hidden = !rest.hidden;
            button.setAttribute('aria-expanded', String(!rest.hidden));
            button.textContent = rest.hidden ? s.ledeMore : s.ledeLess;
        });
    }

    /** Give the lede back its own words, without the link or the fold. */
    undraw() {
        this.toggle?.remove();
        this.toggle = null;
        this.link?.previousSibling?.remove();
        this.link?.remove();
        this.link = null;
        if (this.rest) this.host.textContent = this.plain;
        this.rest = null;
    }
}

/**
 * Wire every lede under `root`.
 *
 * @param {ParentNode} [root]
 * @returns {() => void} detach
 */
export function attachLedes(root = document) {
    // The root itself is never a lede host here: only what is under it, as before.
    const made = [...root.querySelectorAll(LEDE)]
        .map((found) => /** @type {HTMLElement} */ (found))
        .filter((lede) => !(lede.dataset.kpLedeAttached !== undefined || controllerOf(lede, LedeController)))
        .map((lede) => attachOne(lede, LedeController))
        .filter((controller) => controller !== undefined);
    const missing = missingLedes(root);
    if (missing.length > 0 && root.querySelector?.('[data-kp-lede-required]'))
        console.warn(`[kp-lede] ${missing.length} heading(s) without a lede:`, missing);
    return () => {
        for (const controller of made) controller.destroy();
    };
}
