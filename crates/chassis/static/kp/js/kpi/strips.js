// The KPI strips of a scope: each on an allowed column count by its own width, again when tiles come, go or hide, or the face changes.

import { KPI_STRIP } from './values.js';
import { fitKpiStrip } from './columns.js';
import { ScopeWatch } from './scope.js';

export class KpiStrips extends ScopeWatch {
    /**
     * @param {ParentNode} scope
     * @param {Record<string, unknown>} [options]
     */
    constructor(scope, options) {
        super(scope, options);
        /** The strips already observed for their size. @type {Set<HTMLElement>} */
        this.watched = new Set();
        /** @type {ResizeObserver | null} */
        this.sizes = null;
    }

    connect() {
        const view = this.view;
        if (!view) return;
        this.sizes = this.observe(
            new view.ResizeObserver((entries) => {
                for (const entry of entries) {
                    const size = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
                    fitKpiStrip(/** @type {HTMLElement} */ (entry.target), size);
                }
            }),
        );
        this.scan();
        this.observe(new view.MutationObserver(() => this.scan())).observe(
            this.scope instanceof Document ? this.scope.documentElement : /** @type {Node} */ (this.scope),
            {
                subtree: true,
                childList: true,
                attributes: true,
                // A theme's type changes how wide a label is [fix-99, fix-101].
                attributeFilter: ['hidden', 'data-kp-kpis-columns', 'data-theme'],
            },
        );
        const fonts = this.doc.fonts;
        if (fonts) this.listen(fonts, 'loadingdone', () => this.scan());
    }

    /** Put every strip under the scope on its column count, and start watching the ones not watched yet. */
    scan() {
        for (const strip of /** @type {HTMLElement[]} */ ([...this.scope.querySelectorAll(KPI_STRIP)])) {
            if (!this.watched.has(strip)) {
                this.watched.add(strip);
                this.sizes?.observe(strip);
            }
            fitKpiStrip(strip);
        }
    }
}
