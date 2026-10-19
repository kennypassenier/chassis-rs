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

/* ======================================================================
   status (kit-kp11)
   The status page as an operations page. The server draws the first
   paint; this block attaches the kp modules the page uses, keeps the page
   fresh from /api/kit/status (the refresh control, a failed health row's
   Retry, a section card's Try again), runs the section buttons that keep
   the page, and loads the cards that read their own JSON. Nothing here
   touches another page: it starts only where [data-chassis-status] is.
   ====================================================================== */
const statusRoot = document.querySelector('[data-chassis-status]');
if (statusRoot) {
  startStatus(statusRoot).catch((error) => console.error('chassis status page', error));
}

async function startStatus(root) {
  const kp = (name) => import(`./kp/js/${name}.js`);
  const { restoreRemembered, attachRemembered } = await kp('remember');
  restoreRemembered(root);
  attachRemembered(root);

  // Only what this page carries is fetched, as kp-themes' auto.js does; the
  // theme picker and the confirmations are chassis.js's own and stay single.
  const modules = [
    ['freshness', '[data-kp-ago]', (m) => m.attachAgo(root)],
    ['auto-refresh', '[data-kp-refresh]', (m) => m.attachRefresh(root)],
    ['patterns', '[data-kp-copy]', (m) => m.attachPatterns(root)],
    ['version-delta', '[data-kp-version-to]', (m) => m.attachVersionDeltas(root)],
    ['uptime', '[data-kp-uptime]', (m) => m.attachUptimes(root)],
    ['problems', '[data-kp-problems]', (m) => m.attachProblems(root)],
    ['kpi', '.kp-kpis[data-kp-kpis-columns]', (m) => m.attachKpiStrips(root)],
    ['statusrow', '.kp-statuslist', (m) => m.attachStatusLists(root)],
    ['card-state', '.kp-card[data-kp-state]', (m) => m.attachCardStates(root)],
    ['flash', '[data-kp-flash-button]', (m) => m.attachFlashButtons(root)],
    ['datatable', '[data-kp-datatable]', (m) => m.attachDataTables(root)],
    ['tables', '.kp-table-wrap', (m) => m.attachTableRegions(root)],
    ['menu-button', '[data-kp-menu-button]', (m) => m.attachMenuButtons(root)],
    ['lede', '.kp-lede', (m) => m.attachLedes(root)],
    ['attention', '.kp-attention', (m) => m.attachAttention(root)],
    ['loading-pieces', '.kp-kpi, .kp-card, [data-kp-datatable], [data-kp-menu-button]', (m) => m.attachLoadingPieces(root)],
    ['footprint', '.kp-ops', (m) => m.attachFootprints(root)],
    ['motion', '.kp-card, .kp-datatable, .kp-toasts', (m) => m.attachMotion(root)],
  ];
  await Promise.all(
    modules
      .filter(([, when]) => root.querySelector(when))
      .map(async ([name, , attach]) => attach(await kp(name))),
  );
  if (root.querySelector('[data-kp-disabled-reason]')) (await kp('reason')).attachDisabledReasons(root);

  const { setProblems } = await kp('problems');
  const { setUptime } = await kp('uptime');
  const { setStatus } = await kp('statusrow');
  const { setCardState } = await kp('card-state');
  const { runFlashButton } = await kp('flash');
  const { toast } = await kp('overlays');
  const { refreshOf } = await kp('auto-refresh');
  const { attachAgo } = await kp('freshness');
  const { attachVersionDeltas } = await kp('version-delta');
  const { attachStatusLists } = await kp('statusrow');
  const { attachDataTables } = await kp('datatable');
  const { attachKpiStrips } = await kp('kpi');

  const say = (text) => toast(text, { ms: 3200 });
  const BRUSSELS = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const HOURS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // dd/mm/yyyy HH:mm, 24 hours (UI principles, rule 52).
  function when(iso) {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return iso;
    const p = Object.fromEntries(BRUSSELS.formatToParts(t).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  }
  const stampTimes = (scope) => {
    for (const el of scope.querySelectorAll('time[data-chassis-when]')) {
      el.textContent = when(el.getAttribute('datetime'));
      el.title = el.getAttribute('datetime');
    }
  };
  const esc = escapeHtml;
  const plural = (word, n) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* ---------------------------------------------------------- bodies -- */
  const kvHtml = (pairs) =>
    `<dl class="kp-kv kp-kv--lines" data-chassis-rows>${pairs
      .map(([l, v]) => `<div class="kp-kv__row"><dt>${esc(l)}</dt><dd>${v.html ?? esc(v)}</dd></div>`)
      .join('')}</dl>`;
  const kpisHtml = (list, label) =>
    `<div class="kp-kpis" role="group" aria-label="${esc(label)}">${list
      .map(
        (k) =>
          `<div class="kp-kpi"${k.tone ? ` data-kp-tone="${esc(k.tone)}"` : ''}><span class="kp-kpi__label">${esc(k.label)}</span><span class="kp-kpi__value">${esc(k.value)}</span>${k.note ? `<span class="kp-kpi__trend">${esc(k.note)}</span>` : ''}</div>`,
      )
      .join('')}</div>`;
  const checkState = (c) => (c.state === 'failed' || c.state === 'warn' ? c.state : c.ok === false ? 'failed' : 'ok');
  const checksHtml = (list, label) =>
    `<ul class="kp-statuslist kp-statuslist--rows" aria-label="${esc(label)}">${list
      .map(
        (c) =>
          `<li class="kp-statusrow" data-state="${checkState(c)}" data-kp-status-id="${esc(c.name)}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${esc(c.name)}</span><span class="kp-statusrow__detail">${esc(c.detail ?? '')}</span></span></li>`,
      )
      .join('')}</ul>`;
  const sortsOf = (columns, rows) =>
    columns.map((_, c) => {
      const cells = rows.map((r) => String(r[c] ?? '').trim()).filter(Boolean);
      return cells.length && cells.every((s) => Number.isFinite(Number(s))) ? 'number' : 'text';
    });
  const tableHtml = (slug, title, { columns, rows, key = 0 }) => {
    const sorts = sortsOf(columns, rows);
    return `<div class="kp-datatable" data-kp-datatable data-kp-page-size="5" data-kp-remember="status-${esc(slug)}"><div class="kp-table-wrap"><table class="kp-table"><caption class="kp-sr-only">${esc(title)}</caption><thead><tr>${columns
      .map((c, i) => `<th scope="col" data-kp-sort="${sorts[i]}">${esc(c)}</th>`)
      .join('')}</tr></thead><tbody>${rows
      .map(
        (r) =>
          `<tr data-kp-row-key="${esc(r[key] ?? '')}">${r.map((cell, i) => `<td${sorts[i] === 'number' ? ' class="kp-numeric"' : ''}>${esc(cell)}</td>`).join('')}</tr>`,
      )
      .join('')}</tbody></table></div></div>`;
  };

  // What a JSON answer becomes, by the render a section named (JsonRender).
  const label = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]+/g, ' ');
  const scalar = (key, v) => {
    if (key === 'status' && typeof v === 'string') {
      const state = v === 'ok' ? 'ok' : v === 'degraded' ? 'warn' : 'down';
      return { html: `<span class="kp-health" data-state="${state}"><span class="kp-health__dot" aria-hidden="true"></span> ${esc(v)}</span>` };
    }
    if (key === 'version') return { html: `<span class="mono">${esc(v)}</span>` };
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };
  function jsonPairs(data) {
    if (Array.isArray(data)) return data.map((x) => (Array.isArray(x) ? [String(x[0]), String(x[1])] : [String(x.label ?? x.name), String(x.value ?? x.detail ?? '')]));
    const pairs = [];
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [name, sub] of Object.entries(v)) {
          if (sub && typeof sub === 'object' && 'detail' in sub) pairs.push([label(name), String(sub.detail)]);
        }
      } else pairs.push([label(k), scalar(k, v)]);
    }
    // The service's own facts first, the way a person reads them.
    return pairs;
  }
  function checksOf(data) {
    if (Array.isArray(data)) return data;
    return Object.entries(data ?? {}).map(([name, v]) => ({ name, ok: v.ok, state: v.state, detail: v.detail }));
  }
  function jsonEmpty(render, data) {
    if (render === 'table') return !(data?.rows?.length);
    if (render === 'rows') return jsonPairs(data).length === 0;
    return (Array.isArray(data) ? data : checksOf(data)).length === 0;
  }
  function jsonHtml(render, data, slug, title) {
    if (render === 'table') return tableHtml(slug, title, data);
    if (render === 'kpis') return kpisHtml(data, title);
    if (render === 'checks') return checksHtml(checksOf(data), title);
    return kvHtml(jsonPairs(data));
  }

  /* ------------------------------------------------------- the polling -- */
  const refreshEl = root.querySelector('.kp-refresh');
  let lastData = null;
  let failures = 0;
  const signatures = new Map();

  async function poll() {
    const res = await fetch('/api/kit/status', { headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'manual' });
    // A session that ended answers with the login redirect: take the reader there.
    if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 303) {
      location.reload();
      throw new Error('The session ended');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const only = (selector) => root.querySelector(selector);
  function swap(el, html, attach) {
    if (!el) return;
    el.innerHTML = html;
    attach?.(el);
  }

  function kpiTiles(d) {
    const parts = d.parts;
    const ok = parts.total - parts.failing;
    const degraded = d.health.status !== 'ok';
    const u = d.update_facts;
    const repo = d.repository_url ? ` data-kp-version-href="${esc(d.repository_url)}/releases/tag/v{to}"` : '';
    const chip = `<span class="kp-badge kp-badge--version" data-kp-version-from="${esc(d.version)}" data-kp-version-to="${esc(u.latest)}"${repo}></span>`;
    const running = u.newer
      ? `${chip} is out`
      : u.latest
        ? 'The latest release'
        : u.mode === 'unavailable'
          ? 'Updates are not available in this service'
          : 'No newer release known';
    const trend = degraded
      ? `${plural('part', parts.failing)} failing; the health check answers 503`
      : parts.total > 0
        ? 'Every part can do its work'
        : 'This service has no parts to check; being alive is the only signal';
    const meter =
      parts.total > 0
        ? `<span class="kp-kpi__meter" role="meter" aria-label="Parts that can do their work" aria-valuenow="${ok}" aria-valuemin="0" aria-valuemax="${parts.total}" style="--kp-value: ${ok / parts.total}"></span>`
        : '';
    const clients = d.clients
      ? `<a class="kp-kpi" href="${esc(d.clients.href)}" data-chassis-kpi="clients"><span class="kp-kpi__label">${esc(d.clients.label)}</span><span class="kp-kpi__value">${d.clients.active}<small>of ${d.clients.total}</small></span><span class="kp-kpi__trend">active; open the list</span></a>`
      : '';
    return `<div class="kp-kpi"${degraded ? ' data-kp-tone="destructive"' : ''} data-chassis-kpi="health"><span class="kp-kpi__label">Health</span><span class="kp-kpi__value">${degraded ? 'Degraded' : 'Healthy'}${parts.total > 0 ? `<small>${ok} of ${parts.total} parts</small>` : ''}</span><span class="kp-kpi__trend">${trend}</span>${meter}</div>
      <div class="kp-kpi" data-chassis-kpi="running"><span class="kp-kpi__label">Running</span><span class="kp-kpi__value">${esc(d.version)}</span><span class="kp-kpi__trend">${running}</span></div>
      <div class="kp-kpi" data-chassis-kpi="up"><span class="kp-kpi__label">Up for</span><span class="kp-kpi__value">${esc(d.up_for)}</span><span class="kp-kpi__trend">since <time datetime="${esc(d.started_at)}" data-chassis-when data-localised="true"></time></span></div>
      ${clients}`;
  }

  function updatesRows(d) {
    const u = d.update_facts;
    const latest = u.newer
      ? `<span class="kp-badge kp-badge--version" data-kp-version-from="${esc(d.version)}" data-kp-version-to="${esc(u.latest)}"${d.repository_url ? ` data-kp-version-href="${esc(d.repository_url)}/releases/tag/v{to}"` : ''}></span>`
      : u.latest
        ? 'You are on it'
        : '<span class="kp-kv__none">—<span class="kp-sr-only">not checked</span></span>';
    const checked = u.last_check_at
      ? `<time datetime="${esc(u.last_check_at)}" data-chassis-when data-localised="true"></time> <time class="kp-ago" data-localised="true" data-kp-ago data-kp-ago-verb="checked" datetime="${esc(u.last_check_at)}"></time>`
      : 'Never';
    return `<div class="kp-kv__row"><dt>Mode</dt><dd>${esc(u.mode_label)}</dd></div><div class="kp-kv__row"><dt>Running</dt><dd><span class="mono">${esc(d.version)}</span></dd></div><div class="kp-kv__row"><dt>Latest release</dt><dd>${latest}</dd></div><div class="kp-kv__row"><dt>Last check</dt><dd>${checked}</dd></div>`;
  }

  // One section card, brought up to date. A part is redrawn only when what
  // it shows changed, so a poll that finds nothing new touches nothing.
  function partHtml(s, part) {
    if (part.kind === 'rows') return kvHtml(part.data);
    if (part.kind === 'kpis') return kpisHtml(part.data, s.title);
    if (part.kind === 'checks') return checksHtml(part.data, s.title);
    if (part.kind === 'table') return tableHtml(s.slug, s.title, part.data);
    return null;
  }
  function updateSection(card, s, force) {
    const redraw = (key, sig, draw) => {
      const known = signatures.get(key);
      signatures.set(key, sig);
      if ((known === undefined || known === sig) && !force) return;
      draw();
    };
    if (!card.dataset.chassisKind) {
      // A section as it always was: label/value rows.
      const rows = s.body && s.body.kind === 'rows' ? s.body.data : s.rows;
      const dl = card.querySelector('dl[data-chassis-rows]');
      if (dl && rows) redraw(s.slug, JSON.stringify(rows), () => (dl.outerHTML = kvHtml(rows)));
      return;
    }
    if (card.dataset.chassisKind !== 'parts') return;
    (s.parts || []).forEach((part, i) => {
      const wrapper = card.querySelector(`[data-chassis-part="${i}"]`);
      const html = partHtml(s, part);
      if (!wrapper || html === null) return;
      redraw(`${s.slug}#${i}`, JSON.stringify(part.data), () => {
        wrapper.innerHTML = html;
        if (part.kind === 'table') attachDataTables(wrapper);
        else if (part.kind === 'checks') attachStatusLists(wrapper);
        else if (part.kind === 'kpis') attachKpiStrips(wrapper);
      });
    });
  }

  async function apply(d, { force = false } = {}) {
    lastData = d;
    // The four figures: rebuilt when they changed; the age of the service
    // is patched in place, since it moves every minute.
    const strip = only('.kp-ops__kpis .kp-kpis');
    const tiles = kpiTiles(d);
    const kpiSig = tiles.replace(/<span class="kp-kpi__value">[^<]*<\/span><span class="kp-kpi__trend">since/, '');
    const upTile = only('[data-chassis-kpi="up"] .kp-kpi__value');
    if (strip && (strip.dataset.sig !== kpiSig || force)) {
      strip.dataset.sig = kpiSig;
      strip.innerHTML = tiles;
      strip.setAttribute('data-kp-kpis-columns', `all ${d.clients ? 4 : 3} 2 1`);
      attachVersionDeltas(strip);
      attachKpiStrips(strip);
      stampTimes(strip);
    } else if (upTile) upTile.textContent = d.up_for;

    // Health rows, by part.
    const list = only('[data-chassis-health]');
    if (list) {
      const names = Object.keys(d.health.subsystems);
      const have = [...list.querySelectorAll(':scope > .kp-statusrow')].map((r) => r.getAttribute('data-kp-status-id'));
      if (names.join('\n') === have.join('\n')) {
        for (const name of names) {
          const sub = d.health.subsystems[name];
          setStatus(list, name, { state: sub.ok ? 'ok' : 'failed', detail: sub.detail });
        }
      } else {
        list.innerHTML = names
          .map((name) => {
            const sub = d.health.subsystems[name];
            return `<li class="kp-statusrow" data-state="${sub.ok ? 'ok' : 'failed'}" data-kp-status-id="${esc(name)}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${esc(name)}</span><span class="kp-statusrow__detail">${esc(sub.detail)}</span></span></li>`;
          })
          .join('');
        attachStatusLists(list.parentElement);
      }
    }

    // What needs a person.
    const box = only('[data-kp-problems]');
    if (box) setProblems(box, d.problems);

    // The updates card.
    const dl = only('[data-chassis-updates]');
    if (dl) {
      const rows = updatesRows(d);
      if (dl.dataset.sig !== rows || force) {
        dl.dataset.sig = rows;
        dl.innerHTML = rows;
        attachVersionDeltas(dl);
        attachAgo(dl);
        stampTimes(dl);
      }
    }

    // The last 48 hours.
    const up = only('[data-kp-uptime]');
    if (up) setUptime(up, { label: up.getAttribute('data-kp-uptime-label') || '', periods: d.uptime.map((p) => ({ ...p, label: HOURS.format(new Date(p.at)) })) });

    for (const s of d.sections) {
      const card = root.querySelector(`[data-chassis-section="${CSS.escape(s.slug)}"]`);
      if (card) updateSection(card, s, force);
    }
  }

  async function refreshAll({ force = false } = {}) {
    const data = await poll();
    await apply(data, { force });
    await Promise.all([...root.querySelectorAll('[data-chassis-json]')].map((card) => loadJson(card, { quiet: true })));
    return data;
  }

  /* ------------------------------------------------ the failed plate -- */
  const plateHtml = `<div class="kp-attention__item kp-alert kp-alert--destructive" role="alert" data-kp-severity="critical"><span class="kp-attention__icon" aria-hidden="true">!</span><div class="kp-attention__text"><strong><span class="kp-sr-only">Critical: </span>The status could not be read</strong><span>The service did not answer. What now: check that it is running, then try again.</span></div><div class="kp-attention__actions"><button type="button" class="kp-button kp-button--sm" data-chassis-retry>Try again</button></div></div>`;
  function showFailure(on) {
    const ops = root;
    let plate = ops.querySelector(':scope > [data-chassis-plate]');
    if (on && !plate) {
      plate = document.createElement('div');
      plate.className = 'kp-ops__attention kp-attention';
      plate.setAttribute('data-chassis-plate', '');
      plate.innerHTML = plateHtml;
      ops.querySelector('.kp-ops__attention')?.after(plate);
      ops.setAttribute('data-kp-state', 'error');
    } else if (!on && plate) {
      plate.remove();
      ops.removeAttribute('data-kp-state');
    }
  }
  root.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-chassis-retry]')) return;
    try {
      await refreshAll({ force: true });
      failures = 0;
      showFailure(false);
    } catch (_) {
      /* the plate stays */
    }
  });

  // The refresh control: the app fetches, the control keeps the line.
  refreshEl?.addEventListener('kp-refresh', async (event) => {
    const { done } = event.detail;
    try {
      await refreshAll();
      failures = 0;
      showFailure(false);
      done(true);
    } catch (_) {
      failures += 1;
      // One blip is the refresh line's to report; a second in a row means
      // the numbers on the page can no longer be trusted.
      if (failures >= 2) showFailure(true);
      done(false);
    }
  });

  // A failed row's Retry reads the status again; the rest of the page
  // follows, so a row never keeps saying "loading".
  root.addEventListener(
    'kp-status-retry',
    async (event) => {
      const list = event.target.closest('.kp-statuslist');
      const id = event.detail?.id ?? event.detail?.key;
      if (list && id) setStatus(list, id, { state: 'loading', detail: 'Reading again…' });
      try {
        await refreshAll({ force: true });
      } catch (_) {
        if (list && id) setStatus(list, id, { state: 'failed', detail: 'The service did not answer' });
      }
    },
    true,
  );

  /* ------------------------------------------- cards that read JSON -- */
  async function loadJson(card, { quiet = false } = {}) {
    const url = card.dataset.chassisJson;
    const render = card.dataset.chassisRender || 'rows';
    const slug = card.dataset.chassisSection;
    const title = card.querySelector('.kp-card__title')?.textContent ?? '';
    const body = card.querySelector('[data-chassis-part="0"]');
    if (!quiet) setCardState(card, 'loading', { words: 'Reading…' });
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok && !(data && typeof data === 'object' && 'status' in data)) throw new Error(data?.remedy || data?.error || `HTTP ${res.status}`);
      if (data === null) throw new Error('The answer is not JSON');
      if (jsonEmpty(render, data)) {
        body.innerHTML = '';
        setCardState(card, 'empty', { title: 'Nothing to show yet', text: 'It fills when the service has something to report.' });
        return;
      }
      body.innerHTML = `${jsonHtml(render, data, slug, title)}<p class="kp-text-muted chassis-status__read"><time class="kp-ago" data-localised="true" data-kp-ago data-kp-ago-verb="read" datetime="${new Date().toISOString()}"></time></p><div class="kp-row section-actions"><button type="button" class="kp-button" data-kp-flash-button data-kp-flash-words="Read,Refused" data-chassis-read-again>Read again</button></div>`;
      attachAgo(body);
      attachDataTables(body);
      attachStatusLists(body);
      attachKpiStrips(body);
      (await kp('flash')).attachFlashButtons(body);
      setCardState(card, 'ready');
    } catch (error) {
      if (quiet && card.getAttribute('data-kp-state') === 'ready') return; // stale data stays readable
      setCardState(card, 'error', { title: 'This section could not be read', text: `${error.message || error}. Nothing was changed.`, action: 'Try again' });
    }
  }
  root.addEventListener('kp-card-retry', (event) => {
    const card = event.target.closest('[data-chassis-json]');
    if (card) loadJson(card);
  });

  /* ------------------------------------------------------ the buttons -- */
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chassis-flash], [data-chassis-read-again], [data-chassis-update-check]');
    if (!button || !root.contains(button) || button.hasAttribute('disabled')) return;

    if (button.matches('[data-chassis-read-again]')) {
      const card = button.closest('[data-chassis-json]');
      runFlashButton(button, async () => {
        await loadJson(card, { quiet: true });
        return card.getAttribute('data-kp-state') === 'ready' ? 'Read' : { error: 'The section could not be read', remedy: 'Try again in a moment.' };
      });
      return;
    }

    if (button.matches('[data-chassis-update-check]')) {
      runFlashButton(button, async () => {
        const res = await fetch('/api/kit/status/update-check', { method: 'POST', headers: { accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body.error || `HTTP ${res.status}`, remedy: body.remedy };
        refreshAll({ force: true }).catch(() => {});
        return body.newer ? 'Update found' : 'Up to date';
      });
      return;
    }

    // A section's own button that keeps the page. A destructive one has
    // been through the confirmation dialog by the time this click arrives.
    runFlashButton(button, async () => {
      const res = await fetch(button.dataset.chassisFlash, { method: button.dataset.method || 'POST', headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || res.statusText || `HTTP ${res.status}`, remedy: body.remedy };
      const n = Number.isInteger(body.count) ? body.count : null;
      const template = n === 1 && button.dataset.chassisToastOne ? button.dataset.chassisToastOne : button.dataset.chassisToast;
      if (template && (n !== null || !template.includes('{n}'))) say(template.replaceAll('{n}', String(n)));
      else if (typeof body.message === 'string' && body.message) say(body.message);
      // What the button changed shows in its section.
      refreshAll({ force: true }).catch(() => {});
      return button.dataset.kpFlashWord || undefined;
    });
  });

  // The header's More menu.
  root.addEventListener('kp-menu-select', async (event) => {
    const value = event.detail?.value;
    if (value === 'copy-health') {
      const ok = await copyText(`${location.origin}/healthz`);
      say(ok ? 'Copied the health address' : 'Copying is not available here; the address is /healthz');
    } else if (value === 'download-json') {
      const link = document.createElement('a');
      link.href = '/api/kit/status';
      link.download = 'status.json';
      document.body.append(link);
      link.click();
      link.remove();
    }
  });

  /* ------------------------------------------------------- first paint -- */
  stampTimes(root);
  const box = only('[data-kp-problems]');
  if (box) setProblems(box, JSON.parse(box.getAttribute('data-chassis-problems') || '[]'));
  const strip = only('[data-kp-uptime]');
  if (strip) {
    const periods = JSON.parse(strip.getAttribute('data-chassis-uptime') || '[]');
    setUptime(strip, { label: strip.getAttribute('data-kp-uptime-label') || '', periods: periods.map((p) => ({ ...p, label: HOURS.format(new Date(p.at)) })) });
  }
  for (const card of root.querySelectorAll('[data-chassis-json]')) loadJson(card);
  // The page is as fresh as the moment it was drawn.
  refreshOf(refreshEl)?.now?.('now');
}
