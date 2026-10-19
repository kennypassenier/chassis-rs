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

// ====================================================================== shell ==
// kit-kp11 (Kenny approved the demo sections shell-bar, shell-phone and
// error-page, 2026-10-19): everything the bar, the search palette, the
// shortcut chords and sheet, the connection line, the phone's tab bar and
// the error page need from script. The markup is server-rendered in
// layout.html and error.html from the page registry (`nav`, `pages`); this
// block only attaches the kp modules and adds what the registry cannot say:
// the chords, one palette entry per client, the exact count on a tab.
// Merge note: this block stands alone at the end of the file.
import { attachNavFolds } from './kp/js/nav-fold.js';
import { attachPalettes, palette as paletteOf } from './kp/js/palette.js';
import { attachShortcuts, registerShortcuts } from './kp/js/shortcuts.js';
import { attachTabbars, setTabbarBadge } from './kp/js/tabbar.js';
import { attachConnection, setConnection } from './kp/js/connection.js';
import { attachArt } from './kp/js/art.js';
import { attachPatterns } from './kp/js/patterns.js';
import { attachDialogs, toast as shellToast } from './kp/js/overlays.js';
import { setStrings } from './kp/js/strings.js';

{
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const joined = [];

  // Error page: the drawing, the copy button, the way back, the time.
  attachArt(document);
  attachPatterns(document);
  joined.push('art', 'patterns');
  for (const el of $$('[data-chassis-when]')) {
    const when = new Date(el.getAttribute('datetime'));
    if (Number.isNaN(when.getTime())) continue;
    const two = (n) => String(n).padStart(2, '0');
    // dd/mm/yyyy HH:mm, 24 hours (UI_PRINCIPLES, rule 52).
    el.textContent = `${two(when.getDate())}/${two(when.getMonth() + 1)}/${when.getFullYear()} ${two(when.getHours())}:${two(when.getMinutes())}`;
    el.title = el.getAttribute('datetime');
  }
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-chassis-back]')) return;
    if (history.length > 1) history.back();
    else location.assign('/');
  });

  const paletteEl = $('#chassis-palette');
  const connectionEl = $('[data-kp-connection]');
  if (paletteEl) {
    const link = (id) => $(`[data-chassis-go="${id}"]`);
    const label = (a) => a.firstChild.textContent.trim();
    const clientsLink = link('clients');
    const clientsPath = clientsLink ? new URL(clientsLink.href).pathname : null;
    const onClients = clientsPath !== null && location.pathname === clientsPath;
    const clientsName = clientsLink ? label(clientsLink) : 'Clients';
    const go = (href) => location.assign(href);
    const singular = paletteEl.dataset.chassisSingular || 'client';
    const plural = paletteEl.dataset.chassisPlural || 'clients';

    // ---- chords: "g" and the first letter of each page, in registry order;
    // a letter already taken leaves that page without one.
    const used = new Set();
    const chords = [];
    for (const a of $$('[data-chassis-go]')) {
      const letter = label(a).charAt(0).toLowerCase();
      if (!/^[a-z0-9]$/.test(letter) || used.has(letter)) continue;
      used.add(letter);
      const keys = `g ${letter}`;
      a.setAttribute('data-kp-keys', keys);
      const kbd = document.createElement('kbd');
      kbd.className = 'kp-palette__keys';
      kbd.textContent = keys;
      a.append(kbd);
      chords.push({ keys, what: label(a), group: 'Go to a page', run: () => go(a.href) });
    }

    // ---- what a page can do: a page offers a command by carrying
    // `data-chassis-command="<name>"` on the control that does it.
    const control = (name) => $(`[data-chassis-command="${name}"]`);
    const issueTarget = () => control('issue') || $('#issue input, #issue');
    const refreshNow = () => $('.kp-refresh__now');
    const runIssue = () => {
      const t = issueTarget();
      if (!t) return clientsPath && go(clientsPath);
      if (t.matches('input, select, textarea')) t.focus();
      else t.click();
      t.scrollIntoView?.({ block: 'center' });
    };
    const searchTarget = () => control('search') || $('[data-kp-datatable] input[type="search"]');
    const page = [];
    if (onClients) {
      page.push({ keys: 'n', what: `Issue a ${singular}`, group: `On ${clientsName}`, when: () => !!issueTarget(), reason: 'Not offered on this page.', run: runIssue });
      page.push({ keys: '/', what: 'Search the list', group: `On ${clientsName}`, when: () => !!searchTarget(), reason: 'This list has no search.', run: () => searchTarget()?.focus() });
    }
    // The sheet lists the chords, then Anywhere, then this page's own keys; its
    // two fixed rows speak the kit's words.
    setStrings({ shortcutsPalette: 'Search and commands', shortcutsSheet: 'Show this sheet' });
    $('#chassis-sheet').setAttribute('data-kp-shortcuts-group', ['Go to a page', 'Anywhere', `On ${clientsName}`].join(', '));
    registerShortcuts('chassis-shell', [
      ...chords,
      // The refresh control answers R itself (js/auto-refresh.js); this row
      // is here so the sheet lists the key and dims it where it does nothing.
      { keys: 'r', what: 'Refresh the page’s data', group: 'Anywhere', when: () => !!refreshNow(), reason: 'This page has nothing to refresh.', run: () => {} },
      ...page,
    ], { layoutGuard: 'off' });

    // ---- the palette's own commands
    const hasStatus = !!link('status');
    for (const value of ['refresh', 'updates']) {
      const option = $(`[data-value="${value}"]`, paletteEl);
      if (option && !hasStatus) option.closest('[data-kp-group]').remove();
    }
    const group = (title, key) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      li.className = 'kp-palette__group';
      li.setAttribute('data-kp-group', '');
      li.dataset.chassisGroup = key;
      const span = document.createElement('span');
      span.className = 'kp-palette__group-label';
      span.textContent = title;
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'group');
      ul.setAttribute('aria-label', title);
      li.append(span, ul);
      return { li, ul };
    };
    const option = (value, text, hint, keys, words) => {
      const li = document.createElement('li');
      li.className = 'kp-palette__option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-kp-option', '');
      li.dataset.value = value;
      if (words) li.setAttribute('data-kp-words', words);
      li.append(text);
      if (hint) {
        const d = document.createElement('span');
        d.className = 'kp-palette__description';
        d.textContent = hint;
        li.append(d);
      }
      if (keys) {
        li.setAttribute('data-kp-keys', keys);
        const k = document.createElement('kbd');
        k.className = 'kp-palette__keys';
        k.textContent = keys;
        li.append(k);
      }
      return li;
    };
    const goGroup = $('[data-chassis-group="go"]', paletteEl);
    const hereCommands = [];
    if (onClients && issueTarget()) hereCommands.push(option('issue', `Issue a ${singular}`, 'Give a new program its own token', 'n'));
    if (onClients && control('filter-idle')) hereCommands.push(option('filter-idle', `Show idle ${plural}`, 'Not used for 30 days or more', '', 'unused stale old'));
    if (hereCommands.length) {
      const g = group('This page', 'page');
      g.ul.append(...hereCommands.map((o) => { const li = document.createElement('li'); li.setAttribute('role', 'presentation'); li.append(o); return li; }));
      goGroup.after(g.li);
    }
    // The refresh command refreshes this page's data where it can, else opens the status page.
    const statusLink = link('status');

    // ---- attach, then add one command per client
    attachNavFolds(document);
    attachPalettes(document);
    attachShortcuts(document);
    joined.push('nav-fold', 'palette', 'shortcuts');
    const handle = paletteOf(paletteEl);

    const run = {
      refresh: () => (refreshNow() ? refreshNow().click() : statusLink && go(statusLink.href)),
      updates: () => statusLink && go(statusLink.href),
      theme: () => $('#kp-theme-menu')?.showPopover?.(),
      logout: () => $('#chassis-logout')?.requestSubmit(),
      issue: runIssue,
      'filter-idle': () => control('filter-idle')?.click(),
    };
    paletteEl.addEventListener('kp-palette-run', (event) => {
      const { value, href } = event.detail;
      if (href) return; // a page: the palette follows the link
      if (run[value]) run[value]();
      else if (value.startsWith('manage-')) {
        const id = value.slice(7);
        const open = $(`[data-manage="${CSS.escape(id)}"]`);
        if (open) open.click();
        else if (clientsPath) go(clientsPath);
      } else if (value.startsWith('test-')) sendTest(value.slice(5));
    });
    $('[data-kp-palette-open]')?.setAttribute('aria-haspopup', 'dialog');

    let clientList = null;
    const sendTest = async (id) => {
      const c = clientList?.clients.find((x) => x.id === id);
      const name = c ? c.name : 'the client';
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(id)}/test`, { method: 'POST', headers: { accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        shellToast(res.ok ? `Sent a test to ${name}: ${body.status ?? res.status}` : refusal(res, body), { region: $('#chassis-toasts'), ms: 5000 });
      } catch (_) {
        shellToast(`Could not send a test to ${name}.`, { region: $('#chassis-toasts'), ms: 5000 });
      }
    };
    const ago = (when) => {
      if (!when) return 'never';
      const s = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 1000));
      if (s < 60) return `${s} s ago`;
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      const d = Math.floor(s / 86400);
      return `${d} ${d === 1 ? 'day' : 'days'} ago`;
    };
    // Idle: an active client with no call for 30 days (one never called counts from its issue).
    const idle = (c) => c.active && Date.now() - new Date(c.last_used_at ?? c.issued_at).getTime() >= 30 * 86400000;
    const wrap = (el) => { const li = document.createElement('li'); li.setAttribute('role', 'presentation'); li.append(el); return li; };
    const fromClients = (data) => {
      clientList = data;
      const active = data.clients.filter((c) => c.active);
      // The count on the Clients tab: how many need a look, exactly.
      const tab = $('#chassis-tabbar [data-kp-tab="clients"]');
      if (tab) setTabbarBadge(tab, data.clients.filter(idle).length);
      if (!onClients || !handle) return;
      const manage = group('Manage a client', 'manage');
      manage.ul.append(...active.slice(0, 5).map((c) => wrap(option(`manage-${c.id}`, `Manage ${c.name}`, `Last used ${ago(c.last_used_at)}`))));
      const groups = [manage];
      if (data.has_test_route) {
        const test = group('Send a test', 'test');
        test.ul.append(...active.slice(0, 3).map((c) => wrap(option(`test-${c.id}`, `Send a test to ${c.name}`, 'One request through the service’s own test route'))));
        groups.push(test);
      }
      const anchor = $('[data-chassis-group="page"]', paletteEl) || goGroup;
      anchor.after(...groups.filter((g) => g.ul.children.length).map((g) => g.li));
      handle.refresh();
    };
    if (clientsPath) {
      if (onClients && handle) handle.setState('loading');
      fetch('/api/kit/clients', { headers: { accept: 'application/json' } })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data) => { fromClients(data); handle?.setState('ready'); })
        .catch(() => handle?.setState(onClients ? 'error' : 'ready', { message: 'The clients could not be read.' }));
    }

    // ---- the phone: the tab bar and its More drawer
    const tabbar = $('#chassis-tabbar');
    if (tabbar) {
      attachDialogs(tabbar);
      attachDialogs($('#chassis-more'));
      attachTabbars(document);
      joined.push('tabbar', 'dialogs');
      $('#chassis-more')?.addEventListener('click', (event) => {
        const t = event.target.closest('[data-chassis-run]');
        if (!t) return;
        $('#chassis-more').close();
        run[t.dataset.chassisRun]?.();
      });
    }
  }

  // ---- the connection line: the page's own requests report what they see.
  if (connectionEl) {
    attachConnection(document);
    joined.push('connection');
    const realFetch = window.fetch.bind(window);
    let state = 'online';
    connectionEl.addEventListener('kp-connection-state', (event) => { state = event.detail.state; });
    const refusedWhy = async (res) => {
      const body = await res.clone().json().catch(() => ({}));
      return body.remedy || body.error || `The service answered ${res.status} to the last request.`;
    };
    const online = () => { if (state !== 'online') setConnection(connectionEl, 'online'); };
    window.fetch = async (...args) => {
      let res;
      try {
        res = await realFetch(...args);
      } catch (error) {
        if (error && error.name !== 'AbortError') setConnection(connectionEl, 'offline');
        throw error;
      }
      if ([401, 502, 503, 504].includes(res.status)) setConnection(connectionEl, 'refused', { why: await refusedWhy(res) });
      else online();
      return res;
    };
    addEventListener('offline', () => setConnection(connectionEl, 'offline'));
    addEventListener('online', () => online());
    // Retry now (and the automatic tries): ask the service's own health route.
    connectionEl.addEventListener('kp-connection-retry', async () => {
      try {
        const res = await realFetch('/healthz', { cache: 'no-store' });
        if (res.status === 503) setConnection(connectionEl, 'refused', { why: 'The service answered 503: it is not ready.' });
        else setConnection(connectionEl, 'online');
      } catch (_) {
        setConnection(connectionEl, 'offline');
      }
    });
  }

  if (window.chassis && Array.isArray(window.chassis.attached)) window.chassis.attached.push(...joined);
}
