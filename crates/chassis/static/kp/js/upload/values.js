// The selectors, the events and the defaults of the file drop and upload.

/** An upload and its three parts. */
export const UPLOAD = '[data-kp-upload]';
export const UPLOAD_INPUT = '[data-kp-upload-input]';
export const UPLOAD_ZONE = '[data-kp-upload-zone]';
export const UPLOAD_LIST = '[data-kp-upload-list]';

/** Fired for each accepted file. A contract value [TH26]: the detail carries the File and its row. */
export const FILE_EVENT = 'kp-upload-file';
/** Fired for a file the zone refused: `{ file, reason, item }`. */
export const REJECT_EVENT = 'kp-upload-reject';
/** Fired on the row before it is removed, cancelable: `{ file, item }`. */
export const REMOVE_EVENT = 'kp-upload-remove';

/** The look of a row's remove button when the page names none. */
export const REMOVE_CLASS = 'kp-button kp-button--ghost';
/** What a row's remove button shows when the page names no words. */
export const REMOVE_GLYPH = '×';
/** A progress bar's end, in percent. */
export const PERCENT = 100;
