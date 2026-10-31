// The numbers, names and key lists of the shortcut engine.

/** The chord's wait for its second key, in ms (homelab's tested value). */
export const CHORD_MS = 1500;
/** How long the "no shortcut on g x" line stays, in ms. */
export const UNKNOWN_MS = 1500;
/** A sheet that is filled from the registry. */
export const SHORTCUTS_LIVE_SHEET = '[data-kp-shortcuts][data-kp-shortcuts-live]';
/** Fired on the document, bubbling, when a registered shortcut ran: `{ keys, what }`. */
export const SHORTCUT_EVENT = 'kp-shortcut-run';
/** Fired on the document when a chord starts or stops waiting for its next key: `{ keys, waiting, ms }`. */
export const SHORTCUT_PENDING_EVENT = 'kp-shortcut-pending';
/** Where the chord's cap stands: the middle of the screen (default) or the middle of its foot. */
export const SHORTCUT_HINT_PLACES = /** @type {const} */ (['centre', 'bottom-centre']);

/** Keys that need AltGr on an AZERTY keyboard. */
export const ALTGR_KEYS = Object.freeze(['[', ']', '{', '}', '@', '#', '\\', '|', '~', '€', '`', '^']);

/** The keys the palette and the sheet own. */
export const RESERVED = ['mod+k', '?'];

/** The engine's defaults, before a page configures them. */
export const DEFAULT_TYPING_SELECTOR = 'input, textarea, select, [role="textbox"]';
