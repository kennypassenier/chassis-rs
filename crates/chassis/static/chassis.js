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
// stylesheet cannot — the terminal theme's block cursor inside a focused
// field (the register paints the cell, the module writes the column), the
// themes' arrivals and reveals. The kit's own pages carry no reveal hooks,
// so on them the module does the caret and the arrival only.
//
// The caret is bound at attach time and only if the theme active at that
// moment answers `--kp-caret: block`; a page loaded in formal and switched
// to terminal would keep the browser's caret. Measured 2026-09-09: detach()
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

function copyLegacy(text) {
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.left = '-9999px';
  document.body.appendChild(scratch);
  scratch.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (_) {
    copied = false;
  }
  document.body.removeChild(scratch);
  return copied;
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
