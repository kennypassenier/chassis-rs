// The kit's dashboard behaviours (K12, K13, K14, rule 31). Everything
// else is server-rendered HTML and plain forms. This module is the kit's
// own file, not vendored: the gate does not check it against kp-themes.
//
// It attaches the four @kp-soft/themes behaviours the kit's templates use
// (v3.x modules are pure, so somebody has to call them), then wires the
// kit's own controls:
//
//   [data-reveal="ID"]        fetch the token once, show it for N seconds
//   [data-copy-token="ID"]    fetch and copy ONLY the token (Kenny's ask)
//   [data-copy-command="ID"]  fetch and copy the whole curl line
//   [data-test="ID"]          send the test request, then refresh requests
//   [data-requests="ID"]      toggle the last-requests panel, loading it
//   [data-post]               a POST-and-reload button (re-issue, revoke, delete)
//
// The token is never in the page: every reveal/copy fetches
// /api/clients/ID/token on click, so a "view source" or a cached page holds
// nothing (K12).
//
// Clipboard: navigator.clipboard exists only in a secure context (https, or
// http://localhost). On http://inbox.lan:8080 from another machine the
// execCommand fallback runs; it works only inside a real click, which is
// exactly where these buttons live. (kyu's finding, kept.)

import { attachThemePickers } from './kp/js/theme-picker.js';
import { enforceContracts, attachConfirmations, attachSkipLinks } from './kp/js/components.js';
import { attachEffects } from './kp/js/effects.js';

attachThemePickers();
enforceContracts();
attachConfirmations();
// K15, kp-themes 5.0.0 (R2-b, 2026-09-09): js/effects.js performs what a
// stylesheet cannot — the block cursor inside a focused field for a theme
// that sets `--kp-caret: block` (none of kp-themes 11.0.0's twelve does, since
// terminal left; the hook stays for one that will) (the register paints the cell, the module writes the column), the
// themes' arrivals and reveals. The kit's own pages carry no reveal hooks,
// so on them the module does the caret and the arrival only.
//
// The caret is bound at attach time and only if the theme active at that
// moment answers `--kp-caret: block`; a page loaded in formal and switched
// to a caret theme would keep the browser's caret. Measured 2026-09-09: detach()
// does not forget the fields it bound (a module-level WeakSet), so
// detach-and-reattach cannot rebind them — instead the kit attaches once
// more, the first time a caret theme becomes active after load. Bound
// fields stay bound; whether the cell is painted is the register's call.
// This works because every register is already in dist/kp-themes.css: the
// knob is readable the moment the theme attribute changes (D2).
let effects = attachEffects(document);
let caretAttached = caretTheme();
function caretTheme() {
  return getComputedStyle(document.documentElement).getPropertyValue('--kp-caret').trim() === 'block';
}
document.addEventListener('kp-theme-change', () => {
  if (caretAttached || !caretTheme()) return;
  caretAttached = true;
  effects = attachEffects(document);
});

attachSkipLinks();

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

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => copyLegacy(text));
  }
  return Promise.resolve(copyLegacy(text));
}

// The label a button goes back to after a busy spell or a flash. Saved
// on the button the first time either needs it; the reveal button moves
// it between Reveal and Hide itself.
function restLabel(button) {
  if (button.dataset.label === undefined) button.dataset.label = button.textContent;
  return button.dataset.label;
}

// Show a message on the button for a moment, then its rest label. Safe to
// call from inside `busy`: the flash outlives the busy spell (K29, found
// while wiring project actions — a remedy flashed during `busy` was
// overwritten the same tick by busy's own restore, so no [data-post]
// refusal was ever visible, and the button then came back wearing its
// busy label).
function flash(button, message, ms = 1500) {
  restLabel(button);
  pinWidth(button);
  button.textContent = message;
  window.clearTimeout(button.flashTimer);
  button.flashTimer = window.setTimeout(() => {
    button.flashTimer = 0;
    button.textContent = button.dataset.label;
    unpinWidth(button);
  }, ms);
}

