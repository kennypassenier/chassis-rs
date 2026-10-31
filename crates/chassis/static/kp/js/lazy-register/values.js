// The names a lazily loaded register is marked and announced with, and where it is served from by default.

/** The attribute a register link carries, with the theme it serves as its value. A contract value. */
export const REGISTER_ATTRIBUTE = 'data-kp-register';
/** Where a register is served from by default; `{theme}` is replaced by the name. */
export const REGISTER_PATTERN = '/css/{theme}-register.css';
/** Dispatched on the root, bubbling, when a register has loaded: `{ theme, href }`. */
export const REGISTER_LOAD_EVENT = 'kp-register-load';
/** Dispatched on the root, bubbling, when a register failed to load: `{ theme, href }`. The theme stays what it was. */
export const REGISTER_ERROR_EVENT = 'kp-register-error';
