// The keys of a focus-steps view, read from options and attributes [keys3-1104].
import { matchesKeySpec, resolveEngineKeys, resolveKeySpec } from '../key-spec.js';
import {
    FOCUS_STEPS_NEXT_KEY,
    FOCUS_STEPS_NEXT_KEY_ATTRIBUTE,
    FOCUS_STEPS_PREVIOUS_KEY,
    FOCUS_STEPS_PREVIOUS_KEY_ATTRIBUTE,
    FOCUS_STEPS_SAME_USUAL_KEY,
    FOCUS_STEPS_SAME_USUAL_KEY_ATTRIBUTE,
    FOCUS_STEPS_SAME_YESTERDAY_KEY,
    FOCUS_STEPS_SAME_YESTERDAY_KEY_ATTRIBUTE,
    FOCUS_STEPS_SKIP_KEY,
    FOCUS_STEPS_SKIP_KEY_ATTRIBUTE,
    FOCUS_STEPS_TRACK_NEXT_KEY,
    FOCUS_STEPS_TRACK_NEXT_KEY_ATTRIBUTE,
    FOCUS_STEPS_TRACK_PREVIOUS_KEY,
    FOCUS_STEPS_TRACK_PREVIOUS_KEY_ATTRIBUTE,
} from './constants.js';

/** The JS option (camel case) that overrides each attribute. */
const OPTION = {
    [FOCUS_STEPS_NEXT_KEY_ATTRIBUTE]: 'nextKey',
    [FOCUS_STEPS_PREVIOUS_KEY_ATTRIBUTE]: 'previousKey',
    [FOCUS_STEPS_SAME_YESTERDAY_KEY_ATTRIBUTE]: 'sameYesterdayKey',
    [FOCUS_STEPS_SAME_USUAL_KEY_ATTRIBUTE]: 'sameUsualKey',
    [FOCUS_STEPS_SKIP_KEY_ATTRIBUTE]: 'skipKey',
    [FOCUS_STEPS_TRACK_NEXT_KEY_ATTRIBUTE]: 'trackNextKey',
    [FOCUS_STEPS_TRACK_PREVIOUS_KEY_ATTRIBUTE]: 'trackPreviousKey',
};

/** @param {Record<string, unknown>} options @param {string} attribute @returns {string | false | undefined} */
const optionOf = (options, attribute) => /** @type {string | false | undefined} */ (options[/** @type {Record<string, string>} */ (OPTION)[attribute]]);

/** The keys for the shortcut engine behind an attribute. @param {Element} root @param {Record<string, unknown>} options @param {string} attribute @param {string} fallback */
export const engineKeysOf = (root, options, attribute, fallback) => resolveEngineKeys(root, attribute, optionOf(options, attribute), fallback);

/** The keys of the flow, as the engine's `inFields`-less listener reads them. @param {Element} root @param {Record<string, unknown>} options */
export function flowKeys(root, options) {
    return {
        next: resolveKeySpec(root, FOCUS_STEPS_NEXT_KEY_ATTRIBUTE, optionOf(options, FOCUS_STEPS_NEXT_KEY_ATTRIBUTE), FOCUS_STEPS_NEXT_KEY),
        previous: resolveKeySpec(root, FOCUS_STEPS_PREVIOUS_KEY_ATTRIBUTE, optionOf(options, FOCUS_STEPS_PREVIOUS_KEY_ATTRIBUTE), FOCUS_STEPS_PREVIOUS_KEY),
    };
}

/** Whether a key goes in the direction asked; right to left the two arrows trade places. @param {KeyboardEvent} event @param {import('../key-spec.js').KeySpec} spec @param {boolean} rtl */
export function pressesFlow(event, spec, rtl) {
    const mirror = rtl ? { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' }[event.key] : undefined;
    if (!mirror) return matchesKeySpec(event, spec);
    return matchesKeySpec(new KeyboardEvent('keydown', { key: mirror, shiftKey: event.shiftKey }), spec);
}

export const KEY_DEFAULTS = {
    sameYesterday: [FOCUS_STEPS_SAME_YESTERDAY_KEY_ATTRIBUTE, FOCUS_STEPS_SAME_YESTERDAY_KEY],
    sameUsual: [FOCUS_STEPS_SAME_USUAL_KEY_ATTRIBUTE, FOCUS_STEPS_SAME_USUAL_KEY],
    skip: [FOCUS_STEPS_SKIP_KEY_ATTRIBUTE, FOCUS_STEPS_SKIP_KEY],
    trackNext: [FOCUS_STEPS_TRACK_NEXT_KEY_ATTRIBUTE, FOCUS_STEPS_TRACK_NEXT_KEY],
    trackPrevious: [FOCUS_STEPS_TRACK_PREVIOUS_KEY_ATTRIBUTE, FOCUS_STEPS_TRACK_PREVIOUS_KEY],
};
