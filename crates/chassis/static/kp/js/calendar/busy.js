// The busy layers a theme holds on screen while their state goes: marks them as leaving and tidies their words when they are gone.

/** The marks of a busy layer: the whole grid's card and a day's spinner. */
export const BUSY_LAYERS = '.kp-calendar__busy, .kp-calendar__day-busy';

/**
 * The busy layers a theme holds on screen while their state goes (`--kp-calendar-busy-leave:
 * hold`, set on the layers by cyberpunk): each is marked `[data-kp-leaving]`, which the
 * register draws as the leave of its arrival played backwards and keeps displayed until it is
 * over. Then the mark goes and the layer is hidden by the calendar's own rules.
 * @param {Element[]} layers
 */
export function leaveBusyLayers(layers) {
    for (const layer of layers) {
        layer.setAttribute('data-kp-leaving', '');
        getComputedStyle(layer).animationName;
        const plays = layer.getAnimations().filter((a) => a instanceof CSSAnimation && /** @type {KeyframeEffect} */ (a.effect)?.target === layer);
        const done = () => {
            layer.removeAttribute('data-kp-leaving');
            // Words kept on the card through its leave (see setCalendarState()) go with it.
            const words = layer.querySelector(':scope > .kp-calendar__busy-text');
            if (words !== null && layer.hasAttribute('data-kp-busy-words-held')) {
                layer.removeAttribute('data-kp-busy-words-held');
                words.textContent = '';
            }
        };
        if (plays.length === 0) done();
        else void Promise.all(plays.map((a) => a.finished)).then(done, done);
    }
}

/**
 * Write the words on the whole grid's busy card. A theme that takes the card off as its arrival backwards keeps its words on it
 * until it is gone (`--kp-calendar-busy-words: hold`, pastel), so the card that leaves is the one that came.
 * @param {import('./controller.js').CalendarController} c @param {string} words the words the page gave
 */
export function writeBusyWords(c, words) {
    if (!c.busyText) return;
    const next = words || (c.state === 'loading' ? (c.strings.loading ?? 'Loading…') : '');
    const card = c.busyText.parentElement;
    const held =
        next === '' &&
        card !== null &&
        c.grid.getAttribute('aria-busy') === 'true' &&
        card.getClientRects().length > 0 &&
        getComputedStyle(card).getPropertyValue('--kp-calendar-busy-words').trim() === 'hold';
    if (held) card.setAttribute('data-kp-busy-words-held', '');
    else {
        card?.removeAttribute('data-kp-busy-words-held');
        c.busyText.textContent = next;
    }
}
