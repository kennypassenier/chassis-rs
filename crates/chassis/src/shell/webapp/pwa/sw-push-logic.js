// The pure decisions of Web Push in the service worker (habits-push-1): what
// a push message becomes, and what a click on it does. No browser API is
// touched here, so a node test runs these functions as they are;
// sw-push.js (the browser part) is appended after sw.js by the server, only
// in a build with the `push` feature.
//
// The payload is the JSON `push::Push` writes: title, body, url, tag and
// actions [{action, title, url}]. Every url is a path of this origin; a url
// that points elsewhere is dropped here as well, so a worker never opens or
// posts to another site even if a message were forged.

const PUSH_ICON = '/pwa/icon-192.png';
const PUSH_BADGE = '/pwa/icon-monochrome-512.png';
const PUSH_FALLBACK_TITLE = 'Notification';

/** `url` as a path on `origin` (path, query, hash), or null for anything else. */
function pushSafePath(url, origin) {
    if (typeof url !== 'string' || url === '') return null;
    let u;
    try {
        u = new URL(url, origin);
    } catch {
        return null;
    }
    return u.origin === origin ? u.pathname + u.search + u.hash : null;
}

/**
 * The message as an object with every field present. A body that is not the
 * expected JSON (or no body at all) still yields a notification: a push that
 * shows nothing is a protocol violation browsers punish.
 */
function parsePushPayload(text, origin) {
    let raw = {};
    try {
        const parsed = text ? JSON.parse(text) : {};
        if (parsed && typeof parsed === 'object') raw = parsed;
    } catch {
        raw = { body: String(text) };
    }
    const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
    const actions = (Array.isArray(raw.actions) ? raw.actions : [])
        .map((a) => ({ action: str(a?.action), title: str(a?.title), url: pushSafePath(a?.url, origin) }))
        .filter((a) => a.action && a.title && a.url);
    return {
        title: str(raw.title) ?? PUSH_FALLBACK_TITLE,
        body: str(raw.body),
        tag: str(raw.tag),
        url: pushSafePath(raw.url, origin) ?? '/',
        actions,
    };
}

/**
 * The options for `showNotification`. A browser shows `maxActions` buttons
 * at most; the ones cut are not kept in `data` either. A tag makes a new
 * message replace the old one and `renotify` makes it alert again.
 */
function notificationOptions(payload, maxActions = 2) {
    const shown = payload.actions.slice(0, Math.max(0, maxActions));
    const options = {
        icon: PUSH_ICON,
        badge: PUSH_BADGE,
        data: { url: payload.url, actions: shown.map(({ action, url }) => ({ action, url })) },
        actions: shown.map(({ action, title }) => ({ action, title })),
    };
    if (payload.body) options.body = payload.body;
    if (payload.tag) {
        options.tag = payload.tag;
        options.renotify = true;
    }
    return options;
}

/**
 * What a click does. A known action button posts to its url; the notification
 * body (or an action this worker does not know) opens the notification's url.
 */
function clickPlan({ action, data }, origin) {
    const open = pushSafePath(data?.url, origin) ?? '/';
    if (action) {
        const hit = (data?.actions ?? []).find((a) => a.action === action);
        const url = pushSafePath(hit?.url, origin);
        if (url) return { kind: 'post', url, open };
    }
    return { kind: 'open', url: open };
}

/** The open window already showing `target`, if there is one. */
function pickClient(clients, target, origin) {
    const want = new URL(target, origin);
    return (
        clients.find((c) => {
            try {
                const u = new URL(c.url);
                return u.origin === want.origin && u.pathname === want.pathname && u.search === want.search;
            } catch {
                return false;
            }
        }) ?? null
    );
}

if (typeof module !== 'undefined') {
    module.exports = { pushSafePath, parsePushPayload, notificationOptions, clickPlan, pickClient };
}
