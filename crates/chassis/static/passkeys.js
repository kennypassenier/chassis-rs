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
  if (!res.ok) throw new Error(data.remedy ? `${data.error}. ${data.remedy}` : `HTTP ${res.status}`);
  return data;
}

function say(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

export async function registerPasskey(label, status) {
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
  say(status, 'Passkey registered.');
}

export async function loginWithPasskey(status) {
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
    const data = await res.json().catch(() => ({}));
    throw new Error(data.remedy ? `${data.error}. ${data.remedy}` : `HTTP ${res.status}`);
  }
}

document.addEventListener('click', async (event) => {
  const login = event.target.closest('[data-passkey-login]');
  const register = event.target.closest('[data-passkey-register]');
  const button = login || register;
  if (!button) return;
  const status = document.getElementById(button.dataset.status || '');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    if (login) await loginWithPasskey(status);
    else {
      const label = (document.getElementById('passkey-label') || {}).value || '';
      await registerPasskey(label, status);
      window.setTimeout(() => window.location.reload(), 600);
    }
  } catch (e) {
    say(status, e.message);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
