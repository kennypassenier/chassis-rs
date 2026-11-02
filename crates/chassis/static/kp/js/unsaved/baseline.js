// The saved values the bar compares with: a map from control to value, and for a tracked control the value in its own
// `data-kp-track-default`, so a control that is attached after the bar still gives its first value [forms-1102].

import { TRACK_DEFAULT, TRACK_DEFAULT_TEXT, TRACK_TEXT, isTracked, readTrackValue } from '../track-value.js';

/** The baseline of one bar. A plain field keeps its value in the map; a tracked control in its attribute (and the map). */
export class Baseline extends Map {
    /** @param {HTMLElement} c @returns {string | undefined} */
    get(c) {
        if (isTracked(c) && c.hasAttribute(TRACK_DEFAULT)) return c.getAttribute(TRACK_DEFAULT) ?? '';
        return super.get(c);
    }

    /**
     * Keep a control's saved value. A tracked control that says nothing yet (its own script has not run) has no saved value to
     * write: the map holds the empty value until the control writes its first one.
     * @param {HTMLElement} c @param {string} value
     */
    set(c, value) {
        if (isTracked(c) && (c.hasAttribute(TRACK_DEFAULT) || readTrackValue(c) !== '')) {
            // The words go with the value they were written for (after a save, the words the control shows now).
            if (c.getAttribute(TRACK_DEFAULT) !== value) c.toggleAttribute(TRACK_DEFAULT_TEXT, false);
            c.setAttribute(TRACK_DEFAULT, value);
            if (readTrackValue(c) === value && c.hasAttribute(TRACK_TEXT)) c.setAttribute(TRACK_DEFAULT_TEXT, c.getAttribute(TRACK_TEXT) ?? '');
        }
        return super.set(c, value);
    }
}
