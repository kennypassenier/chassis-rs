// The passkeys page.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachPageParts } from './page-parts.js';

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

// One sentence from a message that may lack its capital or full stop.
function sentence(text) {
  const t = String(text || '').trim();
  if (!t) return t;
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
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

  // The two data parts show the package's own loading state from the first
  // moment (its busy card, the theme's own loading animation) instead of an empty box
  // while their modules load; the QR code is drawn here, so its loading ends
  // the moment its module attached.
  const [{ setPasskeys }, qrModule] = await Promise.all([import('../kp/js/passkeys.js'), qr ? import('../kp/js/qr.js') : null]);
  const dialog = document.getElementById('passkey-register');
  const base = {
    markCurrent: true,
    protectLast: 'off',
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
  };
  const draw = (spec) => setPasskeys(list, { ...base, ...spec });
  draw({ state: 'loading' });
  if (qrModule) qrModule.setQr(qr, { state: 'loading' });
  await attachPageParts(root);
  if (qrModule) qrModule.setQr(qr, { value: qr.getAttribute('data-kp-qr-value') || '' });

  // Reading the list: loading while the answer is on its way, then the rows,
  // the package's empty state when there are none, its failed state (what
  // failed, and Retry) when the read did not work. The newest read wins.
  let reading = 0;
  const show = (passkeys) => {
    if (!Array.isArray(passkeys)) throw new Error('The service sent something that is not a list');
    draw({ rows: passkeys.map(passkeyRow) });
  };
  const failed = (e) => draw({ state: 'error', message: `Your ways to sign in could not be read. ${sentence(e && e.message ? e.message : '')}`.trim() });
  const reload = async () => {
    const mine = ++reading;
    draw({ state: 'loading' });
    try {
      const res = await fetch('/api/passkeys', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) await refused(res);
      const rows = await res.json();
      if (mine === reading) show(rows);
    } catch (e) {
      if (mine === reading) failed(e);
    }
  };
  try {
    show(JSON.parse(list.dataset.kitPasskeys || 'null'));
  } catch (e) {
    failed(e);
  }

  // The empty list's own Register button opens the same dialog.
  list.addEventListener('kp-passkeys-register', () => {
    if (dialog && !dialog.open) dialog.showModal();
  });
  // A new passkey: read the list again instead of reloading the page.
  document.addEventListener('kit-passkey-registered', reload);
  // The failed list's own Retry.
  list.addEventListener('kp-passkeys-retry', reload);
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
