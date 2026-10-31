// The selector and the terminals of a command block.

/** A command block. */
export const COMMAND = '[data-kp-command]';
/** The terminals the package knows, with their prompt and the line ends that carry a command on to the next line. */
export const COMMAND_SHELLS = /** @type {const} */ ({
    wsl: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    garuda: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    bash: { prompt: '$', continues: ['\\', '|', '&&', '||'], windows: false },
    powershell: { prompt: 'PS>', continues: ['`', '|'], windows: true },
    cmd: { prompt: '>', continues: ['^'], windows: true },
});

/** What a terminal the package does not know is given. */
export const OTHER_SHELL = {
    prompt: '$',
    continues: /** @type {readonly string[]} */ ([]),
    windows: false,
};

/** How far a scrolled code block may be from an edge, in px, before that edge counts as reached. */
export const SCROLL_EDGE = 1;
