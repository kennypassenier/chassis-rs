// The shell's keyboard layer: the "g <letter>" chords for each page, the
// commands a page offers on the Clients page, and the registration of both
// with the shortcuts sheet. Split out of shell-palette.js so the chords can be
// read apart from the palette's DOM.
import { registerShortcuts } from '../kp/js/shortcuts.js';
import { setStrings } from '../kp/js/strings.js';
import { $, $$ } from './shell-dom.js';

// Chords: "g" and the first letter of each page, in registry order;
// a letter already taken leaves that page without one.
function chordsOf(ctx) {
  const used = new Set();
  const chords = [];
  for (const a of $$('[data-chassis-go]')) {
    const letter = (a.dataset.chassisChord || ctx.label(a)).charAt(0).toLowerCase();
    if (!/^[a-z0-9]$/.test(letter) || used.has(letter)) continue;
    used.add(letter);
    const keys = `g ${letter}`;
    a.setAttribute('data-kp-keys', keys);
    const kbd = document.createElement('kbd');
    kbd.className = 'kp-palette__keys';
    kbd.textContent = keys;
    a.append(kbd);
    chords.push({ keys, what: ctx.label(a), group: 'Go to a page', run: () => ctx.go(a.href) });
  }
  return chords;
}

// What a page can do: a page offers a command by carrying
// `data-chassis-command="<name>"` on the control that does it.
function pageCommands(ctx) {
  const searchTarget = () => ctx.control('search') || $('[data-kp-datatable] input[type="search"]');
  const page = [];
  if (!ctx.onClients) return page;
  const group = `On ${ctx.clientsName}`;
  page.push({ keys: 'n', what: `Issue ${ctx.article} ${ctx.singular}`, group, when: () => !!ctx.issueTarget(), reason: 'Not offered on this page.', run: ctx.runIssue });
  page.push({ keys: '/', what: 'Search the list', group, when: () => !!searchTarget(), reason: 'This list has no search.', run: () => searchTarget()?.focus() });
  return page;
}

export function registerKeys(ctx) {
  const chords = chordsOf(ctx);
  const page = pageCommands(ctx);
  // The sheet lists the chords, then Anywhere, then this page's own keys; its
  // two fixed rows speak the kit's words.
  setStrings({ shortcutsPalette: 'Search and commands', shortcutsSheet: 'Show this sheet' });
  $('#chassis-sheet').setAttribute('data-kp-shortcuts-group', ['Go to a page', 'Anywhere', `On ${ctx.clientsName}`].join(', '));
  registerShortcuts('chassis-shell', [
    ...chords,
    // The refresh control answers R itself (js/auto-refresh.js); this row
    // is here so the sheet lists the key and dims it where it does nothing.
    { keys: 'r', what: 'Refresh the page’s data', group: 'Anywhere', when: () => !!ctx.refreshNow(), reason: 'This page has nothing to refresh.', run: () => {} },
    ...page,
  ], { layoutGuard: 'off' });
}
