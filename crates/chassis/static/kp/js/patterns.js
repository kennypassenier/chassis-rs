// The small patterns, framework-free [TH50, TH51, TH53].
//
// None of these is a component in the usual sense. They are the things
// every application rewrites badly, and they are here for the same reason
// the data-showing classes are: the fifth reimplementation of "copy this
// value" is not better than the first, it is just differently wrong.
//
//   TH53  a value with a copy button that confirms
//   TH51  a row action that happens optimistically, with an undo
//   TH50  an empty state that knows the difference between "nothing yet"
//         and "nothing matched your filter"
//   kpadopt4  a secret field: a masked value shown on request for a few
//         seconds, then hidden again, and copied without being shown
//
// TH52 (status parts) and TH54 (diff) are markup and CSS only — there is
// no behaviour to attach, so they live in the stylesheet and in the React
// components, and nothing here needs to know about them.
//
// Since 3.0.0 [KT6]: the commit and undo events carry a detail — which
// row, which button, its key, and a restore() for a delete the server
// refused; the copy button dispatches its own events and reads its
// revert delay from an attribute; detach cancels every pending timer,
// restores every row still in flight and removes its toasts.

export {
    SECRET,
    SECRET_TTL,
    SECRET_MASK,
    SECRET_CLIPBOARD_EVENT,
    SECRET_EVENT,
    SECRET_REQUEST_EVENT,
    UNDO_MS,
    COPIED_MS,
    COMMIT_EVENT,
    UNDO_EVENT,
    CLEAR_AFTER_MS,
    COPY_EVENT,
    COPY_FAILED_EVENT,
} from './patterns/constants.js';
export { attachPatterns } from './patterns/copy.js';
export { revealSecret, hideSecret, secretInputValue, setSecretInputValue } from './patterns/secret-api.js';
export { attachSecrets } from './patterns/secrets.js';

/** @typedef {import('./patterns/types.js').ActionDetail} ActionDetail */
/** @typedef {import('./patterns/types.js').SecretLoad} SecretLoad */
/** @typedef {import('./patterns/types.js').SecretState} SecretState */
