// The pointer hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { POINTER_KNOB, POINTER, LIGHT_KNOB, LIGHT, LIGHT_SELECTOR, LIGHT_REACH, LIGHT_FAR, PRESS_KNOB, PRESS } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { root, doc, html, view, reduced, rootStyle, frames, cleanups } = ctx;
    // The pointer bus [scope-16]. One listener on the document, one write
    // per animation frame, and nothing at all unless the theme asked for it.
    //
    // It writes to the root rather than to each element, because the demo's
    // gradient is declared once on the theme and inherited: every surface
    // that paints the oxide reads the same two numbers, so they must be one
    // pair, not one pair per element.
    // The pointer light [scope-101, built from scope-25]. The shade pair's
    // half of the bus: where the two numbers above are one pair for the
    // whole page, these are six per LIT ELEMENT, because a shade falls
    // away from the pointer and "away" is a different direction for every
    // box on the screen.
    //
    // Deliberately NOT a second bus. It is armed by the same
    // `--kp-pointer: track` declaration, fed by the one `pointermove`
    // listener below, and written inside the same animation frame; what it
    // adds of its own are the four ways the light goes OUT — a touch, a
    // Tab, the pointer leaving the window, and reduced motion — plus a
    // scroll listener, because a box that moves under a still pointer has
    // turned relative to it.
    //
    // Returns null when nothing is there to light. Every value is the
    // research demo's own arithmetic, unchanged.
    const pointerLight = () => {
        if (!view) return null;
        /** @type {HTMLElement[]} */
        let lit = [];
        /** @type {{ x: number, y: number } | null} */
        let at = null;
        let recollect = 0;
        let queued = 0;
        /** @param {HTMLElement} el */
        const clear = (el) => {
            for (const prop of Object.values(LIGHT)) el.style.removeProperty(prop);
        };
        // Which elements this theme lights is the theme's own answer, read
        // from the cascade rather than hard-coded here: a register that
        // never declares `--kp-light: pointer` gets an empty list and the
        // frame below does nothing at all.
        const collect = () => {
            for (const el of lit) clear(el);
            lit = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(LIGHT_SELECTOR)]).filter(
                (el) => view.getComputedStyle(el).getPropertyValue(LIGHT_KNOB).trim() === 'pointer',
            );
        };
        const paint = () => {
            const here = at;
            if (!here || reduced()) {
                for (const el of lit) clear(el);
                return;
            }
            for (const el of lit) {
                const box = el.getBoundingClientRect();
                // Off screen: nothing to light, and one getBoundingClientRect
                // is cheaper than six style writes.
                if (box.bottom < 0 || box.top > view.innerHeight) {
                    clear(el);
                    continue;
                }
                const dx = box.left + box.width / 2 - here.x;
                const dy = box.top + box.height / 2 - here.y;
                const distance = Math.hypot(dx, dy);
                const k = 1.4 / Math.max(distance, LIGHT_REACH);
                const near = 1 - Math.min(distance / LIGHT_FAR, 1);
                el.style.setProperty(LIGHT.x, (dx * k).toFixed(3));
                el.style.setProperty(LIGHT.y, (dy * k).toFixed(3));
                el.style.setProperty(LIGHT.near, near.toFixed(3));
                el.style.setProperty(LIGHT.lift, (0.6 + near).toFixed(3));
                el.style.setProperty(LIGHT.atX, `${Math.round(here.x - box.left)}px`);
                el.style.setProperty(LIGHT.atY, `${Math.round(here.y - box.top)}px`);
            }
        };
        const schedule = () => {
            if (queued) return;
            queued = view.requestAnimationFrame(() => {
                frames.delete(queued);
                queued = 0;
                paint();
            });
            frames.add(queued);
        };
        const away = () => {
            at = null;
            schedule();
        };
        /** @param {PointerEvent} event */
        const onDown = (event) => {
            if (event.pointerType === 'touch') away();
        };
        /** @param {KeyboardEvent} event */
        const onKey = (event) => {
            if (event.key === 'Tab') away();
        };
        // A theme change re-answers the knob: the list is built again one
        // frame later, when the new register's cascade has settled.
        const themes = new MutationObserver(() => {
            if (recollect) return;
            recollect = view.requestAnimationFrame(() => {
                frames.delete(recollect);
                recollect = 0;
                collect();
                paint();
            });
            frames.add(recollect);
        });
        themes.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        doc.addEventListener('pointerdown', onDown, { passive: true });
        doc.addEventListener('keydown', onKey, { passive: true });
        html.addEventListener('pointerleave', away, { passive: true });
        view.addEventListener('scroll', schedule, { passive: true });
        cleanups.push(() => {
            themes.disconnect();
            doc.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('keydown', onKey);
            html.removeEventListener('pointerleave', away);
            view.removeEventListener('scroll', schedule);
            // The way out [KT6]: what the module wrote, the module removes,
            // and the register's own fallbacks take over again.
            for (const el of lit) clear(el);
            lit = [];
        });
        collect();
        return {
            /** @param {PointerEvent | MouseEvent} event */
            put(event) {
                at = 'pointerType' in event && event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
                paint();
            },
        };
    };

    const pointerBus = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(POINTER_KNOB).trim() : '';
        if (routine !== 'track' || !view || reduced()) return;
        const light = pointerLight();
        let frame = 0;
        /** @param {PointerEvent | MouseEvent} event */
        const onMove = (event) => {
            if (frame) return;
            frame = view.requestAnimationFrame(() => {
                frames.delete(frame);
                frame = 0;
                const w = view.innerWidth || 1;
                const h = view.innerHeight || 1;
                html.style.setProperty(POINTER.x, String(Math.min(1, Math.max(0, event.clientX / w))));
                html.style.setProperty(POINTER.y, String(Math.min(1, Math.max(0, event.clientY / h))));
                light?.put(event);
            });
            frames.add(frame);
        };
        doc.addEventListener('pointermove', onMove, { passive: true });
        cleanups.push(() => {
            doc.removeEventListener('pointermove', onMove);
            // The way out [KT6]: what the module wrote, the module removes,
            // and the stylesheet's own declared value takes over again.
            html.style.removeProperty(POINTER.x);
            html.style.removeProperty(POINTER.y);
        });
    };

    // The press point [scope-101]. One delegated listener, one write per
    // press, and nothing at all unless the theme asked for it.
    //
    // It writes to the button rather than to the root, because every button
    // on the page has a press point of its own and the last one pressed
    // must keep its stain while the next one grows.
    const pressBus = () => {
        const routine = rootStyle ? rootStyle.getPropertyValue(PRESS_KNOB).trim() : '';
        if (routine !== 'point' || !view) return;
        /** The buttons this bus has written to, so it can take it all back [KT6]. */
        /** @type {Set<HTMLElement>} */
        const marked = new Set();
        /** @param {Event} event */
        const onDown = (event) => {
            const pointer = /** @type {PointerEvent} */ (event);
            const target = event.target;
            const button = target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('.kp-button')) : null;
            if (!button) return;
            const box = button.getBoundingClientRect();
            button.style.setProperty(PRESS.x, `${Math.round(pointer.clientX - box.left)}px`);
            button.style.setProperty(PRESS.y, `${Math.round(pointer.clientY - box.top)}px`);
            marked.add(button);
        };
        // A key press has no point: the stylesheet's own default takes over
        // again, which puts the stain in the middle of the button.
        /** @param {Event} event */
        const onKey = (event) => {
            const key = /** @type {KeyboardEvent} */ (event).key;
            const target = event.target;
            const button = target instanceof Element ? /** @type {HTMLElement | null} */ (target.closest('.kp-button')) : null;
            if (!button || (key !== ' ' && key !== 'Enter')) return;
            button.style.removeProperty(PRESS.x);
            button.style.removeProperty(PRESS.y);
            marked.delete(button);
        };
        doc.addEventListener('pointerdown', onDown, { passive: true });
        doc.addEventListener('keydown', onKey);
        cleanups.push(() => {
            doc.removeEventListener('pointerdown', onDown);
            doc.removeEventListener('keydown', onKey);
            for (const button of marked) {
                button.style.removeProperty(PRESS.x);
                button.style.removeProperty(PRESS.y);
            }
            marked.clear();
        });
    };
    return { pointerLight, pointerBus, pressBus };
}
