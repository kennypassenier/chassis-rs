// Pure: does a file satisfy an `accept` list, by the file picker's own rules.

/** Does a file satisfy an `accept` list? Same rules as the file picker's own. @param {File} file @param {string} accept */
export function acceptsFile(file, accept) {
    const rules = accept
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    if (rules.length === 0) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return rules.some((rule) => {
        if (rule.startsWith('.')) return name.endsWith(rule);
        if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
        return type === rule;
    });
}
