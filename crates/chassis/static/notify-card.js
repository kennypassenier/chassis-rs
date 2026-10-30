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

const root = document.querySelector('[data-notify-card]');
if (root) start(root).catch((error) => console.error('chassis notifications card', error));

async function start(card) {
  const kp = (name) => import(`./kp/js/${name}.js`);
  const [{ setCardState }, flash, forms, kpi] = await Promise.all([kp('card-state'), kp('flash'), kp('forms'), kp('kpi')]);
  const { runFlashButton, attachFlashButtons } = flash;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // dd/mm/yyyy HH:mm, 24 hours.
  const when = (iso) => {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return String(iso);
    const p = Object.fromEntries(CLOCK.formatToParts(t).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  };
  const upFirst = (t) => String(t).replace(/^\w/, (c) => c.toUpperCase());
  const sentenceOf = (body, status) =>
    body && body.error ? `${upFirst(String(body.error).replace(/\.+$/, ''))}.${body.remedy ? ` ${upFirst(String(body.remedy).replace(/\.*$/, ''))}.` : ''}` : `The service answered ${status}.`;
  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch (_) {
      throw Object.assign(new Error('The service did not answer.'), { silent: true });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(sentenceOf(data, res.status)), { status: res.status, body: data });
    return data;
  }

  const body = card.querySelector('[data-notify-body]');
  let data = null; // the last GET /api/kit/notify
  let signature = ''; // what the form was drawn from; a re-read redraws only when it moved
  let dirty = false; // the owner has typed something not saved yet

  /* ------------------------------------------------------------ pieces -- */
  const LAYER = {
    configuration: ['Locked', ''],
    page: ['Saved here', 'kp-badge--success'],
    code: ['App default', ''],
    default: ['Not set', ''],
  };
  const tag = (t) => {
    const [label, tone] = LAYER[t.layer] ?? LAYER.default;
    return `<span class="kp-badge ${tone} notify-card__tag">${label}</span>`;
  };
  const noteOf = (t, which) => {
    if (t.locked) return `Fixed: ${t.fixed.reason}. Change it there and restart the service.${t.masked ? ' Only the host is shown, because the address may hold a secret.' : ''}`;
    if (t.layer === 'page') return 'Saved on this page. “Use defaults” removes it. Leave the field empty and save to send nowhere.';
    if (t.layer === 'code') return 'The app’s own default. Type another address to replace it.';
    return which === 'primary' ? 'Not set. Type the address of a kyu topic to start sending.' : 'Not set. Without a fallback, a message the primary does not take stays on disk.';
  };

  function fieldRow(which, label, t, placeholder) {
    const id = `notify-${which}`;
    const off = t.locked;
    const value = t.address ?? '';
    return `<div class="kp-field kp-formgrid__row">
      <label class="kp-formgrid__label" for="${id}">${label}</label>
      <div class="kp-formgrid__control notify-card__control" data-kp-formgrid-span="control-value"><input class="kp-field__input" type="url" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-describedby="${id}-note"${off ? ' disabled' : ''} data-notify-field="${which}" data-notify-original="${esc(value)}">
        <p class="kp-field__help notify-card__note" id="${id}-note">${tag(t)}${esc(noteOf(t, which))}</p><span class="kp-field__error" data-notify-error="${which}" hidden></span></div>
    </div>`;
  }

  const button = (label, { id, words, kind = '', off = false, why = '' }) =>
    `<button type="button" class="kp-button${kind ? ` kp-button--${kind}` : ''}" id="${id}" data-kp-flash-button data-kp-flash-words="${esc(words)}"${off ? ` disabled aria-describedby="${why}"` : ''}>${esc(label)}</button>`;

  function targetsHtml(d) {
    return `<div class="kp-formgrid notify-card__form" data-kp-formgrid-stack="auto" role="group" aria-label="Addresses" aria-describedby="notify-explain">
      <p class="kp-dialog__note" id="notify-explain" data-kp-formgrid-span="all">The primary is a kyu topic, such as http://hub.example:8080/t/ops.alerts. The fallback is usually the household Home Assistant webhook. A value fixed by configuration cannot be changed here.</p>
      ${fieldRow('primary', 'Primary', d.primary, 'http://hub.example:8080/t/<topic>')}
      ${fieldRow('fallback', 'Fallback', d.fallback, 'https://homeassistant.example/api/webhook/<id>')}
      <div class="kp-formgrid__row kp-formgrid__row--buttons"><div class="kp-formgrid__control notify-card__control"><div class="kp-formgrid__buttons">
        ${button('Use defaults', { id: 'notify-reset', words: 'Reset,Refused', off: !d.primary.saved && !d.fallback.saved, why: 'notify-state' })}
        ${button('Save', { id: 'notify-save', words: 'Saved,Refused', kind: 'primary', off: true, why: 'notify-state' })}
      </div><p class="kp-dialog__note notify-card__saving" id="notify-state" data-notify-state role="status"></p></div></div>
    </div>`;
  }

  function factsHtml(d) {
    const o = d.outbox;
    const waiting = o.waiting;
    const trend = waiting === 0
      ? 'No messages waiting'
      : `Oldest since ${when(o.oldest_at)}; ${d.active ? 'they go out as soon as a target takes them' : 'no address is set, so they wait'}`;
    const kept = `At most ${num(o.cap)} are kept; past that the oldest are dropped${o.dropped_total ? ` (${num(o.dropped_total)} so far)` : ''}.`;
    const err = d.last_error;
    const errorHtml = err
      ? `<div class="kp-alert kp-alert--destructive" role="alert"><span class="kp-attention__icon" aria-hidden="true">!</span><div class="kp-attention__text"><strong>Last error</strong><span>${esc(err.message)}</span><time class="notify-card__when" datetime="${esc(err.at)}">${when(err.at)}</time></div></div>`
      : '<div class="kp-empty kp-stateplate kp-stateplate--empty" role="status"><strong class="kp-stateplate__title">No error recorded</strong><span class="kp-stateplate__text">The last error appears here with its time.</span></div>';
    const last = d.last_delivery
      ? `${when(d.last_delivery.at)} <span class="kp-text-muted">via the ${esc(d.last_delivery.via)}</span>`
      : '<span class="kp-text-muted">Nothing delivered yet</span>';
    return `<div class="kp-kpis" role="group" aria-label="Messages waiting on disk" data-kp-kpis-columns="all 1"><div class="kp-kpi"${waiting > 0 ? ' data-kp-tone="warning"' : ''}><span class="kp-kpi__label">Waiting on disk</span><span class="kp-kpi__value">${num(waiting)}<small>${waiting === 1 ? 'message' : 'messages'}</small></span><span class="kp-kpi__trend">${esc(trend)}</span></div></div>
      <p class="kp-text-muted notify-card__note">${esc(kept)}</p>
      <dl class="kp-kv kp-kv--lines"><div class="kp-kv__row"><dt>Last delivery</dt><dd>${last}</dd></div></dl>
      ${errorHtml}`;
  }

  function testHtml(d) {
    const off = !d.active;
    const why = off ? 'Set an address and save it first; there is nowhere to send a test message.' : 'Sends one message marked as a test to each address that is set, and shows what each answered. Nothing is queued.';
    return `<div class="notify-card__test-act">
        ${button('Send test message', { id: 'notify-test', words: 'Sent,Failed', off, why: 'notify-test-why' })}
        <p class="kp-dialog__note" id="notify-test-why">${esc(why)}</p></div>
      <div class="notify-card__test-result" id="notify-test-result" data-notify-test-result role="status" aria-live="polite">${testIdle()}</div>`;
  }
  // Until a test is sent the result area stays empty: the line under the
  // button already says what the test does (an idle plate beside the button
  // could not share its line; measured 2026-10-30).
  const testIdle = () => '';
  const OUTCOME = { delivered: 'ok', failed: 'failed', not_set: 'warn' };
  const testResult = (r) =>
    `<ul class="kp-statuslist kp-statuslist--rows" aria-label="Test result">${r.results
      .map((x) => `<li class="kp-statusrow" data-state="${OUTCOME[x.outcome] ?? 'warn'}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${upFirst(esc(x.target))}</span><span class="kp-statusrow__detail">${esc(x.detail)}</span></span></li>`)
      .join('')}</ul>`;

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
