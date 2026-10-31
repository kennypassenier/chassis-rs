// The functions a page calls to reveal, hide and read a secret.

/** @type {WeakMap<Element, { reveal: (reason?: string) => void, hide: (reason?: string) => void }>} */
export const secrets = new WeakMap();

/**
 * Show a secret field's value, as Reveal does; no-op on a disabled field.
 * @param {Element} field
 */
export function revealSecret(field) {
    secrets.get(field)?.reveal('call');
}

/**
 * Hide a secret field's value again and take it out of the page.
 * @param {Element} field
 */
export function hideSecret(field) {
    secrets.get(field)?.hide('call');
}

// ── The secret INPUT [wish-1028, chassis-rs 1] ───────────────────────────
//
// The same `.kp-secret` field, typed into instead of read: a token or a password a person enters, with its typing hidden. Built from
// the package's own parts (`.kp-field__input`, `.kp-button`, `.kp-copyable__button`, the line and drain of the display field):
//
//   <div class="kp-secret" data-kp-secret data-kp-secret-mode="input" data-kp-secret-label="API token" data-kp-secret-name="token"></div>
//
//   data-kp-secret-mode="input"    the input mode (read when the field attaches); without it the field only displays a value
//   data-kp-secret-name="token"    the input's name (and its form field)
//   data-kp-secret-placeholder     placeholder words
//   data-kp-secret-autocomplete    default `off`; `new-password` or `current-password` lets a password manager in
//   data-kp-secret-ttl="30"        how long a shown (unhidden) value stays: a number of seconds or a number with ms, s, min or h
//                                  (every unit of time); 0: until Hide is pressed. Default 30 s. Read again when it changes
//   data-kp-secret-hide-on-blur    default on: leaving the field (or the tab) hides the value; `false` keeps it shown
//   data-kp-secret-paste="false"   no Paste button (Paste reads the clipboard; where that is refused the line says to press Ctrl+V)
//   data-kp-secret-copy="false"    no Copy button; the Copy empties the clipboard again after `data-kp-secret-clear` like the display field
//   data-kp-secret-invalid="why"   the input is marked invalid and the line under it says why (read again when it changes)
//   data-kp-secret-disabled="why"  the input and the buttons are off and the line says why
//
// The value is `secretInputValue(field)` and the input's own `input` and `change` events; it is never in a custom event. Show and Hide
// fire `kp-secret` (`{ shown, reason }`) as the display field does. The state is `data-kp-secret-state`: hidden, shown, error, disabled.
// The line under the box always keeps its height: it says "Typing is hidden", the number of characters, the countdown, or the reason.

/** @type {WeakMap<Element, HTMLInputElement>} */
export const secretInputs = new WeakMap();

/**
 * What has been typed into a secret input field (empty for a field that is not one).
 * @param {Element} field
 */
export function secretInputValue(field) {
    return secretInputs.get(field)?.value ?? '';
}

/**
 * Put a value into a secret input field, or empty it with an empty string; the field hides it again.
 * @param {Element} field @param {string} value
 */
export function setSecretInputValue(field, value) {
    const input = secretInputs.get(field);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
