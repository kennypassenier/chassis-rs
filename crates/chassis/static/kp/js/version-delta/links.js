// Pure: the GitHub repository of an upstream and the release page of a tag.

/**
 * `owner/repo` of an upstream as the fleet check names it (`github.com/owner/repo`, with a scheme, `www.` or `.git`
 * allowed); null for anything that is not a GitHub repository.
 * @param {string} upstream
 * @returns {{ owner: string, repo: string } | null}
 */
export function githubRepo(upstream) {
    const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(upstream ?? '').trim());
    if (!m || m[1] === '.' || m[1] === '..' || m[2] === '.' || m[2] === '..') return null;
    return { owner: m[1], repo: m[2] };
}

/**
 * The newer version's release page, absolute; null when the upstream is not a GitHub repository or there is no tag.
 * @param {string} upstream
 * @param {string} latest
 * @returns {string | null}
 */
export function releaseUrl(upstream, latest) {
    const r = githubRepo(upstream);
    const tag = String(latest ?? '').trim();
    if (!r || !tag) return null;
    return `https://github.com/${r.owner}/${r.repo}/releases/tag/${encodeURIComponent(tag)}`;
}
