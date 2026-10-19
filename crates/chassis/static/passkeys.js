// Passkeys in the browser (K9): the two WebAuthn ceremonies against the
// kit's /passkeys routes. Loaded only when the page was served over HTTPS
// (the server decides; without a secure context navigator.credentials
// does not exist and none of this would run).
//
// The server speaks webauthn-rs's JSON: challenge and ids are base64url
// strings that the browser API wants as ArrayBuffers, and back again.

function b64urlToBuf(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw refusal(data, res.status);
  return data;
}

// The kit's refusal shape ({ error, remedy }) kept apart, so a flash button
// can show the short word on the button and the whole sentence under it.
function refusal(data, status) {
  const err = new Error(data.error ? data.error : `HTTP ${status}`);
  err.remedy = data.remedy || '';
  return err;
}

export async function registerPasskey(label) {
  const { ceremony, options } = await post('/passkeys/register/start');
  const pk = options.publicKey;
  pk.challenge = b64urlToBuf(pk.challenge);
  pk.user.id = b64urlToBuf(pk.user.id);
  if (pk.excludeCredentials) pk.excludeCredentials = pk.excludeCredentials.map((c) => ({ ...c, id: b64urlToBuf(c.id) }));
  const cred = await navigator.credentials.create({ publicKey: pk });
  const credential = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bufToB64url(cred.response.attestationObject),
      clientDataJSON: bufToB64url(cred.response.clientDataJSON),
    },
    extensions: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
  };
  await post('/passkeys/register/finish', { ceremony, label, credential });
}

export async function loginWithPasskey() {
  const { ceremony, options } = await post('/passkeys/login/start');
  const pk = options.publicKey;
  pk.challenge = b64urlToBuf(pk.challenge);
  if (pk.allowCredentials) pk.allowCredentials = pk.allowCredentials.map((c) => ({ ...c, id: b64urlToBuf(c.id) }));
  const cred = await navigator.credentials.get({ publicKey: pk });
  const credential = {
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufToB64url(cred.response.authenticatorData),
      clientDataJSON: bufToB64url(cred.response.clientDataJSON),
      signature: bufToB64url(cred.response.signature),
      userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
    },
    extensions: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
  };
  const res = await fetch('/passkeys/login/finish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ceremony, credential }),
    redirect: 'follow',
  });
  if (res.ok || res.redirected) {
    window.location.href = '/';
  } else {
    throw refusal(await res.json().catch(() => ({})), res.status);
  }
}

// The kit's messages are written to run into one another ("no passkeys are
// registered yet" + "log in with the token first"); on a button they stand
// as two sentences.
function sentence(text) {
  const t = String(text || '').trim();
  if (!t) return t;
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

// A browser that was closed, cancelled or has nothing to offer says so with
// one of these; the page words it, the browser's message is not for readers.
function ceremonyRefusal(e, remedy) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
    return { error: 'No passkey was offered', remedy };
  }
  if (e && e.name === 'InvalidStateError') {
    return { error: 'This device already has a passkey here', remedy: 'Pick another device, or remove the old passkey first.' };
  }
  return { error: sentence(e && e.message ? e.message : 'The passkey could not be used'), remedy: sentence((e && e.remedy) || remedy) };
}

// The two buttons are kp flash buttons: the spinner while the browser asks
// for a fingerprint, a short word after, a refusal as one sentence under it,
// and one width throughout.
document.addEventListener('click', async (event) => {
  const login = event.target.closest('[data-passkey-login]');
  const register = event.target.closest('[data-passkey-register]');
  const button = login || register;
  if (!button || button.getAttribute('aria-busy') === 'true') return;
  const { runFlashButton } = await import('./kp/js/flash.js');
  const lock = register ? holdDialog(button.closest('dialog')) : () => {};
  await runFlashButton(button, async () => {
    if (login) {
      try {
        await loginWithPasskey();
      } catch (e) {
        return ceremonyRefusal(e, 'Use the login token below.');
      }
      return 'Signed in';
    }
    const input = document.getElementById('passkey-label');
    try {
      await registerPasskey(((input || {}).value || '').trim());
    } catch (e) {
      return ceremonyRefusal(e, 'Try again, or register from another device.');
    }
    document.dispatchEvent(new CustomEvent('kit-passkey-registered'));
    window.setTimeout(() => button.closest('dialog')?.close(), 900);
    return 'Registered';
  });
  lock();
});

// While the browser asks for a fingerprint the dialog holds still: the name
// is read-only, Cancel is off (with its reason) and Escape does not close it
// under the ceremony. The flash button carries the busy face itself.
function holdDialog(dialog) {
  if (!dialog) return () => {};
  const input = dialog.querySelector('[data-kit-device-name]');
  const cancel = dialog.querySelector('[data-kit-register-cancel]');
  const keep = (event) => event.preventDefault();
  if (input) input.readOnly = true;
  if (cancel) {
    cancel.disabled = true;
    cancel.setAttribute('data-kp-disabled-reason', 'Waiting for your browser');
  }
  dialog.addEventListener('cancel', keep);
  return () => {
    if (input) input.readOnly = false;
    if (cancel) {
      cancel.disabled = false;
      cancel.removeAttribute('data-kp-disabled-reason');
    }
    dialog.removeEventListener('cancel', keep);
  };
}

// Enter in the name field registers, as the button does.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.target.matches?.('[data-kit-device-name]')) return;
  event.preventDefault();
  event.target.closest('dialog')?.querySelector('[data-passkey-register]')?.click();
});
