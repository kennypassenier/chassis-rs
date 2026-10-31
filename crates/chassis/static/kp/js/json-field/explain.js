// What is wrong with a text as JSON, and where: the engines word it differently.

/**
 * What is wrong with `text`, and where: the engines word it differently.
 * @param {string} text
 * @returns {{ ok: true, value: unknown } | { ok: false, why: string, line: number | null, column: number | null }}
 */
export function explainJson(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        let line = null;
        let column = null;
        const at = /line (\d+) column (\d+)/i.exec(raw);
        if (at) {
            line = Number(at[1]);
            column = Number(at[2]);
        } else {
            const position = /position (\d+)/i.exec(raw);
            if (position) {
                const before = text.slice(0, Number(position[1]));
                line = before.split('\n').length;
                column = before.length - before.lastIndexOf('\n');
            }
        }
        const why = raw
            .replace(/^JSON\.parse:\s*/i, '')
            .replace(/\s+at line \d+ column \d+( of the JSON data)?/i, '')
            .replace(/\s+in JSON at position \d+( \(line \d+ column \d+\))?/i, '')
            .replace(/\s*\(line \d+ column \d+\)/i, '')
            .replace(/^./, (c) => c.toLowerCase());
        return { ok: false, why, line, column };
    }
}
