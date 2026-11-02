// One row of the Storage page's kinds table.
// Split out of chassis.js by responsibility; the page runs exactly as
// before.

import { count, size, when } from './storage-format.js';
import { escapeHtml as esc } from './format-text.js';

export function kindRow(k, budget) {
  const share = k.bytes / budget;
  const pct = share < 0.01 ? '<1' : Math.round(share * 100);
  const line = `${k.description ? `<span class="storage-kind__about">${esc(k.description)}</span>` : ''}${k.finished_automatically ? '<span class="storage-kind__self"><span class="kp-badge">Cleans itself</span> Finished entries are removed automatically.</span>' : ''}`;
  return `<tr data-kp-row-key="${esc(k.id)}">
      <td data-label="Kind"><span class="storage-kind"><strong class="storage-kind__name">${esc(k.label)}</strong>${line}</span></td>
      <td class="kp-numeric" data-label="Amount" data-kp-sort-value="${k.rows}">${count(k.rows, k)}</td>
      <td class="kp-numeric" data-label="Size" data-kp-sort-value="${k.bytes}">${size(k.bytes)}</td>
      <td data-label="Share of the budget" data-kp-sort-value="${k.bytes}"><span class="storage-share"><span class="kp-meter" role="meter" aria-label="${esc(k.label)} share of the budget" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}" aria-valuetext="${share < 0.01 ? 'less than 1' : Math.round(share * 100)} % of the budget" style="--kp-value: ${share.toFixed(4)}"></span><span class="storage-share__n">${pct} %</span></span></td>
      <td class="kp-timestamp" data-label="Oldest" data-kp-sort-value="${k.oldest ? Date.parse(k.oldest) : 0}">${k.oldest ? when(k.oldest) : '<span class="kp-text-muted">none</span>'}</td>
      <td class="kp-timestamp" data-label="Newest" data-kp-sort-value="${k.newest ? Date.parse(k.newest) : 0}">${k.newest ? when(k.newest) : '<span class="kp-text-muted">none</span>'}</td>
      <td class="text-end storage-fit"><button type="button" class="kp-button" id="storage-open-clean-${esc(k.id)}" data-storage-cleanup="${esc(k.id)}" aria-label="Clean up ${esc(k.label)}"${k.rows ? '' : ' disabled'}>Clean up…</button></td></tr>`;
}
