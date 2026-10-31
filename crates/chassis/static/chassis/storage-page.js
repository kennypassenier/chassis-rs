import { createBudgetEditor } from './storage-budget-editor.js';
import { createCards } from './storage-cards.js';
import { createCleanDialog } from './storage-clean-dialog.js';
import { createCompactDialog } from './storage-compact-dialog.js';
import { createDialogHost } from './storage-dialog.js';
import { wireDialogClicks, wireStaleness } from './storage-dialog-events.js';
import { partsAttacher } from './storage-parts.js';
import { createRefresh } from './storage-refresh.js';

/* ======================================================================
   storage (kit-storage, 3.11.0)
   The Storage page, built as Kenny approved it in the demo
   research/chassis-storage (formal, 21/10/2026 07:42: the kinds as a
   table, the kind's name typed to confirm). The server draws the frame with
   every card waiting; this block reads /api/kit/storage, fills the budget,
   the empty space and the kinds, and opens two modal dialogs:
     - clean up one kind: choose, read-only preview, typed confirmation,
       one transaction (the server counts again before it deletes);
     - compact the application file (VACUUM), on demand only.
   The figures are never in the page's source: they are read. Sizes are
   decimal and human (1 MB = 1 000 000 bytes), counts keep every digit,
   dates are dd/mm/yyyy HH:mm in Europe/Brussels (UI principles, rule 52).
   Stable control ids for the homelab Live view (docs/DASHBOARD.md):
     storage-open-clean-<kind>  a row's Clean up      storage-band-clean   the warning's button
     storage-open-compact       the card's Compact…
     storage-clean-dialog, -older, -filter-<name>, -reset, -preview,
     -continue, -confirm (the block; the field is inside), -back, -delete,
     -close, -done
     storage-compact-dialog, -run, -cancel, -done
   Starts only where [data-chassis-storage] is.
   ====================================================================== */
const storageRoot = document.querySelector('[data-chassis-storage]');
if (storageRoot) {
  startStorage(storageRoot).catch((error) => console.error('chassis storage page', error));
}

// The page's shared context: the kp modules it uses, its cards, and the
// mutable state as properties (`data`, `draft`, `dialog`, `table`). The
// factory modules read and write it and call each other through it, so
// each stays small and none needs a closure over the others.
async function buildContext(root) {
  // Every part comes from kp-themes' one bundle; the name only says which part
  // the call site wants.
  const kp = (_part) => import('../kp/dist/kp-themes.min.js');
  const [stackbar, cardState, datatable, flash, overlays] = await Promise.all([kp('stackbar'), kp('card-state'), kp('datatable'), kp('flash'), kp('overlays')]);
  const card = (key) => root.querySelector(`[data-storage-card="${key}"]`);
  const kindsCard = card('kinds');
  return {
    root,
    kp,
    overlays,
    setStackbar: stackbar.setStackbar,
    setCardState: cardState.setCardState,
    dataTable: datatable.dataTable,
    runFlashButton: flash.runFlashButton,
    attachParts: partsAttacher(kp),
    budgetCard: card('budget'),
    compactCard: card('compact'),
    kindsCard,
    // Copied from the inert template, never from the visible table: the package
    // attaches that one on its own, and an attached copy never gets a handle.
    tableSkeleton: kindsCard.querySelector('template[data-storage-table-skeleton]').innerHTML,
    narrow: matchMedia('(max-width: 639px)'),
    data: null, // the last GET /api/kit/storage
    draft: null, // { budget, warn } as typed; null when nothing differs from the saved setting
    formSignature: '',
    table: null, // the kinds table's handle
    dialog: null, // { host, dlg, kind: 'clean' | 'compact', state }
    kindById(id) {
      return this.data?.kinds.find((k) => k.id === id);
    },
  };
}

async function startStorage(root) {
  const ctx = await buildContext(root);
  const editor = createBudgetEditor(ctx);
  const refresh = createRefresh(ctx);
  Object.assign(ctx, createCards(ctx), createDialogHost(ctx), createCleanDialog(ctx), createCompactDialog(ctx));
  ctx.liveBudget = editor.liveBudget;
  ctx.paintBudgetForm = editor.paintBudgetForm;
  ctx.load = refresh.load;

  /* ----------------------------------------------------------- events -- */
  wireDialogClicks(ctx);
  editor.wire();
  refresh.wire();
  wireStaleness(ctx);
  refresh.wireTriggers();

  /* ------------------------------------------------------------- start -- */
  await ctx.mountTable();
  await ctx.attachParts(root);
  // The first read goes through the header's own control, so its line says
  // when the page was read ("updated now") and a failure shows there too.
  const { refreshOf } = await ctx.kp('auto-refresh');
  const refreshControl = refreshOf(root.querySelector('.kp-refresh'));
  if (refreshControl) refreshControl.now('now');
  else await ctx.load();
}
