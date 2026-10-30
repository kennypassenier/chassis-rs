// The shell's search palette: the chords and sheet, the page's commands,
// one entry per client, and the phone's tab bar with its More drawer.
// Split out of shell.js by responsibility; the page runs exactly as before.

import { attachNavFolds } from '../kp/js/nav-fold.js';
import { attachPalettes, palette as paletteOf } from '../kp/js/palette.js';
import { attachShortcuts, registerShortcuts } from '../kp/js/shortcuts.js';
import { attachTabbars, setTabbarBadge } from '../kp/js/tabbar.js';
import { attachDialogs, toast as shellToast } from '../kp/js/overlays.js';
import { setStrings } from '../kp/js/strings.js';
import { $, $$ } from './shell-dom.js';
import { refusal } from './requests.js';

// Attaches the palette, the shortcuts and the tab bar; `joined` collects the names of the kp modules attached here.
export function attachPalette(paletteEl, joined) {
  const link = (id) => $(`[data-chassis-go="${id}"]`);
  const label = (a) => a.firstChild.textContent.trim();
  const clientsLink = link('clients');
  const clientsPath = clientsLink ? new URL(clientsLink.href).pathname : null;
  const onClients = clientsPath !== null && location.pathname === clientsPath;
  const clientsName = clientsLink ? label(clientsLink) : 'Clients';
  const go = (href) => location.assign(href);
  const singular = paletteEl.dataset.chassisSingular || 'client';
  const plural = paletteEl.dataset.chassisPlural || 'clients';
  const article = paletteEl.dataset.chassisArticle || 'a';

  // ---- chords: "g" and the first letter of each page, in registry order;
  // a letter already taken leaves that page without one.
  const used = new Set();
  const chords = [];
  for (const a of $$('[data-chassis-go]')) {
    const letter = (a.dataset.chassisChord || label(a)).charAt(0).toLowerCase();
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
    page.push({ keys: 'n', what: `Issue ${article} ${singular}`, group: `On ${clientsName}`, when: () => !!issueTarget(), reason: 'Not offered on this page.', run: runIssue });
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
  if (onClients && issueTarget()) hereCommands.push(option('issue', `Issue ${article} ${singular}`, 'Give a new program its own token', 'n'));
  if (onClients && control('filter-idle')) hereCommands.push(option('filter-idle', `Show idle ${plural}`, 'Active, but not called for a while', '', 'unused stale old'));
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
  const wrap = (el) => { const li = document.createElement('li'); li.setAttribute('role', 'presentation'); li.append(el); return li; };
  const fromClients = (data) => {
    clientList = data;
    const active = data.clients.filter((c) => c.active);
    // The count on the Clients tab: how many need a look, exactly. The
    // server decides who is idle (one rule, in client_list.rs) and the
    // page's tile shows the same `counts.idle`; nothing is counted here.
    const tab = $('#chassis-tabbar [data-kp-tab="clients"]');
    if (tab) setTabbarBadge(tab, data.counts.idle);
    if (!onClients || !handle) return;
    // A retry draws the groups again; the old ones go first.
    paletteEl.querySelectorAll('[data-chassis-group="manage"], [data-chassis-group="test"]').forEach((g) => g.remove());
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
  // The clients the palette lists (Manage, Send a test): read when the palette
  // opens, never at load (the tab badge's idle count is written by the
  // server). Loading is the palette's own busy card over its list, a
  // failure its failed plate with Try again (kp-palette-retry) above the
  // static pages, which stay usable.
  let reading = false;
  const loadClients = () => {
    if (reading) return Promise.resolve();
    reading = true;
    handle?.setState('loading');
    return fetch('/api/kit/clients', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => { fromClients(data); handle?.setState('ready'); })
      .catch(() => handle?.setState('error', { message: 'The clients could not be read.' }))
      .finally(() => { reading = false; });
  };
  if (clientsPath) {
    paletteEl.addEventListener('kp-palette-open', (event) => { if (event.detail?.open) loadClients(); });
    paletteEl.addEventListener('kp-palette-retry', () => loadClients());
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