// rule 31: busy while a request is in flight; disabled so a second click
// cannot become a second action.
// feat-clients-5: a control that reports it is working may not move the
// layout around it (Kenny, looking at a live dashboard on 2026-09-10:
// clicking `Send test` made Revoke and Delete jump from stacked to side by
// side). The cause is width, not the label: these buttons sit in a wrapping
// flex row inside a table cell, so a busy label narrower than the rest label
// — "Sending…" against "Send test" — lets the row unwrap, and the whole cell
// re-lays out under the reader's cursor. Measuring the button once and
// holding that as a floor keeps every other element where it was.
//
// What this does NOT hold: a refusal flashed on the button carries a whole
// remedy sentence (K29) and is wider than any rest label, so that case still
// grows the button. Narrowing it would hide the remedy, which is the more
// important of the two; feat-clients-4 removes the problem at the root by
// moving these controls out of the table row and into a modal.
function pinWidth(button) {
  if (button.dataset.restWidth === undefined) {
    button.dataset.restWidth = String(Math.ceil(button.getBoundingClientRect().width));
  }
  button.style.minWidth = `${button.dataset.restWidth}px`;
}

// Only once the button is wearing its rest label again — releasing it while a
// flash is still up would let the row jump a second time.
function unpinWidth(button) {
  button.style.minWidth = '';
  delete button.dataset.restWidth;
}

async function busy(button, work) {
  if (button.getAttribute('aria-busy') === 'true') return;
  restLabel(button);
  pinWidth(button);
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.textContent = button.dataset.busyLabel || 'Working…';
  try {
    await work();
  } finally {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    // A flash raised by `work` stays on screen; the timer restores the label.
    if (!button.flashTimer) {
      button.textContent = button.dataset.label;
      unpinWidth(button);
    }
  }
}

// The one line a refusal becomes on a button: the kit's error and its
// remedy when the body carries them (project routes answer the same shape
// through chassis::Error), the bare status otherwise.
function refusal(res, body) {
  if (body.error && body.remedy) return `${body.error}. ${body.remedy}`;
  return body.remedy || body.error || `HTTP ${res.status}`;
}

async function fetchToken(id) {
  const res = await fetch(`/api/clients/${id}/token`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.remedy ? `${err.error}. ${err.remedy}` : `HTTP ${res.status}`);
  }
  return res.json();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// feat-ui-1: a timestamp on a page is read by a person, so it is rendered in
// the reader's own locale — which only the browser knows. The server puts the
// exact RFC 3339 value in `datetime` and a plain "date time" fallback in the
// text; this replaces that text and keeps the exact value in the tooltip, so
// nothing is lost for whoever does want the machine form. Kenny's case was
// `2026-09-10T02:16:47Z` in a live table column.
//
// A value the browser cannot read is left exactly as the server wrote it: a
// wrong date is worse than an ugly one.
function localiseTimes(root = document) {
  for (const el of root.querySelectorAll('time[datetime]:not([data-localised])')) {
    const when = new Date(el.getAttribute('datetime'));
    if (Number.isNaN(when.getTime())) continue;
    el.textContent = when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    el.title = el.getAttribute('datetime');
    el.dataset.localised = 'true';
  }
}
localiseTimes();

function renderRequests(list) {
  if (!list.length) return '<p class="text-secondary" style="margin:0.5rem 0">No requests captured yet.</p>';
  return list
    .map((c) => {
      const headers = c.headers.map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join('\n');
      const trunc = c.truncated ? ` <span class="kp-badge">truncated, ${c.body_bytes} bytes</span>` : '';
      const source = c.source === 'test' ? ' <span class="kp-badge kp-badge--info">test</span>' : '';
      return `<details class="kp-card" style="margin:0.5rem 0"><summary><time datetime="${escapeHtml(c.at)}">${escapeHtml(c.at)}</time> ${escapeHtml(c.method)} ${escapeHtml(c.path)} → ${c.status}${source}${trunc}</summary><pre class="snippet">${headers}\n\n${escapeHtml(c.body)}</pre></details>`;
    })
    .join('');
}

async function loadRequests(id, panel) {
  const res = await fetch(`/api/clients/${id}/requests`, { headers: { accept: 'application/json' } });
  const list = res.ok ? await res.json() : [];
  panel.innerHTML = renderRequests(list);
  localiseTimes(panel);
}

