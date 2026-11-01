// The header's one overflow menu ("More") and the page help drawer
// (ux-chassis-7 and ux-chassis-9). layout.html draws both on the server;
// this file only attaches the kp-themes behaviour and does the one thing
// the markup cannot: when kp-themes' folding bar has to fold a primary link
// because the window is narrow, the link moves into THIS menu, so a header
// never has two "More" controls (the fold's own item is hidden in CSS).

import { attachMenuButtons, attachDialogs, setMenu } from '../kp/dist/kp-themes.min.js';
import { $, $$ } from './shell-dom.js';

// What the server drew into the menu, as the groups setMenu takes.
function readGroups(menu) {
  return $$('.kp-menu__group', menu)
    .map((block) => ({
      group: block.getAttribute('aria-label') || '',
      items: $$('[role="menuitem"]', block).map((el) => ({
        label: $('.kp-menu__label', el)?.textContent ?? '',
        hint: $('.kp-menu__hint', el)?.textContent ?? '',
        href: el.getAttribute('href') ?? undefined,
        value: el.dataset.kpValue,
      })),
    }))
    .filter((g) => g.items.length);
}

// The links the bar folded, as one more group at the top of the menu.
function foldedGroup(items) {
  return {
    group: 'In the bar when there is room',
    items: items
      .map((li) => li.querySelector('a'))
      .filter(Boolean)
      .map((a) => ({ label: a.textContent.trim(), href: a.getAttribute('href') })),
  };
}

function mergeFolded(nav, wrapper, fixed) {
  nav.addEventListener('kp-nav-fold', (event) => {
    const folded = foldedGroup(event.detail.items);
    setMenu(wrapper, folded.items.length ? [folded, ...fixed] : fixed);
  });
}

export function attachHeaderMenus(joined) {
  const nav = $('.kp-nav');
  const wrapper = $('[data-chassis-nav-more] .kp-menu-button', nav ?? document);
  if (wrapper) {
    attachMenuButtons(wrapper.parentElement);
    mergeFolded(nav, wrapper, readGroups($('.kp-menu', wrapper)));
    joined.push('nav-more');
  }
  const help = $('#chassis-help');
  if (help) {
    attachDialogs($('[data-chassis-help-open]')?.parentElement ?? document);
    attachDialogs(help);
    joined.push('help-drawer');
  }
}
