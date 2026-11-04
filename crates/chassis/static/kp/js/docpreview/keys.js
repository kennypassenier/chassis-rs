// The keys a preview adds to the shortcut engine while it is open: open, download, print, and previous / next in a group.
import { resolveEngineKeys } from '../key-spec.js';
import {
    PREVIEW_DOWNLOAD_KEY,
    PREVIEW_DOWNLOAD_KEY_ATTRIBUTE,
    PREVIEW_OPEN_KEY,
    PREVIEW_OPEN_KEY_ATTRIBUTE,
    PREVIEW_PRINT_KEY,
    PREVIEW_PRINT_KEY_ATTRIBUTE,
} from './values.js';

/** @param {Element | null} host @param {string} attribute @param {unknown} option @param {string} fallback */
const keyOf = (host, attribute, option, fallback) => resolveEngineKeys(host, attribute, /** @type {string | false | undefined} */ (option), fallback);

/**
 * @param {import('../strings.js').Strings} strings
 * @param {boolean} grouped whether the preview has a group to step through
 * @param {() => import('./core.js').PreviewCore | undefined} runOf the preview's run, which exists once the viewer is open
 * @param {import('../docpreview.js').PreviewOptions} [options] the page's key options; the opener's own `data-kp-preview-*-key` attributes are read too
 * @returns {import('../shortcuts.js').Shortcut[]}
 */
export function previewKeys(strings, grouped, runOf, options = { url: '' }) {
    const group = strings.previewKeyGroup;
    const host = options.opener ?? null;
    const open = keyOf(host, PREVIEW_OPEN_KEY_ATTRIBUTE, options.openKey, PREVIEW_OPEN_KEY);
    const download = keyOf(host, PREVIEW_DOWNLOAD_KEY_ATTRIBUTE, options.downloadKey, PREVIEW_DOWNLOAD_KEY);
    const print = keyOf(host, PREVIEW_PRINT_KEY_ATTRIBUTE, options.printKey, PREVIEW_PRINT_KEY);
    /** @type {import('../shortcuts.js').Shortcut[]} */
    const keys = [];
    if (open !== null) keys.push({ keys: open, what: strings.previewKeyOpen, group, run: () => runOf()?.pressAction('open'), when: () => runOf()?.hasAction('open') ?? false });
    if (download !== null) keys.push({ keys: download, what: strings.previewKeyDownload, group, run: () => runOf()?.pressAction('download'), when: () => runOf()?.hasAction('download') ?? false });
    if (print !== null) keys.push({ keys: print, what: strings.previewKeyPrint, group, run: () => runOf()?.printFrame(), when: () => runOf()?.canPrint() ?? false });
    // Previous and next are the arrows, a standard widget key: they are not options.
    if (grouped) {
        keys.push({ keys: 'ArrowLeft', what: strings.previewKeyPrevious, group, run: () => runOf()?.step(-1), when: () => runOf()?.canStep(-1) ?? false });
        keys.push({ keys: 'ArrowRight', what: strings.previewKeyNext, group, run: () => runOf()?.step(1), when: () => runOf()?.canStep(1) ?? false });
    }
    return keys;
}
