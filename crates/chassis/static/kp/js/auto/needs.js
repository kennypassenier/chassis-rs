// The loader's table in full: the three parts in the order the entries were written in, which is the order they attach in.

import { DASHBOARD_NEEDS } from './dashboard.js';
import { PAGE_NEEDS } from './page.js';
import { WIDGET_NEEDS } from './widgets.js';

/** @type {import('../auto.js').Need[]} */
export const NEEDS = [...PAGE_NEEDS, ...DASHBOARD_NEEDS, ...WIDGET_NEEDS];
