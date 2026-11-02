// The login page.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { attachPageParts } from './page-parts.js';

// ==========================================================================
// login (kit-kp11, approved demo "login")
// ==========================================================================
function initLogin(root) {
  // Show / Hide on the token field.
  root.addEventListener('click', (event) => {
    const peek = event.target.closest('[data-kit-peek]');
    if (!peek) return;
    const input = document.getElementById(peek.getAttribute('aria-controls'));
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    peek.textContent = show ? 'Hide' : 'Show';
    peek.setAttribute('aria-pressed', String(show));
  });

  // Caps Lock hint under the field, only while the field has focus.
  const input = root.querySelector('#token');
  const caps = root.querySelector('[data-kit-caps]');
  if (input && caps) {
    const read = (event) => {
      if (event.getModifierState) caps.hidden = !event.getModifierState('CapsLock');
    };
    input.addEventListener('keydown', read);
    input.addEventListener('keyup', read);
    input.addEventListener('blur', () => { caps.hidden = true; });
  }

  // The form is the package's own (data-kp-form, data-kp-submit,
  // data-kp-form-summary): it names a missing token in its summary and on the
  // field, and the submit button says it is working. A valid form still goes
  // out as a plain POST (kp-themes 11.3.0 stops a valid submit by default;
  // the form says data-kp-form-native-submit), so the page changes on the
  // answer; a service that does not answer within 20 s ends the busy
  // state with a reason on the token field.
  import('../kp/dist/kp-themes.min.js').then(({ attachForms, form }) => {
    attachForms(root, { wrapper: '.kp-formgrid__control' });
    const el = root.querySelector('form[data-kp-form]');
    el?.addEventListener('kp-form-valid', (event) => {
      window.setTimeout(() => {
        if (!document.contains(el)) return;
        event.detail.done();
        form(el)?.errors({ token: 'The service did not answer. Try again in a moment.' });
      }, 20000);
    });
  });

  readServiceHealth(root);
  attachPageParts(root);
}

// What the service says about itself before anyone is in: the open /healthz.
// Three states in the line's own footprint (kit-kp11 states sweep): loading
// is the theme's own skeleton where the words go, ready and failed are the
// kp-health dot with its words; a failure also offers a normal-size Retry.
// Without script the server's own words stay, which are true: it answered.
async function readServiceHealth(root) {
  const badge = root.querySelector('[data-kit-health-badge]');
  const words = root.querySelector('[data-kit-health-words]');
  if (!badge || !words) return;
  const line = badge.closest('[data-kit-health]');
  let retry = null;
  const loading = () => {
    retry?.remove();
    retry = null;
    badge.removeAttribute('data-state');
    badge.setAttribute('aria-busy', 'true');
    const bone = document.createElement('span');
    bone.className = 'kp-skeleton';
    bone.setAttribute('aria-hidden', 'true');
    const say = document.createElement('span');
    say.className = 'kp-sr-only';
    say.textContent = 'Reading the service’s health';
    words.replaceChildren(bone, say);
  };
  const done = (state, text) => {
    badge.removeAttribute('aria-busy');
    badge.dataset.state = state;
    words.textContent = text;
    if (state === 'failed') {
      badge.dataset.state = 'down';
      retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'kp-button kp-button--sm';
      retry.textContent = 'Try again';
      retry.addEventListener('click', read);
      line.append(retry);
    }
  };
  async function read() {
    loading();
    try {
      const res = await fetch('/healthz', { headers: { accept: 'application/json' }, cache: 'no-store' });
      const body = await res.json();
      // Anyone can open this page, so it says only that the service answers:
      // whether a part of it is failing is for the signed-in Status page.
      if (body && typeof body.status === 'string') done('ok', 'The service is running');
      else done('failed', 'The service did not answer');
    } catch (_) {
      done('failed', 'The service did not answer');
    }
  }
  await read();
}

{
  const login = document.querySelector('[data-kit-login]');
  if (login) initLogin(login);
}
