// The plate a stage shows when its content failed or cannot be shown here.

import { statePlate } from '../state-plate.js';
import { fileLink } from './actions.js';
import { make } from './make.js';

/**
 * @param {Document} doc
 * @param {'error' | 'unsupported'} state
 * @param {{ message?: string, retry?: () => void, title?: string }} detail
 * @param {readonly import('../viewer.js').ViewerAction[]} actions the viewer's actions, whose ways out an unsupported plate repeats
 * @param {import('../strings.js').Strings} strings
 */
export function buildPlate(doc, state, detail, actions, strings) {
    const shown = statePlate(doc, {
        kind: state === 'error' ? 'error' : 'empty',
        title: detail.title ?? (state === 'error' ? strings.viewerFailedTitle : strings.viewerUnsupportedTitle),
        text: detail.message ?? (state === 'error' ? strings.viewerFailedText : strings.viewerUnsupportedText),
        ...(state === 'error' && detail.retry ? { actionLabel: strings.viewerRetry, onAction: detail.retry } : {}),
    });
    if (state === 'unsupported') {
        // The two ways out stand in the plate itself, at normal size, as well as in the foot.
        const row = make(doc, 'div', 'kp-viewer__plate-actions');
        for (const action of actions) {
            if (action.kind !== 'open' && action.kind !== 'download') continue;
            const link = fileLink(doc, action, 'kp-button kp-stateplate__action');
            link.textContent = action.label ?? (action.kind === 'open' ? strings.viewerOpenNew : strings.viewerDownload);
            row.append(link);
        }
        shown.append(row);
    }
    return shown;
}
