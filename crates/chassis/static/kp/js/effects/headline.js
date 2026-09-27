// The headline hook of js/effects.js, in a module of its own [scope-117].
//
// Cut out of attachEffects() line for line, so a page that never asks for it
// never downloads it: js/effects.js fetches this the first time an element or
// a theme knob needs it. What it shared with the rest of the closure arrives
// through `ctx`; the four variables every part writes are `ctx.state`.

import { HEADLINE_ROUTINES, STATE, ROUTINES, TEXT_ATTRIBUTE, GLYPHS, TIMINGS } from '../effects.js';

/** @param {import('../effects.js').EffectsContext} ctx */
export function install(ctx) {
    const { state, doc, view, reduced, cfg, frames, finishers, done, announce, later, routineOf, seen, reportUnknownRoutine } = ctx;
    // ── The headline: decipher, then one slice burst [TH119] ───────────
    /** @param {Element} el @param {boolean} [atRest] straight to rest, as a detach does for a reveal it never started */
    const headline = (el, atRest = false) => {
        const text = el.textContent ?? '';
        el.setAttribute(TEXT_ATTRIBUTE, text);
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
        const asked = routineOf(el, 'headline');
        // A name no routine answers to is reported and then treated as
        // silence [G6]: the chain below ends at decipher, so a typo in a
        // register used to give that theme glyph noise over its headline
        // rather than the rest it asked for.
        const routine =
            asked === '' || HEADLINE_ROUTINES.includes(asked) ? asked : reportUnknownRoutine(el, ROUTINES.headline, asked, HEADLINE_ROUTINES);
        /** @param {boolean} skipped */
        const rest = (skipped) => {
            el.textContent = text;
            el.classList.add(STATE.deciphered);
            announce(el, 'headline', routine, skipped);
        };
        if (atRest || routine === '' || reduced() || seen(el, 'headline')) {
            rest(true);
            return;
        }
        if (routine === 'tracking') {
            // The synthwave headline [SW2]: the text stays whole; one tracking
            // wipe crosses it, then one shine. The register animates the
            // classes; without an animation the classes come off by the
            // table's durations, so nothing waits on an event that never comes.
            state.pending++;
            let ended = false;
            const shine = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.tracking);
                el.classList.add(STATE.shine);
                const off = () => el.classList.remove(STATE.shine);
                el.addEventListener('animationend', off, { once: true });
                later(off, TIMINGS['kp-shine'].durationMs + 50);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(shine);
            el.classList.add(STATE.tracking);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-tracking') return;
                el.removeEventListener('animationend', onEnd);
                shine();
            };
            el.addEventListener('animationend', onEnd);
            later(shine, TIMINGS['kp-tracking'].durationMs + 50);
            return;
        }
        if (routine === 'popdown') {
            // The nostromo headline [S48, LIFT_PLAN nostromo row]: the text
            // stays whole throughout — no glyph or word is ever touched —
            // under a clip-path the register sweeps open top-down; the
            // class runs it, then the element rests. Without an animation
            // the class comes off by the table's duration.
            state.pending++;
            el.classList.add(STATE.popping);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.popping);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-popdown') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-popdown'].durationMs + 50);
            return;
        }
        if (routine === 'draw') {
            // The academia headline [lift row 10]: the words are never
            // touched — no noise, no split into words. A rule beneath the
            // heading grows in once it enters the viewport, the exact
            // mechanism `rule()` below already performs, generalised to
            // h1 because the approved demo drives both off one
            // IntersectionObserver and one class ("The Reading Room",
            // 2026-09-08). The register paints the draw; this only
            // watches and flips the class.
            if (!view || typeof view.IntersectionObserver !== 'function') {
                el.classList.add(STATE.in);
                announce(el, 'headline', routine, true);
                return;
            }
            state.pending++;
            finishers.push(() => {
                el.classList.add(STATE.in);
                announce(el, 'headline', routine, false);
            });
            state.ioHeadline ??= new view.IntersectionObserver(
                (/** @type {IntersectionObserverEntry[]} */ entries) => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) continue;
                        state.ioHeadline?.unobserve(entry.target);
                        entry.target.classList.add(STATE.in);
                        announce(entry.target, 'headline', routine, false);
                        state.pending--;
                        done();
                    }
                },
                { threshold: cfg.threshold },
            );
            state.ioHeadline?.observe(el);
            return;
        }
        if (routine === 'arrive') {
            // The formal headline [S49, LIFT_PLAN row 16]: whole and
            // untouched — this theme does not glitch or type, it commits.
            // Nothing here manipulates a character; the class the register
            // reads (STATE.deciphered, same completion marker every
            // routine sets) is held off by one frame past the next, the
            // same two-`requestAnimationFrame` technique the approved demo
            // used itself, so the browser paints the hidden state before a
            // plain CSS transition (fade, rise) carries it to rest.
            state.pending++;
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const arm = () => later(finish, 500);
            if (view) view.requestAnimationFrame(() => view.requestAnimationFrame(arm));
            else arm();
            return;
        }
        if (routine === 'ink') {
            // The sepia headline [S48, LIFT_PLAN row 9]: no per-word
            // stagger — the whole line is one CSS transition, a faint
            // ghost of the ink colour settling to the full one, because
            // this theme (anatomy.md) is "unhurried on purpose". `settling`
            // is transient like `dissolving`/`typing`: added, then removed
            // once the transition has run, so a quiet theme or reduced
            // motion — which skip straight to `rest(true)` above and never
            // add it — render the plain, already-settled headline rather
            // than a permanent ghost. A transition, not a keyframe
            // animation (css/sepia-register.css carries no `@keyframes`
            // for it, so it has no TIMINGS row).
            state.pending++;
            el.classList.add(STATE.settling);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.settling);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {TransitionEvent} */ (e).propertyName !== 'filter' || e.target !== el) return;
                el.removeEventListener('transitionend', onEnd);
                finish();
            };
            el.addEventListener('transitionend', onEnd);
            // One frame at the ghost values, painted with `settling` on,
            // before the class comes off and the transition it guards
            // carries the properties back to their plain, settled values
            // over the next 1050ms — the demo's own requestAnimationFrame,
            // not a synchronous removal a browser could coalesce into the
            // first paint and skip the transition for.
            const off = () => el.classList.remove(STATE.settling);
            if (view) view.requestAnimationFrame(off);
            else off();
            later(finish, 1050 + 50);
            return;
        }
        if (routine === 'calibrate') {
            // The solstice headline [S49, A1]: the text is whole and solid
            // under a mix-blend-mode overlay the register paints; the class
            // runs the overlay's one wipe, then the element rests. Without
            // an animation the class comes off by the table's duration.
            state.pending++;
            el.classList.add(STATE.calibrating);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.calibrating);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-cal-slide') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-cal-slide'].durationMs + 50);
            return;
        }
        if (routine === 'wipe') {
            // The mono headline [S48, LIFT_PLAN row 6]: the text stays whole,
            // never split into words or glyphs; the register sweeps a
            // hard-edge mask across it once, left to right — rauno.me's
            // verticalFade, adapted from opacity to mask-position so nothing
            // ever flashes. The class arms the register's own animation;
            // without one the class comes off by the table's duration.
            state.pending++;
            el.classList.add(STATE.revealed);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.revealed);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-wipe') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-wipe'].durationMs + 50);
            return;
        }
        if (routine === 'gild') {
            // The lapis headline [S48, LIFT_PLAN row 6]: the text is whole
            // and already gold; the class runs one clip-path wipe left to
            // right (the register's `kp-burnish` keyframe), then the
            // element rests. Without an animation the class comes off by
            // the table's duration — same shape as `dissolve`, a different
            // keyframe, because the demo's mechanism is neither a dither
            // nor a per-glyph type [S49].
            state.pending++;
            el.classList.add(STATE.gilding);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.gilding);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-burnish') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-burnish'].durationMs + 50);
            return;
        }
        if (routine === 'sharpen') {
            // The grotesk headline [S49, LIFT_PLAN row 12]: the text is whole
            // under a blur+brightness the register paints; the class runs the
            // one-shot optical resolve, then the element rests. Without an
            // animation the class comes off by the table's duration. Its own
            // routine name and keyframe, distinct from the `focus` word-
            // stagger group and `kp-focus` shade-dark already owns.
            state.pending++;
            el.classList.add(STATE.sharpening);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.sharpening);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-sharpen-in') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-sharpen-in'].durationMs + 50);
            return;
        }

        if (routine === 'clip') {
            // The light headline [S48, LIFT_PLAN, A1]: the text is whole the
            // entire time — no noise, no dither, no per-word stagger — and
            // the register opens a rounded clip window around it once. The
            // class runs the reveal; without an animation the class comes
            // off by the table's duration, same shape as dissolve above.
            state.pending++;
            el.classList.add(STATE.revealing);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.revealing);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-clip-reveal') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-clip-reveal'].durationMs + 50);
            return;
        }

        if (routine === 'overprint') {
            // The pastel headline [S48, LIFT_PLAN row 6]: the text is
            // whole; the register's ::before duplicate (the second-ink
            // layer, already there at its rest offset for a no-script
            // page) springs from a wide mis-registration into that rest
            // position once. The element's own text never changes.
            state.pending++;
            el.classList.add(STATE.registering);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.registering);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-registration') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-registration'].durationMs + 50);
            return;
        }

        if (routine === 'shout' || routine === 'slam' || routine === 'focus' || routine === 'resolve' || routine === 'blur') {
            // A word routine [PH2, BR2, S48 shade-dark and dark]: every word in its own span with its
            // index, the register animates them one after another by
            // `--kp-i`; the element ends as its own text. The keyframe is
            // `kp-<routine>` and its row in TIMINGS says how long one word
            // takes; the stagger is the theme's knob. One routine names its
            // keyframe otherwise: shade-light's `blur` runs `kp-word-in`,
            // the name its own approved demo used [SL2, S49].
            state.pending++;
            const parts = text.split(/(\s+)/);
            let index = 0;
            const nodes = parts.map((part) => {
                if (part === '') return null;
                if (/^\s+$/.test(part)) return doc.createTextNode(part);
                const span = doc.createElement('span');
                span.setAttribute('data-word', '');
                span.setAttribute('aria-hidden', 'true');
                span.style.setProperty('--kp-i', String(index++));
                span.textContent = part;
                return span;
            });
            el.replaceChildren(...nodes.filter((n) => n !== null));
            el.classList.add(STATE.words);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.words);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const keyframe = routine === 'blur' ? 'kp-word-in' : `kp-${routine}`;
            later(finish, TIMINGS[keyframe].durationMs + index * cfg.wordStagger + 50);
            return;
        }
        if (routine === 'dissolve') {
            // The retro headline [RT2]: the text is whole under a dither the
            // register paints; the class runs the dither's clearing, then the
            // element rests. Without an animation the class comes off by the
            // table's duration.
            state.pending++;
            el.classList.add(STATE.dissolving);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.dissolving);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const onEnd = (/** @type {Event} */ e) => {
                if (/** @type {AnimationEvent} */ (e).animationName !== 'kp-dither-clear') return;
                el.removeEventListener('animationend', onEnd);
                finish();
            };
            el.addEventListener('animationend', onEnd);
            later(finish, TIMINGS['kp-dither-clear'].durationMs + 50);
            return;
        }
        if (routine === 'type') {
            // The terminal headline [TM2]: typed one glyph at a time at the
            // decipher rate, a block caret riding the last one; the caret
            // leaves with the last glyph and the element rests as its text.
            state.pending++;
            const chars = [...text];
            const caret = doc.createElement('span');
            caret.setAttribute('data-caret', '');
            caret.setAttribute('aria-hidden', 'true');
            el.classList.add(STATE.typing);
            el.textContent = '';
            el.append(caret);
            let typed = 0;
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                el.classList.remove(STATE.typing);
                rest(false);
                state.pending--;
                done();
            };
            finishers.push(finish);
            const perChar = 1000 / Math.max(1, cfg.cps);
            const step = () => {
                if (ended) return;
                typed++;
                el.textContent = chars.slice(0, typed).join('');
                if (typed < chars.length) {
                    el.append(caret);
                    later(step, perChar);
                } else finish();
            };
            later(step, cfg.lead);
            return;
        }
        state.pending++;
        const chars = [...text];
        const spans = chars.map((ch) => {
            const span = doc.createElement('span');
            span.setAttribute('data-glyph', '');
            span.setAttribute('aria-hidden', 'true');
            if (/\s/.test(ch)) span.textContent = ch;
            else {
                span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
                span.classList.add(STATE.noise);
            }
            return span;
        });
        el.replaceChildren(...spans);
        const perChar = 1000 / Math.max(1, cfg.cps);
        let start = 0;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            rest(false);
            el.classList.add(STATE.glitching);
            const off = () => el.classList.remove(STATE.glitching);
            el.addEventListener('animationend', off, { once: true });
            // No animation (a quiet register, or reduced motion switched on
            // mid-run): the class comes off on its own.
            later(off, TIMINGS['kp-slice-1'].durationMs + 50);
            state.pending--;
            done();
        };
        finishers.push(finish);
        /** @param {number} now */
        const tick = (now) => {
            frames.delete(id);
            if (state.detached || finished) return;
            if (start === 0) start = now;
            const t = now - start;
            let all = true;
            spans.forEach((span, i) => {
                const ch = chars[i] ?? '';
                if (/\s/.test(ch)) return;
                if (t > cfg.lead + i * perChar) {
                    if (span.classList.contains(STATE.noise)) {
                        span.textContent = ch;
                        span.classList.remove(STATE.noise);
                    }
                } else {
                    all = false;
                    if (Math.random() < cfg.swap) span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
                }
            });
            if (all) finish();
            else id = schedule();
        };
        let id = 0;
        const schedule = () => {
            const next = view ? view.requestAnimationFrame(tick) : 0;
            frames.add(next);
            return next;
        };
        id = schedule();
    };
    return { headline };
}
