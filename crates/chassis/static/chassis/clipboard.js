// Copying text to the clipboard, with the execCommand fallback for insecure
// contexts.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

// Where a scratch field has to live to be selectable. A modal <dialog> puts
// itself in the top layer and makes EVERYTHING outside it inert, so a field
// appended to <body> while one is open can never be focused (feat-clients-4
// moved these buttons into exactly such a dialog).
function topLayerHost() {
  try {
    const modal = document.querySelector('dialog:modal');
    if (modal) return modal;
  } catch (_) {
    // :modal is recent; an engine that does not know it falls through.
  }
  return document.body;
}

// Copy without the clipboard API, for the plain-http case where that API does
// not exist. Two things this has to get right, both measured on CT 118 with
// inbox 0.1.8 on 2026-09-10:
//
//   1. The field goes in the top layer when a modal dialog is open. With it
//      on <body>, `document.activeElement` stayed BODY and the selection was
//      empty — the field was inert.
//   2. `execCommand('copy')` returned TRUE anyway, with nothing selected. Its
//      return value is therefore not a verdict (standing rule 34: an
//      always-true term in a verdict is a defect), so the selection is
//      checked and that is what decides.
//
// Together those produced a button that flashed "Copied" over an untouched
// clipboard, which is worse than a button that reports failure.
function copyLegacy(text) {
  const host = topLayerHost();
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.left = '-9999px';
  host.appendChild(scratch);
  scratch.focus();
  scratch.select();
  const selected = scratch.selectionEnd - scratch.selectionStart === text.length;
  let copied = false;
  if (selected) {
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
  }
  host.removeChild(scratch);
  return copied && selected;
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => copyLegacy(text));
  }
  return Promise.resolve(copyLegacy(text));
}
