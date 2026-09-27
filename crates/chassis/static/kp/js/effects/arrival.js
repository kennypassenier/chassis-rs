// The arrival hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { STATE, ARRIVAL, KNOBS, BOOT_PROGRESS, TIMINGS } from '../effects.js';
import { getStrings } from '../strings.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const {
        state,
        doc,
        html,
        view,
        reduced,
        rootStyle,
        cfg,
        cleanups,
        finishers,
        done,
        announce,
        later,
        arrivalRoutine,
        arrivalPerformed,
        arrivalPlays,
        arrivalsOnScreen,
    } = ctx;
    // ── The arrival [SW2]: how the page comes on ───────────────────────
    // A theme answers `--kp-arrival` on the root; `boot` is synthwave's:
    // a diegetic line counting up in the overlay the register paints, a
    // Skip button, and the CRT switching the overlay off. `card` is
    // phantom's [PH2]: the theme's own name as the line, a bar the register
    // runs under it, and the overlay shoved off to the left. Once per
    // session, never under reduced motion, and every word from the
    // dictionary [KT5] — a theme's name is data, not copy. The words are
    // the theme's own (`arrivalWordsByTheme`, `arrivalLinesByTheme`) or the
    // neutral ones, and `--kp-arrival-rate` scales the whole sequence
    // [scope-84].
    const arrival = () => {
        const routine = arrivalRoutine;
        if (!arrivalPerformed || !doc.body) return;
        const card = routine === 'card';
        if (!arrivalPlays) {
            announce(html, 'arrival', routine, true);
            return;
        }
        // The headlines held for this overlay start once it has gone
        // [scope-86]: on its own end, on Skip, on a click, and when a
        // detach takes it down.
        const release = () => {
            const held = arrivalsOnScreen.get(doc);
            arrivalsOnScreen.delete(doc);
            if (held) for (const go of [...held]) go();
        };
        const words = getStrings();
        const theme = html.getAttribute('data-theme') ?? '';
        // The words of this theme's own world [scope-84]: a theme with an
        // entry reads its own, and a theme without one reads the neutral
        // default — never another theme's.
        const own = words.arrivalWordsByTheme?.[theme] ?? {};
        const said = {
            line: own.line ?? words.arrivalLine,
            progress: own.progress ?? words.arrivalProgress,
            ready: own.ready ?? words.arrivalReady,
        };
        const askedRate = parseFloat(rootStyle?.getPropertyValue(KNOBS.arrivalRate) ?? '');
        const rate = Number.isFinite(askedRate) && askedRate > 0 ? askedRate : 1;
        /** @param {() => void} fn @param {number} ms */
        const paced = (fn, ms) => later(fn, ms / rate);
        // The overlay's CSS animations at the same rate. Read after a style
        // flush, so an animation a class has just started is in the list.
        const pace = () => {
            if (rate === 1 || typeof overlay.getAnimations !== 'function') return;
            void view?.getComputedStyle(overlay).opacity;
            for (const animation of overlay.getAnimations({ subtree: true })) animation.playbackRate = rate;
        };
        const overlay = doc.createElement('div');
        overlay.className = ARRIVAL.root;
        const line = doc.createElement('pre');
        line.className = ARRIVAL.line;
        line.setAttribute('aria-live', 'polite');
        const skip = doc.createElement('button');
        skip.type = 'button';
        skip.className = ARRIVAL.skip;
        skip.textContent = words.arrivalSkip;
        // The segmented bar retro's POST counts along [S49, A11]: built
        // only when the theme asks for one, and painted by its register.
        const bar = rootStyle?.getPropertyValue(KNOBS.arrivalBar).trim() === 'block' ? doc.createElement('div') : null;
        if (bar) {
            bar.className = ARRIVAL.bar;
            bar.setAttribute('aria-hidden', 'true');
            bar.style.setProperty(BOOT_PROGRESS, '0');
        }
        overlay.append(line, ...(bar ? [bar] : []), skip);
        doc.body.append(overlay);
        pace();
        state.pending++;
        let ended = false;
        let pct = 0;
        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            overlay.remove();
            announce(html, 'arrival', routine, false);
            state.pending--;
            release();
            done();
        };
        const end = () => {
            if (ended) return;
            ended = true;
            if (reduced()) {
                remove();
                return;
            }
            overlay.classList.add(STATE.off);
            pace();
            overlay.addEventListener('animationend', remove, { once: true });
            paced(remove, TIMINGS[card ? 'kp-load-out' : 'kp-crt-off'].durationMs + 50);
        };
        const step = () => {
            if (ended) return;
            pct = Math.min(100, pct + 7 + Math.floor(Math.random() * 9));
            line.textContent = [said.line, `${said.progress} ${pct}%`.trim(), pct === 100 ? said.ready : ''].filter(Boolean).join('\n');
            bar?.style.setProperty(BOOT_PROGRESS, String(pct / 100));
            if (pct === 100) paced(end, 220);
            else paced(step, 110);
        };

        // The lines mode [S49, A11]: a theme whose own boot is a POST
        // shows its lines one after another, cumulatively, rather than a
        // percentage — retro's BIOS banner and memory test, terminal's
        // five lines. The words are the dictionary's (KT5), the cadence
        // the demos' own 190ms, and a `{count}` counts up to the theme's
        // declared total the way a memory test does.
        const lines = words.arrivalLinesByTheme?.[theme] ?? null;
        let shown = 0;
        const total = Number(rootStyle?.getPropertyValue(KNOBS.arrivalCount)) || 640;
        const lineStep = () => {
            if (ended || !lines) return;
            shown++;
            const upto = lines.slice(0, shown);
            line.textContent = upto
                .map((/** @type {string} */ text, /** @type {number} */ index) =>
                    text.replace('{count}', String(index === shown - 1 ? Math.round((total * shown) / lines.length) : total)),
                )
                .join('\n');
            bar?.style.setProperty(BOOT_PROGRESS, String(shown / lines.length));
            if (shown === lines.length) paced(end, 320);
            else paced(lineStep, 190);
        };
        skip.addEventListener('click', end);
        // CP1, Kenny 2026-09-09: "remember it for the next version". This is
        // that version. A click anywhere on the overlay ends it, because an
        // overlay that covers the whole viewport and answers one 90-pixel
        // button is indistinguishable from a page that has stopped working.
        // A theme that wants the old behaviour sets `--kp-arrival-dismiss:
        // skip-only`.
        if (rootStyle?.getPropertyValue(KNOBS.arrivalDismiss).trim() !== 'skip-only') overlay.addEventListener('click', end);
        finishers.push(end);
        cleanups.push(() => {
            overlay.remove();
            if (!removed) release();
        });
        if (card) {
            line.textContent = theme;
            paced(end, TIMINGS['kp-bar-run'].durationMs + cfg.cardHold);
        } else if (lines && lines.length > 0) lineStep();
        else step();
    };
    return { arrival };
}
