// Firefox-only browser check (never Chromium): after login, further
// page.goto calls reach the server. Regression for fix-nav-hang-1, where the
// stale-chunk guard reloaded the old page when navigation cancelled an
// in-flight import, which aborted the navigation the user had asked for.
//
// Run by hand against a running inbox example:
//   BASE=http://127.0.0.1:18777 TOKEN=<login token> node nav_after_login.spec.mjs
// PLAYWRIGHT points at the playwright package directory when it is not on
// the module path.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { firefox } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://127.0.0.1:18777';
const TOKEN = process.env.TOKEN;
assert.ok(TOKEN, 'set TOKEN to the service login token');

const browser = await firefox.launch();
try {
    const page = await (await browser.newContext()).newPage();
    const seen = [];
    page.on('request', (r) => r.isNavigationRequest() && seen.push(new URL(r.url()).pathname));

    await page.goto(`${BASE}/login`);
    await page.fill('input[name=token]', TOKEN);
    await Promise.all([page.waitForNavigation({ timeout: 8000 }), page.click('button[type=submit]')]);

    for (const path of ['/clients', '/storage']) {
        seen.length = 0;
        await page.goto(`${BASE}${path}`, { timeout: 8000 });
        assert.ok(seen.includes(path), `${path} never reached the server (saw ${seen.join(', ')})`);
        assert.equal(new URL(page.url()).pathname, path);
    }
    console.log('ok: after login, two further navigations reach the server');
} finally {
    await browser.close();
}
