// The selector, event names, kinds, glyphs, fixed numbers and the types of the passkey list.

/** A passkey list the page fills with setPasskeys(). */
export const PASSKEYS = '[data-kp-passkeys]';
/** Fired on the root when Register (the empty list's button) is pressed. */
export const PASSKEYS_REGISTER_EVENT = 'kp-passkeys-register';
/** Fired on the root when the Retry of a failed list is pressed. */
export const PASSKEYS_RETRY_EVENT = 'kp-passkeys-retry';
/** Fired on the root, cancelable, when a removal was confirmed and the page gave no `remove`: `{ key, row }`. */
export const PASSKEYS_REMOVE_EVENT = 'kp-passkeys-remove';
/** Fired on the root, cancelable, when a new name was saved and the page gave no `rename`: `{ key, row, label }`. */
export const PASSKEYS_RENAME_EVENT = 'kp-passkeys-rename';
/** The kinds of way in, each with its glyph. */
export const PASSKEY_KINDS = Object.freeze(['passkey', 'magic-link', 'password', 'token']);

/** Milliseconds in a day, for the "unused for N days" flag. */
export const DAY_MS = 86_400_000;
/** Days without use after which a way is flagged as a candidate to remove (the page may change it, 0 turns it off). */
export const DEFAULT_NEVER_USED_DAYS = 90;
/** How many waiting rows a first loading state draws when no list was shown yet. */
export const DEFAULT_WAIT_ROWS = 3;
/** The glyph's view box: 20 by 20, drawn with the text colour. */
export const GLYPH_BOX = '0 0 20 20';
/** The SVG namespace. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** The glyphs: 20 by 20, drawn with the text colour. @type {Record<PasskeyKind, string>} */
export const GLYPHS = {
    passkey: 'M13 3a4 4 0 1 1-2.4 7.2L9 11.8V14H7v2H5v-2.6l5.4-5.4A4 4 0 0 1 13 3Zm1 2.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z',
    'magic-link': 'M3 5h14v10H3V5Zm1.6 1.6v.35L10 10.6l5.4-3.65V6.6H4.6Zm10.8 2.3L10 12.5 4.6 8.9v4.5h10.8V8.9Z',
    password: 'M4 8h12v6H4V8Zm1.6 1.6v2.8h8.8V9.6H5.6ZM6 10.5h1.6v1H6v-1Zm2.8 0h1.6v1H8.8v-1Zm2.8 0h1.6v1h-1.6v-1ZM7 5a3 3 0 0 1 6 0v1.4h-1.6V5a1.4 1.4 0 0 0-2.8 0v1.4H7V5Z',
    token: 'M10 3l6 2.6v4.3c0 3.3-2.4 5.8-6 7.1-3.6-1.3-6-3.8-6-7.1V5.6L10 3Zm0 1.7L5.6 6.6v3.3c0 2.3 1.6 4.2 4.4 5.4 2.8-1.2 4.4-3.1 4.4-5.4V6.6L10 4.7Zm-.8 7.3-2-2 1.1-1.1.9.9 2.4-2.4 1.1 1.1L9.2 12Z',
};

/**
 * @typedef {'passkey' | 'magic-link' | 'password' | 'token'} PasskeyKind
 * @typedef {object} PasskeyRow
 * @property {string} key
 * @property {string} label
 * @property {PasskeyKind} [kind] default `passkey`
 * @property {number} [createdAt] ms
 * @property {number | null} [lastUsedAt] ms; null or missing: never used
 * @property {boolean} [current] the way this session signed in with
 * @typedef {object} PasskeysSpec
 * @property {PasskeyRow[]} [rows]
 * @property {'ready' | 'loading' | 'empty' | 'error'} [state]
 * @property {string} [message] the sentence of a failed list
 * @property {boolean} [retry] false leaves Retry out of a failed list
 * @property {string} [emptyTitle]
 * @property {string} [emptyText]
 * @property {boolean} [register] false leaves the Register button out of the empty list
 * @property {boolean} [insecure] the page is not served over https: a warning with what to do next
 * @property {'refuse' | 'confirm' | 'off'} [protectLast]
 * @property {'dialog' | 'type-name'} [confirm]
 * @property {'button' | 'note'} [refuseLook]
 * @property {boolean} [markCurrent]
 * @property {number} [neverUsedAfter] days
 * @property {() => number} [now] the clock (a test gives its own)
 * @property {(row: PasskeyRow) => Promise<unknown> | unknown} [remove] reject with an Error to refuse; its message is shown
 * @property {(row: PasskeyRow, label: string) => Promise<unknown> | unknown} [rename]
 * @property {number} [loadingRows] how many waiting rows (default: the rows shown last, else 3)
 * @property {string} [loadingWords] what the busy card says
 */
