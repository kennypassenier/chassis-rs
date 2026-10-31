// The shell's search palette: the chords and sheet, the page's commands,
// one entry per client, and the phone's tab bar with its More drawer.
// Split out of shell.js by responsibility; the page runs exactly as before.
// The pieces live in shell-palette-keys / -options / -clients and share one
// `ctx` object (the page facts and the palette's handle).

import { attachNavFolds, attachPalettes, palette as paletteOf, attachShortcuts, attachTabbars, attachDialogs } from '../kp/dist/kp-themes.min.js';
import { $ } from './shell-dom.js';
import { createClientCommands } from './shell-palette-clients.js';
import { registerKeys } from './shell-palette-keys.js';
import { group, option } from './shell-palette-options.js';

// The facts the pieces share: where the Clients page is, whether this is it,
// the words for a client, and the page controls the commands drive.
function buildContext(paletteEl) {
  const link = (id) => $(`[data-chassis-go="${id}"]`);
  const clientsLink = link('clients');
  const clientsPath = clientsLink ? new URL(clientsLink.href).pathname : null;
  const control = (name) => $(`[data-chassis-command="${name}"]`);
  const ctx = {
    paletteEl,
    link,
    label: (a) => a.firstChild.textContent.trim(),
    clientsPath,
    onClients: clientsPath !== null && location.pathname === clientsPath,
    clientsName: clientsLink ? clientsLink.firstChild.textContent.trim() : 'Clients',
    go: (href) => location.assign(href),
    singular: paletteEl.dataset.chassisSingular || 'client',
    plural: paletteEl.dataset.chassisPlural || 'clients',
    article: paletteEl.dataset.chassisArticle || 'a',
    control,
    issueTarget: () => control('issue') || $('#issue input, #issue'),
    refreshNow: () => $('.kp-refresh__now'),
    handle: null,
    goGroup: null,
  };
  ctx.runIssue = () => {
    const t = ctx.issueTarget();
    if (!t) return clientsPath && ctx.go(clientsPath);
    if (t.matches('input, select, textarea')) t.focus();
    else t.click();
    t.scrollIntoView?.({ block: 'center' });
  };
  return ctx;
}

// The palette's own commands: drop the status-only ones where there is no
// status page, and add "This page" with what the Clients page can do.
function addPageGroup(ctx) {
  const { paletteEl } = ctx;
  const hasStatus = !!ctx.link('status');
  for (const value of ['refresh', 'updates']) {
    const opt = $(`[data-value="${value}"]`, paletteEl);
    if (opt && !hasStatus) opt.closest('[data-kp-group]').remove();
  }
  ctx.goGroup = $('[data-chassis-group="go"]', paletteEl);
  const hereCommands = [];
  if (ctx.onClients && ctx.issueTarget()) hereCommands.push(option('issue', `Issue ${ctx.article} ${ctx.singular}`, 'Give a new program its own token', 'n'));
  if (ctx.onClients && ctx.control('filter-idle')) hereCommands.push(option('filter-idle', `Show idle ${ctx.plural}`, 'Active, but not called for a while', '', 'unused stale old'));
  if (!hereCommands.length) return;
  const g = group('This page', 'page');
  g.ul.append(...hereCommands.map((o) => { const li = document.createElement('li'); li.setAttribute('role', 'presentation'); li.append(o); return li; }));
  ctx.goGroup.after(g.li);
}

// What each command value does when the palette (or the More drawer) runs it.
function commandTable(ctx) {
  // The refresh command refreshes this page's data where it can, else opens the status page.
  const statusLink = ctx.link('status');
  return {
    refresh: () => (ctx.refreshNow() ? ctx.refreshNow().click() : statusLink && ctx.go(statusLink.href)),
    updates: () => statusLink && ctx.go(statusLink.href),
    theme: () => $('#kp-theme-menu')?.showPopover?.(),
    logout: () => $('#chassis-logout')?.requestSubmit(),
    issue: ctx.runIssue,
    'filter-idle': () => ctx.control('filter-idle')?.click(),
  };
}

function wireRun(ctx, run, sendTest) {
  ctx.paletteEl.addEventListener('kp-palette-run', (event) => {
    const { value, href } = event.detail;
    if (href) return; // a page: the palette follows the link
    if (run[value]) run[value]();
    else if (value.startsWith('manage-')) {
      const id = value.slice(7);
      const open = $(`[data-manage="${CSS.escape(id)}"]`);
      if (open) open.click();
      else if (ctx.clientsPath) ctx.go(ctx.clientsPath);
    } else if (value.startsWith('test-')) sendTest(value.slice(5));
  });
  $('[data-kp-palette-open]')?.setAttribute('aria-haspopup', 'dialog');
}

// The phone: the tab bar and its More drawer.
function attachTabbar(run, joined) {
  const tabbar = $('#chassis-tabbar');
  if (!tabbar) return;
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

// Attaches the palette, the shortcuts and the tab bar; `joined` collects the names of the kp modules attached here.
export function attachPalette(paletteEl, joined) {
  const ctx = buildContext(paletteEl);
  registerKeys(ctx);
  addPageGroup(ctx);

  // ---- attach, then add one command per client
  attachNavFolds(document);
  attachPalettes(document);
  attachShortcuts(document);
  joined.push('nav-fold', 'palette', 'shortcuts');
  ctx.handle = paletteOf(paletteEl);

  const run = commandTable(ctx);
  const clients = createClientCommands(ctx);
  wireRun(ctx, run, clients.sendTest);
  clients.wire();
  attachTabbar(run, joined);
}
