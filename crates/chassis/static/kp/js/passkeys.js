// The list of ways to sign in: passkeys, magic links, passwords and tokens
// [kpadopt5-people; chassis-rs `passkeys.html` + `passkeys.js`, JobTracker
// `pages/Account.jsx` rows].
//
//   <div class="kp-passkeys" data-kp-passkeys></div>
//
//   setPasskeys(el, {
//       rows: [{ key: 'pk1', label: 'Work laptop', kind: 'passkey', createdAt: 1760000000000,
//                lastUsedAt: 1760900000000, current: true }],
//       remove: async (row) => { await fetch(`/passkeys/${row.key}`, { method: 'DELETE' }); },
//       rename: async (row, label) => { … },
//   });
//
// One row per way in: the way's icon (four glyphs, one set), its name, when it
// was added and, in words, when it was last used (the exact moment in the
// tooltip, dd/mm/yyyy HH:mm in Europe/Brussels), a "This device" badge on the
// one in use, and Rename and Remove in two fixed columns so the buttons line up
// from row to row. The list is sorted with the one in use on top, then by last
// use.
//
// Options (each a JS option of setPasskeys() and an attribute of the root; the
// option wins):
//   protectLast   `data-kp-protect-last`   `refuse` (default) | `confirm` | `off`:
//                 removing the last way in locks the owner out. `refuse` keeps
//                 Remove pressed-in with the reason beside it ("Your only way
//                 to sign in. Add another way first."); `confirm` lets it
//                 through behind a typed name and a warning; `off` treats it as
//                 any other [Kenny, 2026-10-17: "Weigeren"];
//   confirm       `data-kp-confirm`        `dialog` (default) | `type-name`: how a
//                 removal is confirmed. The one in use, and the last way in under
//                 `confirm`, always need the exact name typed;
//   refuseLook    `data-kp-refuse-look`  how the refusal reads: `button` (default,
//                 Remove stays on the row, held off, with the reason under the name) or
//                 `note` (the button gives way to the reason in its place);
//   markCurrent   `data-kp-mark-current`   on by default, `off` leaves the badge out;
//   neverUsedAfter `data-kp-never-used-after` days (default 90): a way not used for
//                 that long is flagged as a candidate to remove (0 = never flag).
//
// Removing asks `remove(row)`; when it rejects, its message is the server's why
// and is shown on the row ("Not removed: …") and the row stays; when it resolves,
// the row leaves the list at once. Without `remove` the component fires
// `kp-passkeys-remove` (cancelable: preventDefault means the page does the
// removal itself and calls setPasskeys() again). The same for `rename` and
// `kp-passkeys-rename`.
//
// States: `loading` keeps the rows' geometry as waiting rows under the busy card
// (js/busy-card.js); `empty` ("No passkey registered yet" and a Register button,
// `kp-passkeys-register`) and `error` (what failed and a Retry,
// `kp-passkeys-retry`) are the package's empty state filling the list's whole
// footprint, centred; `insecure: true` puts a warning with what to do next above
// the list (passkeys need https). Every word is in js/strings.js.
//
// The module is a facade: a list is a `PasskeysController` (closure-pattern B, js/controller.js) in `js/passkeys/`, one file per concern.

export {
    PASSKEYS,
    PASSKEYS_REGISTER_EVENT,
    PASSKEYS_RETRY_EVENT,
    PASSKEYS_REMOVE_EVENT,
    PASSKEYS_RENAME_EVENT,
    PASSKEY_KINDS,
} from './passkeys/constants.js';
export { passkeyOptions, sortPasskeys, unusedDays } from './passkeys/options.js';
export { setPasskeys, attachPasskeys } from './passkeys/api.js';

/** @typedef {import('./passkeys/constants.js').PasskeyKind} PasskeyKind */
/** @typedef {import('./passkeys/constants.js').PasskeyRow} PasskeyRow */
/** @typedef {import('./passkeys/constants.js').PasskeysSpec} PasskeysSpec */