document.addEventListener('click', (event) => {
  const reveal = event.target.closest('[data-reveal]');
  if (reveal) {
    const id = reveal.dataset.reveal;
    const target = document.getElementById(`token-${id}`);
    if (target.dataset.revealed === 'true') {
      hide(target, reveal);
      return;
    }
    busy(reveal, async () => {
      try {
        const { token } = await fetchToken(id);
        target.textContent = token;
        target.dataset.revealed = 'true';
        reveal.dataset.label = 'Hide';
        const seconds = parseInt(reveal.dataset.revealSeconds, 10) || 10;
        window.clearTimeout(target.revealTimer);
        target.revealTimer = window.setTimeout(() => hide(target, reveal), seconds * 1000);
      } catch (e) {
        flash(reveal, e.message, 3000);
      }
    });
    return;
  }

  const copyToken = event.target.closest('[data-copy-token]');
  const copyCommand = event.target.closest('[data-copy-command]');
  const copier = copyToken || copyCommand;
  if (copier) {
    const id = copyToken ? copyToken.dataset.copyToken : copyCommand.dataset.copyCommand;
    busy(copier, async () => {
      try {
        const data = await fetchToken(id);
        const ok = await copyText(copyToken ? data.token : data.command);
        flash(copier, ok ? 'Copied' : 'Copy failed — use Reveal');
      } catch (e) {
        flash(copier, e.message, 3000);
      }
    });
    return;
  }

  const test = event.target.closest('[data-test]');
  if (test) {
    const id = test.dataset.test;
    busy(test, async () => {
      const res = await fetch(`/api/clients/${id}/test`, { method: 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      flash(test, res.ok ? `Sent → ${body.status}` : refusal(res, body), 3000);
      const panel = document.getElementById(`requests-${id}`);
      if (panel && !panel.hidden) await loadRequests(id, panel);
    });
    return;
  }

  // feat-clients-4: the row carries one button; everything else is in the
  // dialog it opens. The requests load on open rather than behind a second
  // click — the panel is already on screen there, so a toggle would only be a
  // control that hides what the reader just asked for.
  const manage = event.target.closest('[data-manage]');
  if (manage) {
    const id = manage.dataset.manage;
    const dialog = document.getElementById(`manage-${id}`);
    if (!dialog) return;
    dialog.showModal();
    const panel = dialog.querySelector(`#requests-${id}`);
    if (panel) busy(manage, () => loadRequests(id, panel));
    return;
  }

  const closeManage = event.target.closest('[data-close-manage]');
  if (closeManage) {
    closeManage.closest('dialog')?.close();
    return;
  }

  const toggle = event.target.closest('[data-requests]');
  if (toggle) {
    const id = toggle.dataset.requests;
    const panel = document.getElementById(`requests-${id}`);
    if (panel.hidden) {
      panel.hidden = false;
      toggle.textContent = 'Hide requests';
      busy(toggle, () => loadRequests(id, panel));
    } else {
      panel.hidden = true;
      toggle.textContent = 'Last requests';
    }
    return;
  }

  const post = event.target.closest('[data-post]');
  // Destructive buttons carry data-kp-confirm; components.js arms them on
  // the first click and lets the second through, which is the click we see.
  // The same path serves the kit's own buttons and a project's row or
  // section actions (K29): the route is whatever data-post says.
  if (post && !post.hasAttribute('data-kp-armed-pending')) {
    busy(post, async () => {
      const res = await fetch(post.dataset.post, { method: post.dataset.method || 'POST', headers: { accept: 'application/json' } });
      if (res.ok) {
        window.location.reload();
      } else {
        const body = await res.json().catch(() => ({}));
        flash(post, refusal(res, body), 5000);
      }
    });
  }
});

function hide(target, toggle) {
  window.clearTimeout(target.revealTimer);
  target.textContent = target.dataset.masked;
  target.dataset.revealed = 'false';
  toggle.dataset.label = 'Reveal';
  toggle.textContent = 'Reveal';
}


// The Issue-token form (clients page): posts JSON, reloads on success, shows
// the kit's remedy on failure. Lives here rather than inline so the page
// carries no inline script (CSP script-src 'self', S8).
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const button = form.querySelector('button[type="submit"]');
  if (form.id === 'issue') {
    event.preventDefault();
    if (!button) return;
    await busy(button, async () => {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // Every named control, so a project's extra fields (K16) ride along.
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (res.ok) { window.location.reload(); return; }
      const body = await res.json().catch(() => ({}));
      alert(body.remedy ? `${body.error}. ${body.remedy}` : `HTTP ${res.status}`);
    });
    return;
  }
  // Any other form (login): a plain POST navigates away; the button still
  // shows its busy label until the page changes (rule 31).
  if (button && button.dataset.busyLabel) {
    button.disabled = true;
    button.textContent = button.dataset.busyLabel;
  }
});

