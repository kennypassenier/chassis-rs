// One version chip's state and what it reads: its attributes as settings, the words of a level, and the small text and node helpers.

import { Controller } from '../controller.js';
import { getStrings } from '../strings.js';
import { DIGEST_SHORT_CHARS } from './values.js';
import { versionLevel } from './level.js';

/** @typedef {import('../version-delta.js').VersionLevel} VersionLevel */

/**
 * What a chip's attributes ask for.
 * @typedef {object} ChipSettings
 * @property {string} from
 * @property {string} to
 * @property {string | null} state
 * @property {'short' | 'full'} digest
 * @property {string | null} show `both`, `to` or `level`
 * @property {string} arrow
 * @property {VersionLevel} level
 */

/** @param {string} version @param {'short' | 'full'} digest */
export const shown = (version, digest) =>
    digest === 'short' && /^sha256:[0-9a-f]{13,}$/i.test(version) ? `${version.slice(0, 'sha256:'.length + DIGEST_SHORT_CHARS)}` : version;

/** @param {string | undefined} text @returns {Record<string, string>} */
export function toneMap(text) {
    /** @type {Record<string, string>} */
    const map = {};
    for (const pair of (text ?? '').split(',')) {
        const [level, tone] = pair.split(':').map((x) => x.trim());
        if (level && tone) map[level] = tone;
    }
    return map;
}

/** @param {Element} el @param {string} name */
const near = (el, name) => el.closest(`[${name}]`)?.getAttribute(name) ?? null;

export class ChipCore extends Controller {
    /**
     * @param {HTMLElement} host
     * @param {{ bigMinorApps?: readonly string[], href?: string | null }} [options]
     */
    constructor(host, options = {}) {
        super(host, options);
        /** The page's defaults for every chip. @type {{ bigMinorApps?: readonly string[], href?: string | null }} */
        this.defaults = options;
        this.doc = host.ownerDocument;
        /** The chip's classes before it was drawn, put back on detach. */
        this.before = host.className;
    }

    /** A span (or another tag) with a class. @param {string} className @param {string} [tag] */
    part(className, tag = 'span') {
        const node = this.doc.createElement(tag);
        node.className = className;
        return node;
    }

    /** One version as text parts a long value may break between (after a dot, a hyphen or an underscore). @param {string} text */
    breakable(text) {
        const frag = this.doc.createDocumentFragment();
        const parts = text.split(/(?<=[._:-])/);
        parts.forEach((part, i) => {
            if (i > 0) frag.append(this.doc.createElement('wbr'));
            frag.append(part);
        });
        return frag;
    }

    /** The word for a level. @param {VersionLevel} level */
    levelWord(level) {
        const s = getStrings();
        return {
            major: s.versionMajor,
            minor: s.versionMinor,
            patch: s.versionPatch,
            other: s.versionOther,
            downgrade: s.versionDowngrade,
            same: s.versionSame,
            unknown: s.versionUnknown,
        }[level];
    }

    /** Read the chip's attributes. @returns {ChipSettings} */
    settings() {
        const el = this.host;
        const from = (el.getAttribute('data-kp-version-from') ?? '').trim();
        const to = (el.getAttribute('data-kp-version-to') ?? '').trim();
        const state = el.getAttribute('data-kp-state');
        const scheme = /** @type {'numbers' | 'semver' | 'calver' | 'none'} */ (el.getAttribute('data-kp-version-scheme') ?? 'numbers');
        const listed = (near(el, 'data-kp-version-big-minor') ?? '').split(/[\s,]+/).filter(Boolean);
        const level = state
            ? 'unknown'
            : versionLevel(from, to, {
                  scheme,
                  bigAt: el.getAttribute('data-kp-version-big-at') === 'second' ? 'second' : 'first',
                  app: el.getAttribute('data-kp-version-app') ?? '',
                  bigMinorApps: [...listed, ...(this.defaults.bigMinorApps ?? [])],
                  level: /** @type {VersionLevel | 'auto'} */ (el.getAttribute('data-kp-version-level') ?? 'auto'),
              });
        return {
            from,
            to,
            state,
            digest: el.getAttribute('data-kp-version-digest') === 'full' ? 'full' : 'short',
            show: ['both', 'to', 'level'].includes(el.getAttribute('data-kp-version-show') ?? '') ? el.getAttribute('data-kp-version-show') : 'both',
            arrow: el.getAttribute('data-kp-version-arrow') ?? '→',
            level,
        };
    }
}
