// The keys a preview adds to the shortcut engine while it is open: open, download, print, and previous / next in a group.

/**
 * @param {import('../strings.js').Strings} strings
 * @param {boolean} grouped whether the preview has a group to step through
 * @param {() => import('./core.js').PreviewCore | undefined} runOf the preview's run, which exists once the viewer is open
 * @returns {import('../shortcuts.js').Shortcut[]}
 */
export function previewKeys(strings, grouped, runOf) {
    const group = strings.previewKeyGroup;
    return [
        { keys: 'o', what: strings.previewKeyOpen, group, run: () => runOf()?.pressAction('open'), when: () => runOf()?.hasAction('open') ?? false },
        {
            keys: 'd',
            what: strings.previewKeyDownload,
            group,
            run: () => runOf()?.pressAction('download'),
            when: () => runOf()?.hasAction('download') ?? false,
        },
        { keys: 'p', what: strings.previewKeyPrint, group, run: () => runOf()?.printFrame(), when: () => runOf()?.canPrint() ?? false },
        ...(grouped
            ? [
                  {
                      keys: 'ArrowLeft',
                      what: strings.previewKeyPrevious,
                      group,
                      run: () => runOf()?.step(-1),
                      when: () => runOf()?.canStep(-1) ?? false,
                  },
                  { keys: 'ArrowRight', what: strings.previewKeyNext, group, run: () => runOf()?.step(1), when: () => runOf()?.canStep(1) ?? false },
              ]
            : []),
    ];
}
