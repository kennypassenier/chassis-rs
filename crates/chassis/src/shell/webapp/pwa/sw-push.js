// The browser part of Web Push in the service worker (habits-push-1): the
// `push` and `notificationclick` events. The decisions live in
// sw-push-logic.js, put in front of this file by the server.
//
// A button with an action posts to the app route the message named. The
// request is a plain same-origin fetch with the login cookie: the browser
// marks it `Sec-Fetch-Site: same-origin` (a worker's fetch to its own
// origin counts as same-origin), which is exactly what the kit's CSRF rule
// accepts, so no extra header or token is needed. When the post does not
// succeed (login expired, offline) the app opens at the notification's url
// instead, so the person sees what is going on rather than a silent no-op.

self.addEventListener('push', (event) => {
    const text = event.data ? event.data.text() : '';
    const payload = parsePushPayload(text, self.location.origin);
    const options = notificationOptions(payload, Notification.maxActions ?? 2);
    event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const plan = clickPlan(
        { action: event.action, data: event.notification.data },
        self.location.origin,
    );
    event.waitUntil(runClick(plan));
});

async function runClick(plan) {
    if (plan.kind === 'post') {
        const done = await postAction(plan.url);
        if (done) return;
        return showApp(plan.open);
    }
    return showApp(plan.url);
}

/** POST to an app route with the cookie; whether the app accepted it. */
async function postAction(url) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Focus the window that shows `url`, or open a new one. */
async function showApp(url) {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hit = pickClient(open, url, self.location.origin);
    if (hit) return hit.focus();
    return self.clients.openWindow(url);
}
