// The Clients page's manage dialogs.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { ISSUE_OPEN_KEY } from './clients-issue.js';
import { copyText } from './clipboard.js';
import { fetchToken, refusal } from './requests.js';

// ---- the manage dialogs (clients-manage) --------------------------------
// One dialog per client, rendered by the server. The parts are attached the
// first time a dialog opens (a dialog the auto-refresh replaced is a new node
// and gets its own first time). Nothing about a token is in the page: the
// secret field asks for it when it is shown or copied.

const MANAGE_MODULES = ['components', 'overlays', 'idmark', 'lede', 'flash', 'patterns', 'command', 'json-field', 'request-inspector', 'card-state', 'loading-pieces', 'motion'];
const manageReady = new WeakMap();

// What the inspector reads of a request the service captured.
function inspectorRequest(c) {
  return {
    at: c.at,
    method: c.method,
    path: c.path,
    status: c.status,
    headers: c.headers,
    body: c.body,
    bodyBytes: c.body_bytes,
    truncated: c.truncated,
    source: c.source === 'test' ? 'test' : 'client',
  };
}

export function startManageDialogs(root, load) {
  // The name in the list is a link (#manage-ID) and opens the same dialog as the button.
  root.addEventListener('click', (event) => {
    const manage = event.target.closest('[data-manage]');
    if (!manage) return;
    event.preventDefault();
    openManage(manage.dataset.manage, load);
  });
  // Back from "Open the client" or from a re-issue.
  try {
    const wanted = sessionStorage.getItem(ISSUE_OPEN_KEY);
    if (wanted) {
      sessionStorage.removeItem(ISSUE_OPEN_KEY);
      openManage(wanted, load);
    }
  } catch (_) {
    // No storage, nothing to open.
  }
}

async function openManage(id, load) {
  const dialog = document.getElementById(`manage-${id}`);
  if (!dialog || dialog.open) return;
  dialog.showModal();
  const view = await prepareManage(dialog, load);
  view.loadRequests();
}

function prepareManage(dialog, load) {
  if (!manageReady.has(dialog)) manageReady.set(dialog, wireManage(dialog, load));
  return manageReady.get(dialog);
}

async function wireManage(dialog, load) {
  const id = dialog.dataset.manageId;
  const [components, overlays, idmark, lede, flash, patterns, command, json, inspector, cardState, pieces, motion] = await Promise.all(MANAGE_MODULES.map(load));
  const $ = (selector) => dialog.querySelector(selector);

  components.attachConfirmations(dialog);
  overlays.attachDialogs(dialog);
  idmark.attachIdmarks(dialog);
  lede.attachLedes(dialog);
  flash.attachFlashButtons(dialog);
  patterns.attachPatterns(dialog);
  command.attachCommands(dialog);
  json.attachJsonFields(dialog);
  cardState.attachCardStates(dialog);
  inspector.attachRequestInspectors(dialog, { origin: location.origin });
  pieces.attachLoadingPieces(dialog);
  motion.attachMotion(dialog);

  // ---- the token: asked of the service only when it is shown or copied ----
  const secret = $('[data-manage-secret]');
  secret?.addEventListener('kp-secret-request', (event) => {
    event.preventDefault();
    const { respond, fail } = event.detail;
    fetchToken(id).then((data) => respond(data.token), fail);
  });

  // ---- the command with the real token in ----
  const copyFull = $('[data-manage-copy-full]');
  copyFull?.addEventListener('click', () =>
    flash.runFlashButton(copyFull, async () => {
      const data = await fetchToken(id);
      if (!(await copyText(data.command))) return { error: 'The browser refused to copy', remedy: 'Reveal the token and copy it by hand.' };
      return 'Copied';
    }),
  );

  // ---- the requests ----
  const host = $('[data-kp-requests]');
  async function loadRequests() {
    if (!host) return;
    // A first read or a retry shows the waiting card; a read after a test keeps the list on screen.
    if (host.dataset.kpState !== 'ready') inspector.setRequestsState(host, 'loading');
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}/requests`, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(refusal(res, await res.json().catch(() => ({}))));
      const list = await res.json();
      inspector.setRequests(host, list.map(inspectorRequest));
    } catch (e) {
      inspector.setRequestsState(host, 'error', { message: e instanceof Error && e.message ? e.message : 'The service did not answer.' });
    }
  }
  host?.addEventListener('kp-requests-retry', loadRequests);

  // ---- Send test: the body in the field, to the service's own test route ----
  const send = $('[data-manage-send]');
  const body = $('[data-manage-body]');
  send?.addEventListener('click', () =>
    flash.runFlashButton(send, async () => {
      if (body && json.jsonField(body)?.state() === 'invalid') return { error: 'The body is not valid JSON', remedy: 'Fix the line the field marks, or press Format.' };
      const res = await fetch(`/api/clients/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body ? { body: body.value } : {}),
      });
      const answer = await res.json().catch(() => ({}));
      await loadRequests();
      if (!res.ok) return { error: answer.error || `HTTP ${res.status}`, remedy: answer.remedy };
      if (answer.status >= 400) return { error: `The test route answered ${answer.status}`, remedy: 'Open the request in the list to read the answer.' };
      return 'Sent';
    }),
  );

  // A re-issued token is shown again from the page that comes back.
  $('[data-manage-reissue]')?.addEventListener('kp-flash', (event) => {
    if (event.detail.state !== 'success') return;
    try {
      sessionStorage.setItem(ISSUE_OPEN_KEY, id);
    } catch (_) {
      // Without storage the page just reloads.
    }
  });

  return { loadRequests };
}
