// The Notifications card of the Status page (3.15.0, docs/NOTIFY_DESIGN.md).
//
// The server draws the frame in its loading state; this module reads
// /api/kit/notify, draws the two addresses, the facts and the test, and owns
// the card's states (the card says data-chassis-owned, so the status poll
// leaves it alone). Everything shown is read from the service: the page
// keeps no setting of its own, and a value the configuration fixes is shown
// locked with its reason.
//
// Stable control ids (listed in docs/DASHBOARD.md):
//   notify-primary, notify-fallback          the two address fields
//   notify-save, notify-reset, notify-test   the three buttons
//   notify-state, notify-test-result         the status line and the test result

import { api } from './chassis/json-api.js';
import { escapeHtml as esc } from './chassis/format-text.js';
import { factsHtml, targetsHtml, testHtml, testResult } from './chassis/notify-card-markup.js';

const root = document.querySelector('[data-notify-card]');
if (root) start(root).catch((error) => console.error('chassis notifications card', error));

async function start(card) {
  const kp = (name) => import(`./kp/js/${name}.js`);
  const [{ setCardState }, flash, forms, kpi] = await Promise.all([kp('card-state'), kp('flash'), kp('forms'), kp('kpi')]);
  const { runFlashButton, attachFlashButtons } = flash;

  const body = card.querySelector('[data-notify-body]');
  let data = null; // the last GET /api/kit/notify
  let signature = ''; // what the form was drawn from; a re-read redraws only when it moved
  let dirty = false; // the owner has typed something not saved yet

  /* ------------------------------------------------------- the draft -- */
  const field = (which) => body.querySelector(`[data-notify-field="${which}"]`);
  const changed = () => ['primary', 'fallback'].filter((w) => field(w) && !field(w).disabled && field(w).value.trim() !== field(w).dataset.notifyOriginal);

  // The buttons and the line under them follow what is typed.
  function live() {
    const save = body.querySelector('#notify-save');
    const line = body.querySelector('[data-notify-state]');
    if (!save || !data) return;
    const diff = changed();
    dirty = diff.length > 0;
    save.disabled = !dirty;
    const bothLocked = !data.can_edit;
    line.textContent = bothLocked
      ? 'Both addresses are fixed by configuration, so nothing can be saved here.'
      : dirty ? 'Not saved yet.' : data.primary.saved || data.fallback.saved ? 'This is the saved setting. “Use defaults” goes back to the app’s default.' : 'These are the defaults. Change an address to save it.';
    for (const w of ['primary', 'fallback']) setError(w, '');
  }
  function setError(which, text) {
    const el = body.querySelector(`[data-notify-error="${which}"]`);
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    field(which)?.toggleAttribute('aria-invalid', Boolean(text));
  }

  /* -------------------------------------------------------------- draw -- */
  async function attach(scope) {
    kpi.attachKpiStrips?.(scope);
    forms.attachFormgridColumns?.(scope);
    attachFlashButtons(scope);
  }

  async function paint() {
    const d = data;
    card.querySelector('[data-notify-level]').innerHTML = d.last_error && d.outbox.waiting > 0
      ? '<span class="kp-badge kp-badge--warning">Messages waiting</span>'
      : d.active ? '<span class="kp-badge kp-badge--success">Sending</span>' : '<span class="kp-badge">No address set</span>';
    const sig = JSON.stringify([d.primary, d.fallback, d.can_edit]);
    if (!body.firstElementChild) {
      body.innerHTML = `<div class="notify-card__grid">
        <div class="notify-card__targets" data-notify-targets></div>
        <div class="notify-card__facts" data-notify-facts></div>
        <div class="notify-card__test" data-notify-test></div></div>`;
      body.querySelector('[data-notify-test]').innerHTML = testHtml(d);
    }
    const facts = body.querySelector('[data-notify-facts]');
    facts.innerHTML = factsHtml(d);
    await attach(facts);
    // The form is redrawn only when the server's answer moved and nothing is being typed.
    if (sig !== signature && !dirty) {
      signature = sig;
      const host = body.querySelector('[data-notify-targets]');
      host.innerHTML = targetsHtml(d);
      await attach(host);
      const test = body.querySelector('[data-notify-test]');
      const keep = test.querySelector('[data-notify-test-result]')?.innerHTML;
      test.innerHTML = testHtml(d);
      if (keep) test.querySelector('[data-notify-test-result]').innerHTML = keep;
      await attach(test);
    }
    live();
    setCardState(card, 'ready');
  }

  let reading = null;
  async function load({ quiet = false } = {}) {
    if (reading) return reading;
    reading = (async () => {
      if (!quiet || !data) setCardState(card, 'loading', { words: 'Reading the notifications…' });
      try {
        data = await api('/api/kit/notify');
      } catch (error) {
        if (!quiet || !data) setCardState(card, 'error', { title: 'The notifications could not be read', text: `${error.message.replace(/\.*$/, '.')} Nothing was changed.`, action: 'Try again' });
        return false;
      }
      await paint();
      return true;
    })().finally(() => {
      reading = null;
    });
    return reading;
  }

  /* ----------------------------------------------------------- events -- */
  card.addEventListener('kp-card-retry', (event) => {
    event.stopPropagation();
    load();
  });
  body.addEventListener('input', (event) => {
    if (event.target.matches('[data-notify-field]')) live();
  });

  async function change(button, payload, word) {
    let answer = null;
    await runFlashButton(button, async () => {
      try {
        answer = await api('/api/kit/notify/settings', payload);
        return word;
      } catch (error) {
        const bad = /primary address/i.test(error.message) ? 'primary' : /fallback address/i.test(error.message) ? 'fallback' : null;
        if (bad) setError(bad, error.message);
        return { error: error.message.replace(/\.+$/, ''), word: 'Refused', remedy: error.body?.remedy };
      }
    });
    if (!answer) return;
    data = answer;
    dirty = false;
    signature = '';
    await paint();
  }

  body.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target || target.disabled) return;
    if (target.id === 'notify-save') {
      const payload = {};
      for (const w of changed()) payload[w] = field(w).value.trim();
      await change(target, payload, 'Saved');
    } else if (target.id === 'notify-reset') {
      await change(target, { reset: true }, 'Reset');
    } else if (target.id === 'notify-test') {
      const out = body.querySelector('[data-notify-test-result]');
      await runFlashButton(target, async () => {
        try {
          const r = await api('/api/kit/notify/test', {});
          out.innerHTML = testResult(r);
          return r.results.some((x) => x.outcome === 'failed') ? { error: 'A target did not take the test message', word: 'Failed' } : 'Sent';
        } catch (error) {
          out.innerHTML = `<div class="kp-alert kp-alert--destructive" role="alert"><span class="kp-attention__icon" aria-hidden="true">!</span><div class="kp-attention__text"><strong>The test could not be sent</strong><span>${esc(error.message)}</span></div></div>`;
          return { error: error.message.replace(/\.+$/, ''), word: 'Failed' };
        }
      });
      await load({ quiet: true });
    }
  });

  await load();
  // A quiet read every 30 seconds keeps the waiting count and the last error true.
  setInterval(() => {
    if (!document.hidden) load({ quiet: true });
  }, 30_000);
}