// ==========================================================================
// kp parts of the login and passkeys pages (kit-kp11)
// The two pages are made of kp-themes parts that need their behaviour
// attached. Only the modules a page's markup asks for are fetched, so the
// other kit pages pay nothing; every attach below is idempotent, so a part
// the shell attaches too is not attached twice.
// ==========================================================================
const PAGE_PARTS = [
  ['[data-kp-dialog], [data-kp-dialog-close]', './kp/js/overlays.js', (m, root) => m.attachDialogs(root)],
  ['.kp-switch', './kp/js/forms.js', (m, root) => m.attachSwitches(root)],
  ['[data-kp-flash-button]', './kp/js/flash.js', (m, root) => m.attachFlashButtons(root)],
  ['[data-kp-ago]', './kp/js/freshness.js', (m, root) => m.attachAgo(root)],
  ['.kp-lede', './kp/js/lede.js', (m, root) => m.attachLedes(root)],
  ['[data-kp-qr]', './kp/js/qr.js', (m, root) => m.attachQr(root)],
  ['.kp-steplist', './kp/js/steplist.js', (m, root) => m.attachSteplists(root)],
  ['[data-kp-menu-button]', './kp/js/menu-button.js', (m, root) => m.attachMenuButtons(root)],
];

async function attachPageParts(root) {
  await Promise.all(
    PAGE_PARTS.filter(([selector]) => root.querySelector(selector)).map(async ([, path, attach]) => {
      try {
        attach(await import(path), root);
      } catch (e) {
        console.warn(`chassis: ${path} did not attach`, e);
      }
    }),
  );
}

// ==========================================================================
// login (kit-kp11, approved demo "login")
// ==========================================================================
function initLogin(root) {
  // Show / Hide on the token field.
  root.addEventListener('click', (event) => {
    const peek = event.target.closest('[data-kit-peek]');
    if (!peek) return;
    const input = document.getElementById(peek.getAttribute('aria-controls'));
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    peek.textContent = show ? 'Hide' : 'Show';
    peek.setAttribute('aria-pressed', String(show));
  });

  // Caps Lock hint under the field, only while the field has focus.
  const input = root.querySelector('#token');
  const caps = root.querySelector('[data-kit-caps]');
  if (input && caps) {
    const read = (event) => {
      if (event.getModifierState) caps.hidden = !event.getModifierState('CapsLock');
    };
    input.addEventListener('keydown', read);
    input.addEventListener('keyup', read);
    input.addEventListener('blur', () => { caps.hidden = true; });
  }

  // Logging in keeps the button's width: the submit button is a kp flash
  // button, so its busy face (the theme's spinner) shares the rest face's
  // box and nothing around it moves. The form still submits as a plain POST;
  // a service that does not answer within 20 s ends the spin with a reason.
  const submit = root.querySelector('form button[type="submit"]');
  root.querySelector('form')?.addEventListener('submit', async () => {
    if (!submit) return;
    const { runFlashButton } = await import('./kp/js/flash.js');
    runFlashButton(submit, () => new Promise((resolve) => {
      window.setTimeout(() => resolve({ error: 'The service did not answer', remedy: 'Try again in a moment.' }), 20000);
    }));
  });

  readServiceHealth(root);
  attachPageParts(root);
}

// What the service says about itself before anyone is in: the open /healthz.
async function readServiceHealth(root) {
  const badge = root.querySelector('[data-kit-health-badge]');
  const words = root.querySelector('[data-kit-health-words]');
  if (!badge || !words) return;
  const say = (state, text) => {
    badge.dataset.state = state;
    words.textContent = text;
  };
  try {
    const res = await fetch('/healthz', { headers: { accept: 'application/json' }, cache: 'no-store' });
    const body = await res.json();
    if (body.status === 'ok') say('ok', 'The service is healthy');
    else say('down', 'The service is degraded');
  } catch (_) {
    say('down', 'The service did not answer');
  }
}

