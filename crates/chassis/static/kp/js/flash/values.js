// The selector, the events and the times of the flash button.

/** A button this module drives. */
export const FLASH_BUTTON = '[data-kp-flash-button], [data-kp-post]';
/** Fired on the button, bubbling, at every change of state: `{ state, ok?, word?, line? }`, state `busy` | `success` | `refused` | `rest`. */
export const FLASH_EVENT = 'kp-flash';
/** Fired on the button when `data-kp-reload="region"` wants its region read again: `{ target }`. */
export const FLASH_RELOAD_EVENT = 'kp-flash-reload';
/** How long a success word stays, in ms (chassis' value). */
export const FLASH_MS = 1500;
/** How long a refusal's word stays, in ms: a refusal needs longer to read. */
export const FLASH_ERROR_MS = 3000;
/** The pause before the status is spoken, so the change is heard after the button settled [ms]. */
export const SAY_DELAY_MS = 30;
/** The pause before a page reload that follows a press [ms]. */
export const RELOAD_DELAY_MS = 600;
