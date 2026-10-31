// The palette's client commands (Manage, Send a test) and the Clients tab
// badge. The clients are read when the palette opens, never at load (the tab
// badge's idle count is written by the server). Loading is the palette's own
// busy card over its list, a failure its failed plate with Try again
// (kp-palette-retry) above the static pages, which stay usable.
import { setTabbarBadge, toast as shellToast } from '../kp/dist/kp-themes.min.js';
import { $ } from './shell-dom.js';
import { group, option, wrap } from './shell-palette-options.js';
import { refusal } from './requests.js';

const ago = (when) => {
  if (!when) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
};

export function createClientCommands(ctx) {
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

  const fromClients = (data) => {
    clientList = data;
    const active = data.clients.filter((c) => c.active);
    // The count on the Clients tab: how many need a look, exactly. The
    // server decides who is idle (one rule, in client_list.rs) and the
    // page's tile shows the same `counts.idle`; nothing is counted here.
    const tab = $('#chassis-tabbar [data-kp-tab="clients"]');
    if (tab) setTabbarBadge(tab, data.counts.idle);
    if (!ctx.onClients || !ctx.handle) return;
    // A retry draws the groups again; the old ones go first.
    ctx.paletteEl.querySelectorAll('[data-chassis-group="manage"], [data-chassis-group="test"]').forEach((g) => g.remove());
    const manage = group('Manage a client', 'manage');
    manage.ul.append(...active.slice(0, 5).map((c) => wrap(option(`manage-${c.id}`, `Manage ${c.name}`, `Last used ${ago(c.last_used_at)}`))));
    const groups = [manage];
    if (data.has_test_route) {
      const test = group('Send a test', 'test');
      test.ul.append(...active.slice(0, 3).map((c) => wrap(option(`test-${c.id}`, `Send a test to ${c.name}`, 'One request through the service’s own test route'))));
      groups.push(test);
    }
    const anchor = $('[data-chassis-group="page"]', ctx.paletteEl) || ctx.goGroup;
    anchor.after(...groups.filter((g) => g.ul.children.length).map((g) => g.li));
    ctx.handle.refresh();
  };

  let reading = false;
  const loadClients = () => {
    if (reading) return Promise.resolve();
    reading = true;
    ctx.handle?.setState('loading');
    return fetch('/api/kit/clients', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => { fromClients(data); ctx.handle?.setState('ready'); })
      .catch(() => ctx.handle?.setState('error', { message: 'The clients could not be read.' }))
      .finally(() => { reading = false; });
  };

  function wire() {
    if (!ctx.clientsPath) return;
    ctx.paletteEl.addEventListener('kp-palette-open', (event) => { if (event.detail?.open) loadClients(); });
    ctx.paletteEl.addEventListener('kp-palette-retry', () => loadClients());
  }

  return { sendTest, wire };
}