{
  const login = document.querySelector('[data-kit-login]');
  if (login) initLogin(login);
}

// ==========================================================================
// passkeys (kit-kp11, approved demo "passkeys-list" and "passkeys-qr")
// The list is a kp-themes component the server fills with the passkeys it
// holds; rename and remove go to the kit's own routes.
// ==========================================================================
function passkeyRow(p) {
  return {
    key: p.id,
    label: p.label,
    kind: 'passkey',
    createdAt: Date.parse(p.created_at),
    lastUsedAt: p.last_used_at ? Date.parse(p.last_used_at) : null,
    current: Boolean(p.current),
  };
}

// The kit's refusal shape ({ error, remedy }) as the one sentence the list shows.
async function refused(res) {
  const body = await res.json().catch(() => ({}));
  throw new Error([body.error, body.remedy].filter(Boolean).join('. ') || `HTTP ${res.status}`);
}

// A name for this device to start the dialog with: "Firefox on Linux".
function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux|X11/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

async function initPasskeys(root) {
  const list = root.querySelector('[data-kp-passkeys]');
  const name = root.querySelector('[data-kit-device-name]');
  if (name && !name.value) name.value = deviceName();
  // The code carries the address this page was opened at when that is the
  // https one; otherwise the address the service was told to expect.
  const qr = root.querySelector('[data-kit-qr]');
  if (qr && location.protocol === 'https:') qr.setAttribute('data-kp-qr-value', `${location.origin}/passkeys`);

  await attachPageParts(root);

  const { setPasskeys } = await import('./kp/js/passkeys.js');
  const dialog = document.getElementById('passkey-register');
  const draw = (passkeys) =>
    setPasskeys(list, {
      markCurrent: true,
      protectLast: 'off',
      rows: passkeys.map(passkeyRow),
      remove: async (row) => {
        const res = await fetch(`/api/passkeys/${encodeURIComponent(row.key)}`, { method: 'DELETE', headers: { accept: 'application/json' } });
        if (!res.ok) await refused(res);
      },
      rename: async (row, label) => {
        const res = await fetch(`/api/passkeys/${encodeURIComponent(row.key)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ name: label }),
        });
        if (!res.ok) await refused(res);
      },
    });
  let first = [];
  try {
    first = JSON.parse(list.dataset.kitPasskeys || '[]');
  } catch (_) {
    first = [];
  }
  draw(first);

  // The empty list's own Register button opens the same dialog.
  list.addEventListener('kp-passkeys-register', () => {
    if (dialog && !dialog.open) dialog.showModal();
  });
  // A new passkey: ask for the list again instead of reloading the page.
  document.addEventListener('kit-passkey-registered', async () => {
    try {
      const res = await fetch('/api/passkeys', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (res.ok) draw(await res.json());
    } catch (_) {
      // The list stays as it was; the registration itself succeeded.
    }
  });
  // More ▾ → Register on another device: bring the code into view.
  root.addEventListener('kp-menu-select', (event) => {
    if (event.detail?.value !== 'other-device') return;
    const card = document.getElementById('other-device');
    if (!card) return;
    card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    // The menu hands focus back to its button as it closes; the card takes it after.
    window.setTimeout(() => card.focus({ preventScroll: true }), 60);
  });
}

{
  const page = document.querySelector('[data-kit-passkeys-page]');
  if (page) initPasskeys(page);
}

// kit-kp11: the page-ready signal. Everything above has attached by now, so
// an app's own module can attach ITS kp modules after the kit without
// double-attaching what is listed in `attached` (the theme picker above all).
// `chassis.ready` is a promise (awaiting it after the event still works);
// `chassis:ready` fires once on document.
{
  const attached = ['theme-picker', 'contracts', 'confirmations', 'effects', 'skip-links'];
  const ready = new Promise((resolve) => {
    const done = () => {
      resolve(window.chassis);
      document.dispatchEvent(new CustomEvent('chassis:ready', { detail: { attached } }));
    };
    // Module scripts run deferred, so the document is parsed; wait a task
    // so listeners registered by sibling modules in the same pass are in.
    setTimeout(done, 0);
  });
  window.chassis = Object.freeze({ ...(window.chassis || {}), attached, ready });
}
