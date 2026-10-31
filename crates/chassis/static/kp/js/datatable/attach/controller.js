// DataTableControl: one data table, wired. The table's parts are classes of their own (identity.js … unwire.js), made in the order
// the table is built in, each holding its share of the table's state and reaching the others through this controller.
import { Controller } from '../../controller.js';
import { paintRemembered } from '../../remember.js';
import { datatableState } from '../state.js';
import { handles } from '../instance.js';
import { TableIdentity } from './identity.js';
import { TableControls } from './controls.js';
import { TableDetails } from './details.js';
import { TableColumns } from './columns.js';
import { TableModel } from './model.js';
import { TableBusy } from './busy.js';
import { TableChrome } from './chrome.js';
import { TableFilterUi } from './filter-ui.js';
import { TableSortSetup } from './sort-setup.js';
import { TableLayoutSetup } from './layout-setup.js';
import { TableReorder } from './reorder.js';
import { TableGroups } from './groups.js';
import { TableSync } from './sync.js';
import { TableRender } from './render.js';
import { TablePills } from './pills.js';
import { TableFilterEditor } from './filter-editor.js';
import { TableApply } from './apply.js';
import { TableServer } from './server.js';
import { TableHandlers } from './handlers.js';
import { TableExpand } from './expand.js';
import { TableSelection } from './selection.js';
import { TableEdit } from './edit.js';
import { TableWrapClick } from './wrap-click.js';
import { TableWire } from './wire.js';
import { TableHandle } from './handle.js';
import { TableUnwire } from './unwire.js';
/** @typedef {import('../instance.js').DataTableHandle} DataTableHandle */
/** @typedef {import('../../remember.js').Memory} Memory */
/** @typedef {import('./types.js').DataTableCall} DataTableCall */

/** A part before `connect()` made it. */
const UNMADE = /** @type {any} */ (null);

export class DataTableControl extends Controller {
    /** @param {HTMLElement} host @param {Record<string, unknown>} [options] */
    constructor(host, options) {
        super(host, options);
        const { call } = /** @type {{ call: DataTableCall }} */ (/** @type {unknown} */ (options));
        /** The data table's wrapper. */
        this.wrap = host;
        this.table = /** @type {HTMLTableElement} */ (host.querySelector('table'));
        this.body = /** @type {HTMLTableSectionElement} */ (this.table.tBodies[0]);
        /** The attachDataTables() call that wired this table: its handles, its tables and how to wire one again. */
        this.call = call;
        /** The call's options with their defaults. */
        this.settings = call.settings;
        /** What this table remembers; painted when it is wired. @type {Memory | null} */
        this.memory = null;
        /** The methods handed out as listeners and callbacks, bound once, so the same function can be removed again. @type {Map<Function, Function>} */
        this.boundFns = new Map();
        // The parts, in the order connect() makes them.
        /** @type {TableIdentity} */ this.identity = UNMADE;
        /** @type {TableControls} */ this.controls = UNMADE;
        /** @type {TableDetails} */ this.details = UNMADE;
        /** @type {TableColumns} */ this.columns = UNMADE;
        /** @type {TableModel} */ this.model = UNMADE;
        /** @type {TableBusy} */ this.busy = UNMADE;
        /** @type {TableChrome} */ this.chrome = UNMADE;
        /** @type {TableFilterUi} */ this.filterUi = UNMADE;
        /** @type {TableSortSetup} */ this.sortSetup = UNMADE;
        /** @type {TableLayoutSetup} */ this.layoutSetup = UNMADE;
        /** @type {TableReorder} */ this.reorder = UNMADE;
        /** @type {TableGroups} */ this.groups = UNMADE;
        /** @type {TableSync} */ this.sync = UNMADE;
        /** @type {TableRender} */ this.render = UNMADE;
        /** @type {TablePills} */ this.pills = UNMADE;
        /** @type {TableFilterEditor} */ this.filterEditing = UNMADE;
        /** @type {TableApply} */ this.apply = UNMADE;
        /** @type {TableServer} */ this.server = UNMADE;
        /** @type {TableHandlers} */ this.handlers = UNMADE;
        /** @type {TableExpand} */ this.expand = UNMADE;
        /** @type {TableSelection} */ this.selection = UNMADE;
        /** @type {TableEdit} */ this.edit = UNMADE;
        /** @type {TableWrapClick} */ this.wrapClick = UNMADE;
        /** @type {TableWire} */ this.wire = UNMADE;
        /** @type {TableHandle} */ this.handle = UNMADE;
        /** @type {TableUnwire} */ this.unwire = UNMADE;
    }

    connect() {
        // The density, the columns and the sort this reader chose last time, when the table asked to be remembered [Kenny,
        // 2026-09-16]. The painter writes them as the markup a server would have rendered — `data-density`,
        // `data-kp-column-hidden`, `aria-sort` — so everything below goes on reading the markup and nothing else moves.
        this.memory = paintRemembered(this.wrap, 'datatable');
        this.wrap.dataset.kpDatatableAttached = '';
        datatableState.instances += 1;
        // Registered first, so it runs last: after the drawn selects and the scroll region are undone.
        this.own(() => this.unwire.unwire());
        this.makeParts();
    }

    /** Make the parts, each wiring its share of the table, in the order the table is built in. */
    makeParts() {
        this.identity = new TableIdentity(this);
        this.controls = new TableControls(this);
        this.details = new TableDetails(this);
        this.columns = new TableColumns(this);
        this.model = new TableModel(this);
        this.busy = new TableBusy(this);
        this.chrome = new TableChrome(this);
        this.filterUi = new TableFilterUi(this);
        this.sortSetup = new TableSortSetup(this);
        this.layoutSetup = new TableLayoutSetup(this);
        this.reorder = new TableReorder(this);
        this.groups = new TableGroups(this);
        this.sync = new TableSync(this);
        this.render = new TableRender(this);
        this.pills = new TablePills(this);
        this.filterEditing = new TableFilterEditor(this);
        this.apply = new TableApply(this);
        this.server = new TableServer(this);
        this.handlers = new TableHandlers(this);
        this.expand = new TableExpand(this);
        this.selection = new TableSelection(this);
        this.edit = new TableEdit(this);
        this.wrapClick = new TableWrapClick(this);
        this.wire = new TableWire(this);
        this.handle = new TableHandle(this);
        this.unwire = new TableUnwire(this);
    }

    /**
     * The method `fn` of `part` bound to it, the same function every time for this table, so a listener added with it can be
     * removed with it.
     * @template {(...args: any[]) => any} F
     * @param {object} part
     * @param {F} fn
     * @returns {F}
     */
    bound(part, fn) {
        let done = this.boundFns.get(fn);
        if (done === undefined) {
            done = fn.bind(part);
            this.boundFns.set(fn, /** @type {Function} */ (done));
        }
        return /** @type {F} */ (done);
    }

    /**
     * Take this table away and wire it again, for a changed option [live-options-1019]: the page's handle leaves the call's list,
     * and the new table's handle is what comes back.
     * @param {DataTableHandle} old
     * @returns {DataTableHandle | undefined}
     */
    rewire(old) {
        const { call, wrap } = this;
        this.destroy();
        call.created.splice(call.created.indexOf(old), 1);
        call.wire(wrap);
        return handles.get(wrap);
    }
}
