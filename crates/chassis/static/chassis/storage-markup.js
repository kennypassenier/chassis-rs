// Small markup pieces the Storage page's cards and dialogs share: a step, a
// figure and a flash button.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { escapeHtml as esc } from './format-text.js';

export const stepItem = (id, title, noteText, state) =>
  `<li class="kp-steplist__item" data-state="${state}" data-kp-step-id="${id}"><span class="kp-steplist__mark" aria-hidden="true"></span><span class="kp-steplist__body"><span class="kp-steplist__title">${title}</span><span class="kp-steplist__note">${noteText}</span></span></li>`;
export const figure = (label, value, noteText) =>
  `<div class="kp-kpi"><span class="kp-kpi__label">${label}</span><span class="kp-kpi__value">${value}</span><span class="kp-kpi__trend">${noteText}</span></div>`;
export const flashButton = (label, { words, kind = '', attrs = '' }) =>
  `<button type="button" class="kp-button${kind ? ` kp-button--${kind}` : ''}" data-kp-flash-button data-kp-flash-words="${esc(words)}" ${attrs}>${esc(label)}</button>`;
