// The Notifications card's markup: the two address fields, the facts about
// the outbox and the test message.
// Split out of notify-card.js by responsibility; the page runs exactly as
// before.

import { escapeHtml as esc } from './format-text.js';
import { num, when } from './storage-format.js';
import { upFirst } from './json-api.js';

/* ------------------------------------------------------------ pieces -- */
export const LAYER = {
  configuration: ['Locked', ''],
  page: ['Saved here', 'kp-badge--success'],
  code: ['App default', ''],
  default: ['Not set', ''],
};
export const tag = (t) => {
  const [label, tone] = LAYER[t.layer] ?? LAYER.default;
  return `<span class="kp-badge ${tone} notify-card__tag">${label}</span>`;
};
export const noteOf = (t, which) => {
  if (t.locked) return `Fixed: ${t.fixed.reason}. Change it there and restart the service.${t.masked ? ' Only the host is shown, because the address may hold a secret.' : ''}`;
  if (t.layer === 'page') return 'Saved on this page. “Use defaults” removes it. Leave the field empty and save to send nowhere.';
  if (t.layer === 'code') return 'The app’s own default. Type another address to replace it.';
  return which === 'primary' ? 'Not set. Type the address of a kyu topic to start sending.' : 'Not set. Without a fallback, a message the primary does not take stays on disk.';
};

export function fieldRow(which, label, t, placeholder) {
  const id = `notify-${which}`;
  const off = t.locked;
  const value = t.address ?? '';
  return `<div class="kp-field kp-formgrid__row">
      <label class="kp-formgrid__label" for="${id}">${label}</label>
      <div class="kp-formgrid__control notify-card__control" data-kp-formgrid-span="control-value"><input class="kp-field__input" type="url" id="${id}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-describedby="${id}-note"${off ? ' disabled' : ''} data-notify-field="${which}" data-notify-original="${esc(value)}">
        <p class="kp-field__help notify-card__note" id="${id}-note">${tag(t)}${esc(noteOf(t, which))}</p><span class="kp-field__error" data-notify-error="${which}" hidden></span></div>
    </div>`;
}

export const button = (label, { id, words, kind = '', off = false, why = '' }) =>
  `<button type="button" class="kp-button${kind ? ` kp-button--${kind}` : ''}" id="${id}" data-kp-flash-button data-kp-flash-words="${esc(words)}"${off ? ` disabled aria-describedby="${why}"` : ''}>${esc(label)}</button>`;

export function targetsHtml(d) {
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

export function factsHtml(d) {
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
  // Only whether a token is set, never its value; the server sends no value.
  const tok = d.token ?? { set: false, env: '' };
  const tokenHtml = `<div class="kp-kv__row"><dt>Token</dt><dd data-notify-token="${tok.set ? 'set' : 'unset'}">${tok.set ? 'Token: set' : 'Token: not set'}</dd></div>`;
  const tokenNote = `The primary address’s token comes from the environment variable ${tok.env}; it is never shown or changed here.`;
  const last = d.last_delivery
    ? `${when(d.last_delivery.at)} <span class="kp-text-muted">via the ${esc(d.last_delivery.via)}</span>`
    : '<span class="kp-text-muted">Nothing delivered yet</span>';
  return `<div class="kp-kpis" role="group" aria-label="Messages waiting on disk" data-kp-kpis-columns="all 1"><div class="kp-kpi"${waiting > 0 ? ' data-kp-tone="warning"' : ''}><span class="kp-kpi__label">Waiting on disk</span><span class="kp-kpi__value">${num(waiting)}<small>${waiting === 1 ? 'message' : 'messages'}</small></span><span class="kp-kpi__trend">${esc(trend)}</span></div></div>
      <p class="kp-text-muted notify-card__note">${esc(kept)}</p>
      <dl class="kp-kv kp-kv--lines"><div class="kp-kv__row"><dt>Last delivery</dt><dd>${last}</dd></div>${tokenHtml}</dl>
      <p class="kp-text-muted notify-card__note" data-notify-token-note>${esc(tokenNote)}</p>
      ${errorHtml}`;
}

export function testHtml(d) {
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
export const testIdle = () => '';
export const OUTCOME = { delivered: 'ok', failed: 'failed', not_set: 'warn' };
export const testResult = (r) =>
  `<ul class="kp-statuslist kp-statuslist--rows" aria-label="Test result">${r.results
      .map((x) => `<li class="kp-statusrow" data-state="${OUTCOME[x.outcome] ?? 'warn'}"><span class="kp-statusrow__mark" aria-hidden="true"></span><span class="kp-statusrow__body"><span class="kp-statusrow__label">${upFirst(esc(x.target))}</span><span class="kp-statusrow__detail">${esc(x.detail)}</span></span></li>`)
      .join('')}</ul>`;
