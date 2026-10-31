// The sounds a finished timer makes and the ring that stops them.
import { timerState } from './state.js';
/** @typedef {import('./types.js').Timer} Timer */

/** The sounds a list may choose. @type {readonly ['chime', 'bell', 'buzzer']} */
export const TIMER_SOUNDS = ['chime', 'bell', 'buzzer'];

/** The page's one audio context, or null where there is none or no press has woken it yet. @returns {AudioContext | null} */
function context() {
    const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
    if (!Context) return null;
    // No press has woken the sound yet (a timer the page started or restored on its own): a context made now is
    // refused by the browser, with a warning in the console, so wait for one.
    if (timerState.audio === null && /** @type {any} */ (navigator).userActivation?.isActive === false) return null;
    timerState.audio ??= new Context();
    const ctx = /** @type {AudioContext} */ (timerState.audio);
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

/**
 * One note: partials with a quick attack and an exponential decay.
 * @param {AudioContext} ctx @param {AudioNode} out @param {number} at @param {number} hz
 * @param {{ type?: OscillatorType, peak: number, attack: number, decay: number }} shape
 */
function note(ctx, out, at, hz, { type = 'sine', peak, attack, decay }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
}

/** @param {AudioContext} ctx @param {number} cutoff @returns {BiquadFilterNode} a low-pass into the speakers, so nothing is shrill */
function soften(ctx, cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.connect(ctx.destination);
    return filter;
}

/**
 * The sounds, each given the context and its start; each returns how long it lasts [s].
 * @type {Record<string, (ctx: AudioContext, at: number) => number>}
 */
const SOUNDS = {
    // A soft two-note chime.
    chime(ctx, at) {
        [659.25, 880].forEach((hz, i) => note(ctx, ctx.destination, at + i * 0.32, hz, { peak: 0.16, attack: 0.03, decay: 0.9 }));
        return 1.25;
    },
    // A wind-up kitchen timer: a hammer striking two bells in turn, twice, ten strikes each, with the bell metal's
    // inharmonic overtones; softened above 4.5 kHz so it is loud without being shrill.
    bell(ctx, at) {
        const out = soften(ctx, 4500);
        for (let burst = 0; burst < 2; burst += 1)
            for (let hit = 0; hit < 10; hit += 1) {
                const start = at + burst * 0.95 + hit * 0.075;
                const base = hit % 2 === 0 ? 1180 : 1330;
                [
                    [1, 0.11],
                    [2.4, 0.06],
                    [4.1, 0.03],
                ].forEach(([ratio, peak]) => note(ctx, out, start, base * ratio, { peak, attack: 0.002, decay: 0.26 }));
            }
        return 1.9;
    },
    // An electronic beeper: four short, slightly detuned saw beeps, twice. Harsh on purpose, softened above 3 kHz.
    buzzer(ctx, at) {
        const out = soften(ctx, 3000);
        for (let group = 0; group < 2; group += 1)
            for (let beep = 0; beep < 4; beep += 1) {
                const start = at + group * 1.3 + beep * 0.26;
                for (const hz of [740, 749]) note(ctx, out, start, hz, { type: 'sawtooth', peak: 0.1, attack: 0.008, decay: 0.17 });
            }
        return 2.2;
    },
};

/**
 * Play one of the sounds, once. Call it from a press (a preview) or let a timer's end call it.
 * @param {string} [sound]  'chime' (default), 'bell' or 'buzzer'; anything else is the chime, 'off' is silence
 * @returns {number} how long it lasts in seconds (0 where nothing played)
 */
export function playTimerSound(sound = 'chime') {
    if (sound === 'off') return 0;
    try {
        const ctx = context();
        if (!ctx) return 0;
        return (SOUNDS[sound] ?? SOUNDS.chime)(ctx, ctx.currentTime + 0.02);
    } catch {
        // No sound where the page may not make one; the card and the alert still say it.
        return 0;
    }
}

/**
 * Say a sentence aloud with the browser's voice, in the page's language. Where there is no speech nothing happens.
 * @param {string} text
 * @returns {boolean} whether it was handed to the voice
 */
export function speakTimerMessage(text) {
    try {
        if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined' || !text) return false;
        const utterance = new SpeechSynthesisUtterance(text);
        const lang = document.documentElement.lang;
        if (lang) utterance.lang = lang;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
        return true;
    } catch {
        // A voice that fails to start leaves the card and the sound to say it.
        return false;
    }
}

/** Wake the sound up from a press, so a sound may play later without one. */
export function primeSound() {
    try {
        context();
    } catch {
        // As above.
    }
}

/** @param {Timer} timer */
export function stopRing(timer) {
    if (timer.ring !== null) clearInterval(timer.ring);
    timer.ring = null;
    timer.card.removeAttribute('data-kp-timer-ringing');
    if (timer.state === 'done' && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
